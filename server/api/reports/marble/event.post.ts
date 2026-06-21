import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import type { MarbleEvent } from './index.get'

type IncomingBody = {
  type?: 'crystallization' | 'polishing'
  performedAt?: string
  team?: string
  executors?: string[] | string | null
  areaM2?: number | string
  notes?: string | null
  photos?: string[] | string | null
  objectId?: number | null
}

function normalizeList(value?: string[] | string | null): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const body = await readBody<IncomingBody>(event)

  const type = body.type
  if (!type || !['crystallization', 'polishing'].includes(type)) {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ type РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ (crystallization|polishing).' })
  }

  const team = (body.team || '').trim()
  if (!team.length) {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ team РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ.' })
  }

  const areaM2 = Number(body.areaM2 ?? 0)
  if (!Number.isFinite(areaM2) || areaM2 <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'areaM2 РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ > 0' })
  }

  const performedAt = body.performedAt ? new Date(body.performedAt) : new Date()
  if (Number.isNaN(performedAt.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ performedAt РЅРµРєРѕСЂСЂРµРєС‚РЅРѕ.' })
  }

  const executors = normalizeList(body.executors)
  const photos = normalizeList(body.photos)

  const rows = await $fetch<MarbleEvent[]>(`${url}/rest/v1/marble_events`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    body: {
      type,
      performed_at: performedAt.toISOString(),
      team,
      executors,
      area_m2: areaM2,
      notes: body.notes ?? null,
      photos,
      object_id: body.objectId ?? null
    }
  })

  return rows[0] || null
})
