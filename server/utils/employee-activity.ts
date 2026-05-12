import { getSupabaseServerConfig, getSupabaseServerHeaders } from './supabase'

export type EmployeeActivityStatus = 'on_time' | 'late' | 'absent'

type EmployeeWorkShift = 'day' | 'night'

interface EmployeeActivityDbRow {
  id: number
  employee_id: number | null
  employee_name: string | null
  activity_date: string
  status: EmployeeActivityStatus
  work_minutes: number | null
  late_minutes: number | null
  started_at?: string | null
  finished_at?: string | null
}

interface ActivityCustomerRow {
  id: number
  building_id?: number | null
  username: string
  work_shift?: EmployeeWorkShift | null
  object_pinned?: string | null
}

export interface EmployeeActivityRecord {
  id: number
  employeeId: number | null
  employeeName: string
  date: string
  startedAt: string | null
  finishedAt: string | null
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

const EMPLOYEE_ACTIVITY_SELECT_LEGACY = 'id,employee_id,employee_name,activity_date,status,work_minutes,late_minutes'
const EMPLOYEE_ACTIVITY_SELECT_WITH_TIMES = `${EMPLOYEE_ACTIVITY_SELECT_LEGACY},started_at,finished_at`

function isMissingEmployeeActivityTimeColumns(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const payload = error as { data?: { code?: string, message?: string }, code?: string, message?: string }
  const code = payload.data?.code || payload.code
  const message = payload.data?.message || payload.message

  if (code !== 'PGRST204' && code !== '42703') {
    return false
  }

  if (typeof message !== 'string') {
    return false
  }

  return message.includes('started_at') || message.includes('finished_at')
}

function normalizeEmployeeIds(rows: EmployeeActivityDbRow[]) {
  return [...new Set(
    rows
      .map(row => row.employee_id)
      .filter((employeeId): employeeId is number => typeof employeeId === 'number' && Number.isInteger(employeeId) && employeeId > 0)
  )]
}

function buildEmployeeActivityUrl(baseUrl: string, options: ListEmployeeActivitiesOptions, select: string) {
  const params = new URLSearchParams()

  params.set('select', select)
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
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
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

const TASHKENT_UTC_OFFSET_HOURS = 5
const DAY_SHIFT_START_HOUR = 8
const DAY_SHIFT_END_HOUR = 20
const NIGHT_SHIFT_START_HOUR = 20
const NIGHT_SHIFT_END_HOUR = 8

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

function normalizeWorkShift(value: unknown): EmployeeWorkShift | null {
  return value === 'day' || value === 'night' ? value : null
}

function shiftDate(year: number, month: number, day: number, hour: number, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - TASHKENT_UTC_OFFSET_HOURS, minute, 0))
}

function addTashkentDays(input: { year: number, month: number, day: number }, offsetDays: number) {
  const date = new Date(Date.UTC(input.year, input.month - 1, input.day))
  date.setUTCDate(date.getUTCDate() + offsetDays)

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  }
}

function parseActivityDate(value: string) {
  const normalized = value.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)
  if (!match) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Invalid employee activity date format.'
    })
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  }
}

function getShiftStartHour(workShift: EmployeeWorkShift | null) {
  return workShift === 'night' ? NIGHT_SHIFT_START_HOUR : DAY_SHIFT_START_HOUR
}

function getShiftEndHour(workShift: EmployeeWorkShift | null) {
  return workShift === 'night' ? NIGHT_SHIFT_END_HOUR : DAY_SHIFT_END_HOUR
}

function buildShiftRange(activityDate: string, workShift: EmployeeWorkShift | null) {
  const { year, month, day } = parseActivityDate(activityDate)
  const startHour = getShiftStartHour(workShift)
  const endHour = getShiftEndHour(workShift)
  const startAt = shiftDate(year, month, day, startHour)

  if (workShift === 'night') {
    const nextDate = addTashkentDays({ year, month, day }, 1)
    return {
      startAt,
      endAt: shiftDate(nextDate.year, nextDate.month, nextDate.day, endHour)
    }
  }

  return {
    startAt,
    endAt: shiftDate(year, month, day, endHour)
  }
}

function clampDate(value: Date, from: Date, to: Date) {
  if (value <= from) return from
  if (value >= to) return to
  return value
}

