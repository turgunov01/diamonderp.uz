import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'

export interface ObjectDbRow {
  id: number
  name: string
  description: string | null
  created_at: string
}

export interface ObjectRecord {
  id: number
  name: string
  description?: string
  createdAt: string
}

export function mapObjectDbRowToRecord(row: ObjectDbRow): ObjectRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    createdAt: row.created_at
  }
}

export default eventHandler(async () => {
  const { url, serviceRoleKey } = getDataApiServerConfig()

  let rows: ObjectDbRow[]

  try {
    rows = await $fetch<ObjectDbRow[]>(`${url}/rest/v1/objects`, {
      headers: getDataApiServerHeaders(serviceRoleKey),
      query: {
        select: 'id,name,description,created_at',
        order: 'id.asc'
      }
    })
  } catch (error) {
    console.error('Error fetching objects:', error)
    return []
  }

  return rows.map(mapObjectDbRowToRecord)
})
