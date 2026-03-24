import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import { mapAdvanceDbRowToRecord, type EmployeeAdvanceDbRow, type AdvanceStatus } from './advances'

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const queryParams = getQuery(event)

  const select = 'id,customer_id,amount,currency,comment,status,issued_by,issued_at,settled_at,object_id,building_id'
  const query: Record<string, string> = { select, order: 'issued_at.desc,id.desc' }

  if (queryParams.customerId) {
    const customerId = Number(queryParams.customerId)
    if (Number.isInteger(customerId) && customerId > 0) {
      query.customer_id = `eq.${customerId}`
    }
  }

  if (queryParams.status) {
    const status = String(queryParams.status)
    if (['issued', 'settled', 'cancelled'].includes(status)) {
      query.status = `eq.${status}`
    }
  }

  const andFilters: string[] = []
  if (queryParams.from) {
    andFilters.push(`issued_at.gte.${queryParams.from as string}`)
  }

  if (queryParams.to) {
    andFilters.push(`issued_at.lte.${queryParams.to as string}`)
  }

  if (andFilters.length) {
    query.and = `(${andFilters.join(',')})`
  }

  if (queryParams.objectId) {
    const objectId = Number(queryParams.objectId)
    if (Number.isInteger(objectId) && objectId > 0) {
      query.object_id = `eq.${objectId}`
    }
  }

  if (queryParams.buildingId) {
    const buildingId = Number(queryParams.buildingId)
    if (Number.isInteger(buildingId) && buildingId > 0) {
      query.building_id = `eq.${buildingId}`
    }
  }

  const rows = await $fetch<EmployeeAdvanceDbRow[]>(`${url}/rest/v1/employee_advances`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query
  })

  return rows.map(mapAdvanceDbRowToRecord)
})