function buildInitialActivityStatus(recordedAt: Date, workShiftRaw?: unknown) {
  const parts = getTashkentParts(recordedAt)
  const workShift = normalizeWorkShift(workShiftRaw)

  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)

  if ([year, month, day].some(value => Number.isNaN(value))) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to resolve Asia/Tashkent shift date parts.'
    })
  }

  let shiftDateParts = { year, month, day }

  if (workShift === 'night' && parts.hour < NIGHT_SHIFT_END_HOUR) {
    shiftDateParts = addTashkentDays(shiftDateParts, -1)
  }

  const activityDate = `${shiftDateParts.year.toString().padStart(4, '0')}-${shiftDateParts.month.toString().padStart(2, '0')}-${shiftDateParts.day.toString().padStart(2, '0')}`
  const shiftStartAt = shiftDate(shiftDateParts.year, shiftDateParts.month, shiftDateParts.day, getShiftStartHour(workShift))
  const lateMinutes = Math.max(0, Math.floor((recordedAt.getTime() - shiftStartAt.getTime()) / 60000))

  if (lateMinutes <= 0) {
    return {
      activityDate,
      status: 'on_time' as const,
      lateMinutes: 0
    }
  }

  return {
    activityDate,
    status: 'late' as const,
    lateMinutes
  }
}

async function fetchActivityCustomer(employeeId: number) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const rows = await $fetch<ActivityCustomerRow[]>(`${url}/rest/v1/customers`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query: {
      select: 'id,building_id,username,work_shift,object_pinned',
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
  let rows: EmployeeActivityDbRow[]

  try {
    rows = await $fetch<EmployeeActivityDbRow[]>(`${url}/rest/v1/employee_activity`, {
      headers: getSupabaseServerHeaders(serviceRoleKey),
      query: {
        select: EMPLOYEE_ACTIVITY_SELECT_WITH_TIMES,
        employee_id: `eq.${employeeId}`,
        activity_date: `eq.${activityDate}`,
        limit: '1'
      }
    })
  } catch (error) {
    if (!isMissingEmployeeActivityTimeColumns(error)) {
      throw error
    }

    rows = await $fetch<EmployeeActivityDbRow[]>(`${url}/rest/v1/employee_activity`, {
      headers: getSupabaseServerHeaders(serviceRoleKey),
      query: {
        select: EMPLOYEE_ACTIVITY_SELECT_LEGACY,
        employee_id: `eq.${employeeId}`,
        activity_date: `eq.${activityDate}`,
        limit: '1'
      }
    })
  }

  return rows[0]
}

async function createActivity(
  employeeId: number,
  employeeName: string,
  activityDate: string,
  startedAt: string,
  initialStatus: { status: EmployeeActivityStatus, lateMinutes: number }
) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  let rows: EmployeeActivityDbRow[]

  try {
    rows = await $fetch<EmployeeActivityDbRow[]>(`${url}/rest/v1/employee_activity`, {
      method: 'POST',
      headers: {
        ...getSupabaseServerHeaders(serviceRoleKey),
        Prefer: 'return=representation'
      },
      body: {
        employee_id: employeeId,
        employee_name: employeeName,
        activity_date: activityDate,
        started_at: startedAt,
        status: initialStatus.status,
        work_minutes: 0,
        late_minutes: initialStatus.lateMinutes
      }
    })
  } catch (error) {
    if (!isMissingEmployeeActivityTimeColumns(error)) {
      throw error
    }

    rows = await $fetch<EmployeeActivityDbRow[]>(`${url}/rest/v1/employee_activity`, {
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
  }

  const createdActivity = rows[0]
  if (!createdActivity) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create employee activity.'
    })
  }

  return createdActivity
}

async function updateActivity(activityId: number, body: Record<string, unknown>) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const rows = await $fetch<EmployeeActivityDbRow[]>(`${url}/rest/v1/employee_activity`, {
    method: 'PATCH',
    headers: {
      ...getSupabaseServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    query: {
      id: `eq.${activityId}`
    },
    body
  })

  const updatedActivity = rows[0]
  if (!updatedActivity) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Employee activity record not found.'
    })
  }

  return updatedActivity
}

