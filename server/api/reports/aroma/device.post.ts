import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const body = await readBody<{
    name?: string
    location?: string | null
    refill_every_days?: number
    volume_ml?: number
    price_per_refill?: number
    last_refill?: string
    active?: boolean
    object_id?: number | null
  }>(event)

  if (!body.name || !body.name.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Название обязательно.' })
  }

  const rows = await $fetch<any[]>(`${url}/rest/v1/aroma_devices`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    body: {
      name: body.name.trim(),
      location: body.location?.trim() || null,
      refill_every_days: body.refill_every_days ?? 14,
      volume_ml: body.volume_ml ?? 0,
      price_per_refill: body.price_per_refill ?? 0,
      last_refill: body.last_refill ?? new Date().toISOString().slice(0, 10),
      active: body.active ?? true,
      object_id: body.object_id ?? null
    }
  })

  return rows[0] || null
})
