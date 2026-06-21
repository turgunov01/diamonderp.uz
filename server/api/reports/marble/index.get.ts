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

export type MarbleEvent = {
  id: number
  objectId: number | null
  type: 'crystallization' | 'polishing'
  performedAt: string
  team: string
  executors: string[]
  areaM2: number
  notes: string | null
  photos: string[]
  createdAt: string
  updatedAt: string
}

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const objectIdRaw = getQuery(event).objectId
  const objectId = objectIdRaw ? Number(objectIdRaw) : NaN
  const filterByObject = Number.isInteger(objectId) && objectId > 0

  const query: Record<string, string> = {
    select: 'id,object_id,type,performed_at,team,executors,area_m2,notes,photos,created_at,updated_at',
    order: 'performed_at.desc'
  }
  if (filterByObject) query.object_id = `eq.${objectId}`

  const rows = await $fetch<MarbleEventRow[]>(`${url}/rest/v1/marble_events`, {
    headers,
    query
  })

  const events: MarbleEvent[] = rows.map((r) => ({
    id: r.id,
    objectId: r.object_id,
    type: r.type,
    performedAt: r.performed_at,
    team: r.team,
    executors: Array.isArray(r.executors) ? r.executors : [],
    areaM2: Number(r.area_m2 || 0),
    notes: r.notes,
    photos: Array.isArray(r.photos) ? r.photos : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))

  return { events }
})
