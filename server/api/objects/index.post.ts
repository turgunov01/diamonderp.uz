import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'

interface Body {
  name: string
  buildingId?: number
  description?: string
  address?: string
  code?: string
}

interface ObjectRow {
  id: number
  building_id: number
  name: string
  description?: string | null
  address?: string | null
  code?: string | null
}

export default eventHandler(async (event) => {
  const body = await readBody<Body>(event)
  if (!body?.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Название обязательно.' })
  }
  if (!body?.buildingId || body.buildingId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'buildingId обязателен.' })
  }

  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)

  const [created] = await $fetch<ObjectRow[]>(`${url}/rest/v1/objects`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    body: {
      building_id: body.buildingId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      address: body.address?.trim() || null,
      code: body.code?.trim() || null
    }
  })

  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Не удалось создать объект.' })
  }

  setResponseStatus(event, 201)
  return created
})
