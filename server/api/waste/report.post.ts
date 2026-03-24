import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import type { WasteReportRow, WasteBinRow, WasteDirection } from './waste'

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const body = await readBody<{
    binId?: number
    amountM3?: number
    amountKg?: number
    objectId?: number | null
    fromObjectId?: number | null
    toObjectId?: number | null
    direction?: WasteDirection
    vehicle?: string
    photoUrl?: string
    comment?: string
  }>(event)

  const binId = Number(body.binId)
  if (!Number.isInteger(binId) || binId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Поле binId обязательно.' })
  }

  const amountM3 = Number(body.amountM3 ?? 0)
  const amountKg = Number(body.amountKg ?? 0)
  const direction: WasteDirection = body.direction === 'in' ? 'in' : 'out'

  const headers = getSupabaseServerHeaders(serviceRoleKey)

  const binRows = await $fetch<WasteBinRow[]>(`${url}/rest/v1/waste_bins`, {
    headers,
    query: {
      id: `eq.${binId}`,
      select: 'id,object_id,category,volume_m3,weight_kg,status'
    }
  })

  const bin = binRows[0]
  if (!bin) {
    throw createError({ statusCode: 404, statusMessage: 'Бак не найден' })
  }

  const fromObjectId = body.fromObjectId ?? bin.object_id ?? null
  const toObjectId = body.toObjectId ?? body.objectId ?? null

  const reportRows = await $fetch<WasteReportRow[]>(`${url}/rest/v1/waste_reports`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    body: {
      bin_id: binId,
      object_id: toObjectId ?? fromObjectId ?? null,
      category: bin.category,
      amount_m3: amountM3,
      amount_kg: amountKg,
      direction,
      from_object_id: fromObjectId,
      to_object_id: toObjectId,
      vehicle: body.vehicle || null,
      photo_url: body.photoUrl || null,
      comment: body.comment || null
    }
  })

  // Update bin state depending on direction
  const newStatus = direction === 'out' ? 'loaded' : 'available'
  const newObjectId = direction === 'in' ? (toObjectId ?? bin.object_id ?? null) : null
  const newWeight = direction === 'in'
    ? Math.max(0, amountKg || Number(bin.weight_kg || 0))
    : Math.max(0, (bin.weight_kg ?? 0) - (Number.isFinite(amountKg) ? amountKg : 0))

  await $fetch(`${url}/rest/v1/waste_bins`, {
    method: 'PATCH',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    query: { id: `eq.${binId}` },
    body: {
      status: newStatus,
      object_id: newObjectId,
      weight_kg: newWeight
    }
  })

  return reportRows[0] || null
})
