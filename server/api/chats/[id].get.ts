import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'

type ChatRow = {
  id: number
  title: string
  is_group: boolean
  updated_at: string
  object_id?: number | null
  tg_chat_id?: number | null
  tg_type?: string | null
}

type MessageRow = {
  id: number
  author_id: string
  content: string
  created_at: string
  external_id?: number | null
  direction?: string | null
  status?: string | null
}

export default eventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный id чата.' })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const [chat] = await $fetch<ChatRow[]>(`${url}/rest/v1/chats`, {
    headers,
    query: { select: '*', id: `eq.${id}`, limit: 1 }
  })

  if (!chat) {
    throw createError({ statusCode: 404, statusMessage: 'Чат не найден.' })
  }

  const messages = await $fetch<MessageRow[]>(`${url}/rest/v1/chat_messages`, {
    headers,
    query: {
      select: 'id,author_id,content,created_at,external_id,direction,status',
      chat_id: `eq.${id}`,
      order: 'id.desc',
      limit: 100
    }
  })

  return {
    id: chat.id,
    title: chat.title,
    isGroup: chat.is_group,
    updatedAt: chat.updated_at,
    objectId: chat.object_id || null,
    tgChatId: chat.tg_chat_id || undefined,
    tgType: chat.tg_type || undefined,
    messages: messages
      .map(m => ({
        id: m.id,
        authorId: m.author_id,
        text: m.content,
        createdAt: m.created_at,
        externalId: m.external_id || undefined,
        direction: m.direction || 'in',
        status: m.status || 'sent'
      }))
      .reverse()
  }
})
