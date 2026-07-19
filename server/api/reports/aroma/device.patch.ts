import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const body = await readBody<{
    id?: number
    name?: string
    location?: string | null
    refill_every_days?: number
    volume_ml?: number
    price_per_refill?: number
    last_refill?: string
    active?: boolean
    object_id?: number | null
  }>(event)

  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: 'id обязателен' })
  }

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) patch.name = body.name?.trim()
  if (body.location !== undefined) patch.location = body.location?.trim() || null
  if (body.refill_every_days !== undefined) patch.refill_every_days = Number(body.refill_every_days)
  if (body.volume_ml !== undefined) patch.volume_ml = Number(body.volume_ml)
  if (body.price_per_refill !== undefined) patch.price_per_refill = Number(body.price_per_refill)
  if (body.last_refill !== undefined) patch.last_refill = body.last_refill
  if (body.active !== undefined) patch.active = !!body.active
  if (body.object_id !== undefined) patch.object_id = body.object_id ?? null

  if (!Object.keys(patch).length) {
    throw createError({ statusCode: 400, message: 'Нет данных для обновления' })
  }

  const rows = await $fetch<any[]>(`${url}/rest/v1/aroma_devices`, {
    method: 'PATCH',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    query: { id: `eq.${id}` },
    body: patch
  })

  if (!rows.length) {
    throw createError({ statusCode: 404, message: 'Устройство не найдено' })
  }

  return rows[0]
})
