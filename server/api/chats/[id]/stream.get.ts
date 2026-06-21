import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'

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
    throw createError({ statusCode: 400, statusMessage: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ id С‡Р°С‚Р°.' })
  }

  // SSE headers
  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache, no-transform')
  setHeader(event, 'Connection', 'keep-alive')
  event.node.res.flushHeaders?.()

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)
  const querySince = getQuery(event).since
  let lastCreatedAt = typeof querySince === 'string' && querySince.length ? querySince : null

  const write = (payload: unknown) => {
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

  const poll = setInterval(() => {
    void backfill()
  }, 1000)
  const keepAlive = setInterval(() => write({ type: 'ping', ts: Date.now() }), 15000)

  await backfill()

  const close = () => {
    clearInterval(poll)
    clearInterval(keepAlive)
    event.node.res.end?.()
  }

  event.node.req.on('close', close)
  // Prevent handler from finishing
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  await new Promise(() => {})
})
