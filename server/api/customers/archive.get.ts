import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import { mapCustomerDbRowToRecord, type CustomerDbRow } from './customers'

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const buildingIdRaw = getQuery(event).buildingId
  const buildingId = typeof buildingIdRaw === 'string' ? Number(buildingIdRaw) : NaN

  const query: Record<string, string> = {
    select: 'id,building_id,full_name,username,avatar,password,role,phone_number,passport_file,passport_front_path,passport_back_path,age,work_shift,object_pinned,object_positions,salary_type,hourly_rate,base_salary,position_bonus,salary_currency,status,must_change_password,activated_at,archived_at,deactivation_comment',
    status: 'eq.archived',
    order: 'archived_at.desc,id.asc'
  }

  if (Number.isInteger(buildingId) && buildingId > 0) {
    query.building_id = `eq.${buildingId}`
  }

  const rows = await $fetch<CustomerDbRow[]>(`${url}/rest/v1/customers`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query
  })

  return rows.map(mapCustomerDbRowToRecord)
})
