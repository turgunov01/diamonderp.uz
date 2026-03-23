import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../../utils/supabase'
import type { SanitationEvent } from './index.get'

type IncomingBody = {
  type?: 'disinfection' | 'deratization'
  performedAt?: string
  team?: string
  executors?: string[] | string | null
  notes?: string | null
  photos?: string[] | string | null
  objectId?: number | null
}

function normalizeList(value?: string[] | string | null): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean)
  }
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)

  const body = await readBody<IncomingBody>(event)

  const type = body.type
  if (!type || !['disinfection', 'deratization'].includes(type)) {
    throw createError({ statusCode: 400, statusMessage: 'Поле type обязательно (disinfection|deratization).' })
  }

  const team = (body.team || '').trim()
  if (!team.length) {
    throw createError({ statusCode: 400, statusMessage: 'Поле team обязательно.' })
  }

  const performedAt = body.performedAt ? new Date(body.performedAt) : new Date()
  if (Number.isNaN(performedAt.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'Поле performedAt некорректно.' })
  }

  const executors = normalizeList(body.executors)
  const photos = normalizeList(body.photos)

  const rows = await $fetch<SanitationEvent[]>(`${url}/rest/v1/sanitation_events`, {
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
      notes: body.notes ?? null,
      photos,
      object_id: body.objectId ?? null
    }
  })

  return rows[0] || null
})
