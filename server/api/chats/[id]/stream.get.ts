import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../../utils/supabase'

type MessageRow = {
  id: number
  chat_id: number
  author_id: string
  content: string
  created_at: string
  external_id?: number | null
  direction?: string | null
  status?: string | null
}

export default eventHandler(async (event) => {
  const chatId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(chatId) || chatId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный id чата.' })
  }

  // SSE headers
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache, no-transform')
  setHeader(event, 'Connection', 'keep-alive')
  // @ts-expect-error Node response exists in Nitro
  event.node.res.flushHeaders?.()

  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)
  const supabase = createClient(url, serviceRoleKey, {
    realtime: { params: { eventsPerSecond: 10 } }
  })

  const querySince = getQuery(event).since
  let lastCreatedAt = typeof querySince === 'string' && querySince.length ? querySince : null
  let channel: RealtimeChannel | null = null

  const write = (payload: unknown) => {
    // @ts-expect-error write is available in Node response
    event.node.res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }

  write({ type: 'ready', chatId })

  async function backfill() {
    try {
      const query: Record<string, string> = {
        select: 'id,chat_id,author_id,content,created_at,external_id,direction,status',
        chat_id: `eq.${chatId}`,
        order: 'created_at.desc',
        limit: '50'
      }

      if (lastCreatedAt) {
        query.created_at = `gt.${lastCreatedAt}`
      }

      const rows = await $fetch<MessageRow[]>(`${url}/rest/v1/chat_messages`, {
        headers,
        query
      }).catch(() => [] as MessageRow[])

      if (!rows.length) return

      rows.reverse()

      for (const row of rows) {
        lastCreatedAt = row.created_at
        write({
          type: 'message',
          chatId: row.chat_id,
          message: {
            id: row.id,
            authorId: row.author_id,
            text: row.content,
            createdAt: row.created_at,
            externalId: row.external_id || undefined,
            direction: (row.direction as 'in' | 'out' | null) || 'in',
            status: (row.status as 'sent' | 'delivered' | 'error' | null) || 'sent'
          }
        })
      }
    } catch (err) {
      write({ type: 'error', message: (err as Error)?.message || 'backfill_failed' })
    }
  }

  channel = supabase.channel(`chat-messages-${chatId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: `chat_id=eq.${chatId}`
    }, (payload) => {
      const row = payload.new as MessageRow
      lastCreatedAt = row.created_at
      write({
        type: 'message',
        chatId: row.chat_id,
        message: {
          id: row.id,
          authorId: row.author_id,
          text: row.content,
          createdAt: row.created_at,
          externalId: row.external_id || undefined,
          direction: (row.direction as 'in' | 'out' | null) || 'in',
          status: (row.status as 'sent' | 'delivered' | 'error' | null) || 'sent'
        }
      })
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'chat_messages',
      filter: `chat_id=eq.${chatId}`
    }, (payload) => {
      const row = payload.new as MessageRow
      write({
        type: 'message',
        chatId: row.chat_id,
        message: {
          id: row.id,
          authorId: row.author_id,
          text: row.content,
          createdAt: row.created_at,
          externalId: row.external_id || undefined,
          direction: (row.direction as 'in' | 'out' | null) || 'in',
          status: (row.status as 'sent' | 'delivered' | 'error' | null) || 'sent'
        }
      })
    })

  await channel.subscribe()

  const keepAlive = setInterval(() => write({ type: 'ping', ts: Date.now() }), 15000)

  await backfill()

  const close = () => {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
    clearInterval(keepAlive)
    supabase.removeAllChannels()
    // @ts-expect-error Node response exists in Nitro
    event.node.res.end?.()
  }

  // @ts-expect-error Node request exists in Nitro
  event.node.req.on('close', close)
  // Prevent handler from finishing
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  await new Promise(() => {})
})
