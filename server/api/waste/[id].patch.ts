import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import type { WasteBinRow } from './waste'

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const idRaw = getRouterParam(event, 'id')
  const id = Number(idRaw)
  if (!idRaw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный id' })
  }

  const body = await readBody<Partial<WasteBinRow>>(event)

  const rows = await $fetch<WasteBinRow[]>(`${url}/rest/v1/waste_bins`, {
    method: 'PATCH',
    headers: {
      ...getDataApiServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    query: { id: `eq.${id}` },
    body: {
      status: body.status,
      weight_kg: body.weight_kg,
      volume_m3: body.volume_m3,
      category: body.category,
      object_id: body.object_id
    }
  })

  const row = rows[0]
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Бак не найден' })
  }

  return row
})
