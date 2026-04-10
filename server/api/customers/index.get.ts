import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import { mapCustomerDbRowToRecord, type CustomerDbRow } from './customers'

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const buildingIdRaw = getQuery(event).buildingId
  const buildingId = typeof buildingIdRaw === 'string' ? Number(buildingIdRaw) : NaN

  const query: Record<string, string> = {
    select: 'id,building_id,full_name,username,avatar,password,role,phone_number,passport_file,passport_front_path,passport_back_path,age,work_shift,object_pinned,object_positions,base_salary,position_bonus,salary_currency,status,must_change_password,activated_at,archived_at,deactivation_comment',
    order: 'id.asc'
  }

  if (Number.isInteger(buildingId) && buildingId > 0) {
    // Include customers with exact building or legacy records without building
    query.or = `(building_id.eq.${buildingId},building_id.is.null)`
  }

  let rows: CustomerDbRow[]

  try {
    rows = await $fetch<CustomerDbRow[]>(`${url}/rest/v1/customers`, {
      headers: getSupabaseServerHeaders(serviceRoleKey),
      query
    })
  } catch {
    // Fallback for old schema if salary columns are not added yet.
    const fallbackQuery: Record<string, string> = {
      // legacy schema without building_id / salary columns
      select: 'id,username,avatar,password,role,phone_number,passport_file,age,work_shift,object_pinned,object_positions',
      order: 'id.asc'
    }

    rows = await $fetch<CustomerDbRow[]>(`${url}/rest/v1/customers`, {
      headers: getSupabaseServerHeaders(serviceRoleKey),
      query: fallbackQuery
    })
  }

  return rows.map(mapCustomerDbRowToRecord)
})
