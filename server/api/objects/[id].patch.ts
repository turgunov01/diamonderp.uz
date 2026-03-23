import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import { parseObjectIdInput } from '../documents'

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)

  const idRaw = getRouterParam(event, 'id')
  const id = Number(idRaw)
  if (!idRaw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный id объекта.' })
  }

  const body = await readBody<{ isActive?: boolean }>(event)
  if (typeof body.isActive !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Поле isActive обязательно.' })
  }

  const rows = await $fetch<any[]>(`${url}/rest/v1/objects`, {
    method: 'PATCH',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    query: { id: `eq.${id}` },
    body: {
      is_active: body.isActive
    }
  })

  const row = rows[0]
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Объект не найден.' })
  }

  return row
})
