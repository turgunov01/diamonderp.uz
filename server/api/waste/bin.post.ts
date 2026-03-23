import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import type { BinCategory, BinStatus, WasteBinRow } from './waste'

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const body = await readBody<{ category?: BinCategory, volumeM3?: number, weightKg?: number, status?: BinStatus, objectId?: number | null }>(event)

  const category = body.category
  if (!category || !['Макулатура', 'Пластик', 'Общее'].includes(category)) {
    throw createError({ statusCode: 400, statusMessage: 'Поле category обязательно.' })
  }

  const volumeM3 = Number(body.volumeM3 ?? 0)
  const weightKg = Number(body.weightKg ?? 0)
  const status = body.status || 'available'
  if (!['available', 'loaded'].includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Поле status некорректно.' })
  }

  const rows = await $fetch<WasteBinRow[]>(`${url}/rest/v1/waste_bins`, {
    method: 'POST',
    headers: {
      ...getSupabaseServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    body: {
      category,
      volume_m3: volumeM3,
      weight_kg: weightKg,
      status,
      object_id: body.objectId ?? null
    }
  })

  return rows[0] || null
})
