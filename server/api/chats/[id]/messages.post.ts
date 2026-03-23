import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../../utils/supabase'
import { sendTelegramMessage } from '../../../utils/telegram'

interface Body {
  authorId: string
  content: string
}

interface ChatRow {
  id: number
  tg_chat_id?: number | null
  object_id?: number | null
}

interface TelegramSendResponse {
  result?: {
    message_id?: number
  }
  message_id?: number
}

type InsertedRow = {
  id: number
  created_at: string
  external_id?: number | null
  status?: string | null
}

export default eventHandler(async (event) => {
  const chatId = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(chatId) || chatId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный id чата.' })
  }

  const body = await readBody<Body>(event)
  if (!body?.authorId || !body?.content) {
    throw createError({ statusCode: 400, statusMessage: 'Поля authorId и content обязательны.' })
  }

  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)

  // Load chat to check Telegram mapping and object ownership
  const [chat] = await $fetch<ChatRow[]>(`${url}/rest/v1/chats`, {
    headers,
    query: {
      select: '*',
      id: `eq.${chatId}`,
      limit: 1
    }
  })

  if (!chat) {
    throw createError({ statusCode: 404, statusMessage: 'Чат не найден.' })
  }

  const insertedRows = await $fetch<Array<InsertedRow>>(`${url}/rest/v1/chat_messages`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    body: {
      chat_id: chatId,
      author_id: body.authorId,
      content: body.content,
      object_id: chat.object_id ?? null,
      direction: 'out',
      status: 'sent'
    }
  })

  const inserted = insertedRows[0]
  if (!inserted?.id) {
    throw createError({ statusCode: 500, statusMessage: 'Supabase не вернул id созданного сообщения.' })
  }

  let finalStatus: 'sent' | 'delivered' | 'error' = 'sent'
  let externalId: number | null | undefined = inserted.external_id ?? null

  await $fetch(`${url}/rest/v1/chats`, {
    method: 'PATCH',
    headers,
    query: { id: `eq.${chatId}` },
    body: {
      updated_at: new Date().toISOString()
    }
  })

  if (chat.tg_chat_id) {
    try {
      const sent = await sendTelegramMessage(chat.tg_chat_id, body.content) as TelegramSendResponse
      externalId = sent?.result?.message_id || sent?.message_id
      finalStatus = 'delivered'

      await $fetch(`${url}/rest/v1/chat_messages`, {
        method: 'PATCH',
        headers,
        query: { id: `eq.${inserted.id}` },
        body: {
          status: finalStatus,
          external_id: externalId ?? null
        }
      })
    } catch {
      finalStatus = 'error'
      await $fetch(`${url}/rest/v1/chat_messages`, {
        method: 'PATCH',
        headers,
        query: { id: `eq.${inserted.id}` },
        body: { status: finalStatus }
      })
      throw createError({ statusCode: 502, statusMessage: 'Не удалось отправить сообщение в Telegram.' })
    }
  }

  return {
    id: inserted.id,
    authorId: body.authorId,
    text: body.content,
    createdAt: inserted.created_at,
    direction: 'out',
    status: finalStatus,
    externalId: externalId ?? undefined
  }
})
