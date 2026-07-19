import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'

export default eventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))

  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: 'Некорректный id чата.' })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  // Ensure chat exists
  const [chat] = await $fetch<{ id: number }[]>(`${url}/rest/v1/chats`, {
    headers,
    query: {
      select: 'id',
      id: `eq.${id}`,
      limit: 1
    }
  }).catch(() => [] as { id: number }[])

  if (!chat) {
    throw createError({ statusCode: 404, message: 'Чат не найден.' })
  }

  await $fetch(`${url}/rest/v1/chats`, {
    method: 'DELETE',
    headers,
    query: {
      id: `eq.${id}`
    }
  })

  return { ok: true, id }
})
