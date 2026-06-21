import { parseRequestedObjectId, requireMobileAccess, resolveScopedObjectIds } from '../../../utils/mobile-access'
import { buildEqOrInFilter } from '../../../utils/postgrest'
import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'

type MarbleEventRow = {
  id: number
  object_id: number | null
  type: 'crystallization' | 'polishing'
  performed_at: string
  team: string
  executors: string[] | null
  area_m2: number
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

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const rows = await $fetch<MarbleEventRow[]>(`${url}/rest/v1/marble_events`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query: {
      select: 'id,object_id,type,performed_at,team,executors,area_m2,notes,photos,created_at,updated_at',
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
      areaM2: Number(row.area_m2 || 0),
      notes: row.notes,
      photos: Array.isArray(row.photos) ? row.photos : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }
})
