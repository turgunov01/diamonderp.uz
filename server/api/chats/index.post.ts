import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'

interface Body {
  title: string
  isGroup?: boolean
  memberIds?: string[] // uuid[]
  objectId?: number
}

export default eventHandler(async (event) => {
  const body = await readBody<Body>(event)
  if (!body?.title) {
    throw createError({ statusCode: 400, message: 'Название обязательно.' })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const insertedChats = await $fetch<Array<{ id: number }>>(`${url}/rest/v1/chats`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    body: {
      title: body.title,
      is_group: body.isGroup ?? true,
      object_id: body.objectId || null
    }
  })

  const chat = insertedChats[0]
  if (!chat?.id) {
    throw createError({ statusCode: 500, message: 'Postgres не вернул id созданного чата.' })
  }

  if (body.memberIds?.length) {
    await $fetch(`${url}/rest/v1/chat_members`, {
      method: 'POST',
      headers,
      body: body.memberIds.map(id => ({
        chat_id: chat.id,
        user_id: id,
        object_id: body.objectId || null
      }))
    })
  }

  return chat
})
