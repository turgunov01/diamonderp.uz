import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import { normalizeWorkScheduleType, type WorkScheduleType } from '~~/shared/utils/work-schedules'

type ObjectRow = {
  id: number
  building_id?: number | null
  name: string
  description?: string | null
  address?: string | null
  code?: string | null
  is_active?: boolean
  schedule_type?: WorkScheduleType | string | null
}

function isMissingScheduleTypeColumn(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const payload = error as { data?: { code?: string, message?: string }, code?: string, message?: string }
  const code = payload.data?.code || payload.code
  const message = payload.data?.message || payload.message

  if (code !== 'PGRST204' && code !== '42703') {
    return false
  }

  return typeof message === 'string' && message.includes('schedule_type')
}

function mapObjectRow(row: ObjectRow) {
  return {
    ...row,
    schedule_type: normalizeWorkScheduleType(row.schedule_type)
  }
}

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const buildingIdRaw = getQuery(event).buildingId
  const buildingId = typeof buildingIdRaw === 'string' ? Number(buildingIdRaw) : NaN

  const query: Record<string, string> = {
    select: 'id,building_id,name,description,address,code,is_active,schedule_type',
    order: 'id.asc'
  }

  if (Number.isInteger(buildingId) && buildingId > 0) {
    query.building_id = `eq.${buildingId}`
  }

  try {
    const rows = await $fetch<ObjectRow[]>(`${url}/rest/v1/objects`, {
      headers: getSupabaseServerHeaders(serviceRoleKey),
      query
    })
    return rows.map(mapObjectRow)
  } catch (error) {
    if (!isMissingScheduleTypeColumn(error)) {
      throw error
    }

    const fallbackQuery: Record<string, string> = {
      select: 'id,building_id,name,description,address,code,is_active',
      order: 'id.asc'
    }

    if (Number.isInteger(buildingId) && buildingId > 0) {
      fallbackQuery.building_id = `eq.${buildingId}`
    }

    const rows = await $fetch<ObjectRow[]>(`${url}/rest/v1/objects`, {
      headers: getSupabaseServerHeaders(serviceRoleKey),
      query: fallbackQuery
    })

    return rows.map(mapObjectRow)
  }
})
