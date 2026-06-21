import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'

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

export interface SanitationEvent {
  id: number
  objectId: number | null
  type: 'disinfection' | 'deratization'
  performedAt: string
  team: string
  executors: string[]
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
    select: 'id,object_id,type,performed_at,team,executors,notes,photos,created_at,updated_at',
    order: 'performed_at.desc'
  }
  if (filterByObject) query.object_id = `eq.${objectId}`

  const rows = await $fetch<SanitationEventRow[]>(`${url}/rest/v1/sanitation_events`, {
    headers,
    query
  })

  const events: SanitationEvent[] = rows.map((r) => ({
    id: r.id,
    objectId: r.object_id,
    type: r.type,
    performedAt: r.performed_at,
    team: r.team,
    executors: Array.isArray(r.executors) ? r.executors : [],
    notes: r.notes,
    photos: Array.isArray(r.photos) ? r.photos : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))

  return { events }
})
