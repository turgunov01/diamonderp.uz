import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import { mapAdvanceDbRowToRecord, type EmployeeAdvanceDbRow, type AdvanceStatus } from '../advances'
import type { H3Event } from 'h3'

function parseAdvanceId(event: H3Event) {
  const raw = getRouterParam(event, 'id')
  const id = Number(raw)
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ id Р°РІР°РЅСЃР°.' })
  }
  return id
}

function parseBody(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'РўРµР»Рѕ Р·Р°РїСЂРѕСЃР° РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РѕР±СЉРµРєС‚РѕРј.' })
  }

  const input = body as Record<string, unknown>
  const update: Partial<{
    comment: string | null
    status: AdvanceStatus
  }> = {}

  if (input.comment !== undefined) {
    if (input.comment !== null && typeof input.comment !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'comment РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ СЃС‚СЂРѕРєРѕР№ РёР»Рё null.' })
    }
    update.comment = input.comment as string | null
  }

  if (input.status !== undefined) {
    const status = String(input.status)
    if (!['issued', 'settled', 'cancelled'].includes(status)) {
      throw createError({ statusCode: 400, statusMessage: 'status РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ issued/settled/cancelled.' })
    }
    update.status = status as AdvanceStatus
  }

  if (!Object.keys(update).length) {
    throw createError({ statusCode: 400, statusMessage: 'РќСѓР¶РЅРѕ РїРµСЂРµРґР°С‚СЊ С…РѕС‚СЏ Р±С‹ РѕРґРЅРѕ РїРѕР»Рµ.' })
  }

  if (update.status && update.status !== 'issued') {
    update.comment = update.comment ?? 'Р—Р°РєСЂС‹С‚'
  }

  return update
}

export default eventHandler(async (event) => {
  const advanceId = parseAdvanceId(event)
  const update = parseBody(await readBody(event))
  const { url, serviceRoleKey } = getDataApiServerConfig()

  const headers = {
    ...getDataApiServerHeaders(serviceRoleKey),
    Prefer: 'return=representation'
  }

  const rows = await $fetch<EmployeeAdvanceDbRow[]>(`${url}/rest/v1/employee_advances?id=eq.${advanceId}`, {
    method: 'PATCH',
    headers,
    body: {
      comment: update.comment ?? null,
      status: update.status ?? undefined,
      settled_at: update.status && update.status !== 'issued' ? new Date().toISOString() : undefined
    }
  })

  const updated = rows[0]
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'РђРІР°РЅСЃ РЅРµ РЅР°Р№РґРµРЅ.' })
  }

  return mapAdvanceDbRowToRecord(updated)
})
