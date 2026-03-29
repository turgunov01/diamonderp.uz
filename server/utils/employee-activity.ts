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
  object_pinned?: string | null
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

export interface RecordEmployeeActivityResult {
  created: boolean
  recordedAt: string
  activity: EmployeeActivityRecord
}

function normalizeEmployeeIds(rows: EmployeeActivityDbRow[]) {
  return [...new Set(
    rows
      .map(row => row.employee_id)
      .filter((employeeId): employeeId is number => typeof employeeId === 'number' && Number.isInteger(employeeId) && employeeId > 0)
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
    || `Employee #${row.employee_id ?? row.id}`

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

function assertEmployeeId(employeeId: number) {
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'employeeId must be a positive integer.'
    })
  }
}

function parseRecordedAt(value?: string | Date | null) {
  if (value === undefined || value === null || value === '') {
    return new Date()
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw createError({
        statusCode: 400,
        statusMessage: 'recordedAt contains an invalid date.'
      })
    }

    return value
  }

  if (typeof value !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'recordedAt must be an ISO date string.'
    })
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw createError({
      statusCode: 400,
      statusMessage: 'recordedAt contains an invalid date.'
    })
  }

  return date
}

function getTashkentParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(value)

  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value
  const hour = parts.find(part => part.type === 'hour')?.value
  const minute = parts.find(part => part.type === 'minute')?.value

  if (!year || !month || !day || !hour || !minute) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to resolve Asia/Tashkent date parts.'
    })
  }

  return {
    year,
    month,
    day,
    hour: Number(hour),
    minute: Number(minute)
  }
}

function formatDateInTashkent(value: Date) {
  const parts = getTashkentParts(value)
  return `${parts.year}-${parts.month}-${parts.day}`
}

function buildInitialActivityStatus(recordedAt: Date) {
  const parts = getTashkentParts(recordedAt)
  const totalMinutes = parts.hour * 60 + parts.minute
  const workdayStartMinutes = 9 * 60

  if (totalMinutes <= workdayStartMinutes) {
    return {
      status: 'on_time' as const,
      lateMinutes: 0
    }
  }

  return {
    status: 'late' as const,
    lateMinutes: totalMinutes - workdayStartMinutes
  }
}

async function fetchActivityCustomer(employeeId: number) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const rows = await $fetch<ActivityCustomerRow[]>(`${url}/rest/v1/customers`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query: {
      select: 'id,building_id,username,object_pinned',
      id: `eq.${employeeId}`,
      limit: '1'
    }
  })

  const customer = rows[0]

  if (!customer) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Employee not found.'
    })
  }

  if (!customer.object_pinned?.trim()) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Employee is disabled and cannot record activity.'
    })
  }

  return customer
}

async function fetchExistingActivity(employeeId: number, activityDate: string) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const rows = await $fetch<EmployeeActivityDbRow[]>(`${url}/rest/v1/employee_activity`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query: {
      select: 'id,employee_id,employee_name,activity_date,status,work_minutes,late_minutes',
      employee_id: `eq.${employeeId}`,
      activity_date: `eq.${activityDate}`,
      limit: '1'
    }
  })

  return rows[0]
}

async function createActivity(employeeId: number, employeeName: string, activityDate: string, recordedAt: Date) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const initialStatus = buildInitialActivityStatus(recordedAt)
  const rows = await $fetch<EmployeeActivityDbRow[]>(`${url}/rest/v1/employee_activity`, {
    method: 'POST',
    headers: {
      ...getSupabaseServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    body: {
      employee_id: employeeId,
      employee_name: employeeName,
      activity_date: activityDate,
      status: initialStatus.status,
      work_minutes: 0,
      late_minutes: initialStatus.lateMinutes
    }
  })

  const createdActivity = rows[0]
  if (!createdActivity) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create employee activity.'
    })
  }

  return createdActivity
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

export async function recordEmployeeActivity(input: {
  employeeId: number
  recordedAt?: string | Date | null
}): Promise<RecordEmployeeActivityResult> {
  assertEmployeeId(input.employeeId)

  const recordedAt = parseRecordedAt(input.recordedAt)
  const activityDate = formatDateInTashkent(recordedAt)
  const customer = await fetchActivityCustomer(input.employeeId)
  const existingActivity = await fetchExistingActivity(input.employeeId, activityDate)

  if (existingActivity) {
    return {
      created: false,
      recordedAt: recordedAt.toISOString(),
      activity: mapEmployeeActivityDbRowToRecord(existingActivity, customer)
    }
  }

  let createdActivity: EmployeeActivityDbRow

  try {
    createdActivity = await createActivity(input.employeeId, customer.username, activityDate, recordedAt)
  } catch (error) {
    const duplicateActivity = await fetchExistingActivity(input.employeeId, activityDate)

    if (duplicateActivity) {
      return {
        created: false,
        recordedAt: recordedAt.toISOString(),
        activity: mapEmployeeActivityDbRowToRecord(duplicateActivity, customer)
      }
    }

    throw error
  }

  return {
    created: true,
    recordedAt: recordedAt.toISOString(),
    activity: mapEmployeeActivityDbRowToRecord(createdActivity, customer)
  }
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
