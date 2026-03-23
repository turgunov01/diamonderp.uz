import { getSupabaseServerConfig, getSupabaseServerHeaders } from './supabase'

export type EmployeeActivityStatus = 'on_time' | 'late' | 'absent'

interface EmployeeActivityDbRow {
  id: number
  employee_id: number | null
  employee_name: string | null
  activity_date: string
  status: EmployeeActivityStatus
  work_minutes: number | null
  late_minutes: number | null
}

interface ActivityCustomerRow {
  id: number
  building_id?: number | null
  username: string
}

export interface EmployeeActivityRecord {
  id: number
  employeeId: number | null
  employeeName: string
  date: string
  status: EmployeeActivityStatus
  workMinutes: number
  lateMinutes: number
}

interface ListEmployeeActivitiesOptions {
  from?: string
  to?: string
  buildingId?: number | null
  employeeIds?: number[]
}

function normalizeEmployeeIds(rows: EmployeeActivityDbRow[]) {
  return [...new Set(
    rows
      .map(row => row.employee_id)
      .filter((employeeId): employeeId is number => Number.isInteger(employeeId) && employeeId > 0)
  )]
}

function buildEmployeeActivityUrl(baseUrl: string, options: ListEmployeeActivitiesOptions) {
  const params = new URLSearchParams()

  params.set('select', 'id,employee_id,employee_name,activity_date,status,work_minutes,late_minutes')
  params.set('order', 'activity_date.desc,id.desc')

  if (options.from) {
    params.append('activity_date', `gte.${options.from}`)
  }

  if (options.to) {
    params.append('activity_date', `lte.${options.to}`)
  }

  if (options.employeeIds?.length) {
    params.append('employee_id', `in.(${options.employeeIds.join(',')})`)
  }

  return `${baseUrl}/rest/v1/employee_activity?${params.toString()}`
}

async function fetchCustomersByIds(employeeIds: number[]) {
  if (!employeeIds.length) {
    return new Map<number, ActivityCustomerRow>()
  }

  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const params = new URLSearchParams()

  params.set('select', 'id,building_id,username')
  params.set('id', `in.(${employeeIds.join(',')})`)

  const rows = await $fetch<ActivityCustomerRow[]>(`${url}/rest/v1/customers?${params.toString()}`, {
    headers: getSupabaseServerHeaders(serviceRoleKey)
  })

  return new Map(rows.map(row => [row.id, row]))
}

function mapEmployeeActivityDbRowToRecord(
  row: EmployeeActivityDbRow,
  customer?: ActivityCustomerRow
): EmployeeActivityRecord {
  const employeeName = customer?.username?.trim()
    || row.employee_name?.trim()
    || `Сотрудник #${row.employee_id ?? row.id}`

  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName,
    date: row.activity_date,
    status: row.status,
    workMinutes: row.work_minutes ?? 0,
    lateMinutes: row.late_minutes ?? 0
  }
}

export async function listEmployeeActivities(options: ListEmployeeActivitiesOptions = {}) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const rows = await $fetch<EmployeeActivityDbRow[]>(buildEmployeeActivityUrl(url, options), {
    headers: getSupabaseServerHeaders(serviceRoleKey)
  })

  if (!rows.length) {
    return [] as EmployeeActivityRecord[]
  }

  const customersById = await fetchCustomersByIds(normalizeEmployeeIds(rows))

  return rows
    .filter((row) => {
      if (!Number.isInteger(options.buildingId) || (options.buildingId ?? 0) <= 0) {
        return true
      }

      if (!row.employee_id) {
        return false
      }

      return customersById.get(row.employee_id)?.building_id === options.buildingId
    })
    .map(row => mapEmployeeActivityDbRowToRecord(
      row,
      row.employee_id ? customersById.get(row.employee_id) : undefined
    ))
}

export async function deleteEmployeeActivitiesByEmployeeId(employeeId: number) {
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return
  }

  const { url, serviceRoleKey } = getSupabaseServerConfig()

  await $fetch(`${url}/rest/v1/employee_activity`, {
    method: 'DELETE',
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query: {
      employee_id: `eq.${employeeId}`
    }
  })
}