export async function listEmployeeActivities(options: ListEmployeeActivitiesOptions = {}) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  let rows: EmployeeActivityDbRow[]

  try {
    rows = await $fetch<EmployeeActivityDbRow[]>(buildEmployeeActivityUrl(url, options, EMPLOYEE_ACTIVITY_SELECT_WITH_TIMES), {
      headers: getSupabaseServerHeaders(serviceRoleKey)
    })
  } catch (error) {
    if (!isMissingEmployeeActivityTimeColumns(error)) {
      throw error
    }

    rows = await $fetch<EmployeeActivityDbRow[]>(buildEmployeeActivityUrl(url, options, EMPLOYEE_ACTIVITY_SELECT_LEGACY), {
      headers: getSupabaseServerHeaders(serviceRoleKey)
    })
  }

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
  const customer = await fetchActivityCustomer(input.employeeId)
  const initialStatus = buildInitialActivityStatus(recordedAt, customer.work_shift)
  const activityDate = initialStatus.activityDate
  const existingActivity = await fetchExistingActivity(input.employeeId, activityDate)

  if (existingActivity) {
    const recordedAtIso = recordedAt.toISOString()

    let activity = existingActivity

    if (!existingActivity.started_at) {
      try {
        activity = await updateActivity(existingActivity.id, {
          started_at: recordedAtIso
        })
      } catch (error) {
        if (!isMissingEmployeeActivityTimeColumns(error)) {
          throw error
        }
      }
    }

    return {
      created: false,
      recordedAt: recordedAtIso,
      activity: mapEmployeeActivityDbRowToRecord(activity, customer)
    }
  }

  let createdActivity: EmployeeActivityDbRow

  try {
    createdActivity = await createActivity(
      input.employeeId,
      customer.username,
      activityDate,
      recordedAt.toISOString(),
      initialStatus
    )
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

export interface FinishEmployeeWorkResult {
  finishedAt: string
  activity: EmployeeActivityRecord
}

export async function finishEmployeeWork(input: {
  employeeId: number
  finishedAt?: string | Date | null
  employeeName?: string
  workShift?: EmployeeWorkShift | null
  objectPinned?: string | null
}): Promise<FinishEmployeeWorkResult> {
  assertEmployeeId(input.employeeId)

  const finishedAt = parseRecordedAt(input.finishedAt)

  const workShift = normalizeWorkShift(input.workShift)
  const employeeName = typeof input.employeeName === 'string' && input.employeeName.trim()
    ? input.employeeName.trim()
    : undefined
  const objectPinned = input.objectPinned

  if (objectPinned !== undefined && !objectPinned?.trim()) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Employee is disabled and cannot record activity.'
    })
  }

  const customer = employeeName === undefined || objectPinned === undefined || input.workShift === undefined
    ? await fetchActivityCustomer(input.employeeId)
    : undefined

  const effectiveEmployeeName = employeeName ?? customer?.username ?? `Employee #${input.employeeId}`
  const effectiveWorkShift = workShift ?? normalizeWorkShift(customer?.work_shift) ?? null

  const parts = getTashkentParts(finishedAt)
  const today = formatDateInTashkent(finishedAt)
  const yesterday = (() => {
    const y = addTashkentDays({
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day)
    }, -1)

    return `${y.year.toString().padStart(4, '0')}-${y.month.toString().padStart(2, '0')}-${y.day.toString().padStart(2, '0')}`
  })()

  const prefersToday = effectiveWorkShift !== 'night' || parts.hour >= NIGHT_SHIFT_START_HOUR
  const primaryDate = prefersToday ? today : yesterday
  const fallbackDate = prefersToday ? yesterday : today

  let activity = await fetchExistingActivity(input.employeeId, primaryDate)

  if (!activity && fallbackDate !== primaryDate) {
    activity = await fetchExistingActivity(input.employeeId, fallbackDate)
  }

  if (!activity) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Employee activity record not found for the current shift.'
    })
  }

  const { startAt, endAt } = buildShiftRange(activity.activity_date, effectiveWorkShift)
  const finishedAtClamped = clampDate(finishedAt, startAt, endAt)
  const durationMinutes = Math.floor((finishedAtClamped.getTime() - startAt.getTime()) / 60000)
  const lateMinutes = activity.late_minutes ?? 0

  const workMinutes = activity.status === 'absent'
    ? 0
    : Math.max(0, durationMinutes - lateMinutes)

  const patchBody: Record<string, unknown> = {
    work_minutes: workMinutes
  }

  if (activity.status === 'absent') {
    patchBody.late_minutes = 0
  }

  const finishedAtIso = finishedAt.toISOString()
  let updatedActivity: EmployeeActivityDbRow

  try {
    updatedActivity = await updateActivity(activity.id, {
      ...patchBody,
      finished_at: finishedAtIso
    })
  } catch (error) {
    if (!isMissingEmployeeActivityTimeColumns(error)) {
      throw error
    }

    updatedActivity = await updateActivity(activity.id, patchBody)
  }

  return {
    finishedAt: finishedAtIso,
    activity: mapEmployeeActivityDbRowToRecord(updatedActivity, {
      id: input.employeeId,
      username: effectiveEmployeeName
    })
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
