import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import {
  DEFAULT_CUSTOMER_ROLES,
  dedupeRolesByCode,
  mapCustomerRoleRow,
  type CustomerRoleDbRow,
  type CustomerRoleRecord
} from './roles'

function mapDefaultRoles(): CustomerRoleRecord[] {
  return DEFAULT_CUSTOMER_ROLES.map((role, index) => ({
    id: -(index + 1),
    buildingId: null,
    code: role.code,
    label: role.label,
    isActive: true,
    createdAt: null,
    scope: 'fallback',
    isSystem: true,
    isReadonly: true
  }))
}

export default eventHandler(async (event) => {
  const buildingIdRaw = getQuery(event).buildingId
  const buildingId = typeof buildingIdRaw === 'string' ? Number(buildingIdRaw) : NaN

  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const query: Record<string, string> = {
    select: 'id,building_id,code,label,is_active,created_at',
    order: 'label.asc,code.asc'
  }

  if (Number.isInteger(buildingId) && buildingId > 0) {
    query.or = `(building_id.eq.${buildingId},building_id.is.null)`
  } else {
    query.building_id = 'is.null'
  }

  try {
    const rows = await $fetch<CustomerRoleDbRow[]>(`${url}/rest/v1/customer_roles`, {
      headers: getSupabaseServerHeaders(serviceRoleKey),
      query
    })

    const mapped = rows.map(mapCustomerRoleRow)
    const deduped = dedupeRolesByCode(mapped, buildingId)
    return deduped.length ? deduped : mapDefaultRoles()
  } catch {
    return mapDefaultRoles()
  }
})
