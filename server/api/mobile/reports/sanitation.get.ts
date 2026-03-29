import { parseRequestedObjectId, requireMobileAccess, resolveScopedObjectIds } from '../../../utils/mobile-access'
import { buildEqOrInFilter } from '../../../utils/postgrest'
import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../../utils/supabase'

type SanitationEventRow = {
  id: number
  object_id: number | null
  type: 'disinfection' | 'deratization'
  performed_at: string
  team: string
  executors: string[] | null
  notes: string | null
  photos: string[] | null
  created_at: string
  updated_at: string
}

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)
  const requestedObjectId = parseRequestedObjectId(getQuery(event).objectId)
  const objectIds = resolveScopedObjectIds(access, requestedObjectId)

  if (!objectIds.length) {
    return { events: [] }
  }

  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const rows = await $fetch<SanitationEventRow[]>(`${url}/rest/v1/sanitation_events`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query: {
      select: 'id,object_id,type,performed_at,team,executors,notes,photos,created_at,updated_at',
      object_id: buildEqOrInFilter(objectIds),
      order: 'performed_at.desc'
    }
  })

  return {
    role: access.role,
    frontend: access.frontend,
    objectIds,
    events: rows.map((row) => ({
      id: row.id,
      objectId: row.object_id,
      type: row.type,
      performedAt: row.performed_at,
      team: row.team,
      executors: Array.isArray(row.executors) ? row.executors : [],
      notes: row.notes,
      photos: Array.isArray(row.photos) ? row.photos : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }
})
