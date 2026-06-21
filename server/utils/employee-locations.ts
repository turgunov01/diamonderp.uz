import { serializeAuthLocation } from './auth-locations'
import { getDataApiServerConfig, getDataApiServerHeaders } from './data-api'

export interface EmployeeLocationPointRecord {
  id: number
  employeeId: number
  employeeName: string
  activityId: number | null
  buildingId: number | null
  recordedAt: string
  capturedAt: string | null
  latitude: number
  longitude: number
  accuracy: number | null
  altitude: number | null
  altitudeAccuracy: number | null
  heading: number | null
  speed: number | null
  mapUrl: string
}

interface EmployeeLocationPointDbRow {
  id: number
  employee_id: number
  activity_id: number | null
  building_id: number | null
  recorded_at: string
  captured_at: string | null
  latitude: number
  longitude: number
  accuracy_meters: number | null
  altitude: number | null
  altitude_accuracy_meters: number | null
  heading: number | null
  speed: number | null
  location: { mapUrl?: string | null } | null
}

interface ActivityCustomerRow {
  id: number
  username: string
}

export interface EmployeeLocationPointInput {
  employeeId: number
  employeeName?: string | null
  activityId?: number | null
  buildingId?: number | null
  recordedAt?: string | Date | null
  location: unknown
}

export interface ListEmployeeLocationPointsOptions {
  activityId?: number
  from?: string
  to?: string
  buildingId?: number
  employeeIds?: number[]
  limit?: number
}

function assertEmployeeId(employeeId: number) {
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'employeeId must be a positive integer.'
    })
  }
}

function normalizePositiveInteger(value?: number | null) {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value as number : null
}

export function parseLocationRecordedAt(value?: string | Date | null) {
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

function buildTashkentDateBoundary(value: string, endOfDay = false) {
  return `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:00`
}

function buildEmployeeLocationQuery(baseUrl: string, options: ListEmployeeLocationPointsOptions) {
  const params = new URLSearchParams()

  params.set('select', 'id,employee_id,activity_id,building_id,recorded_at,captured_at,latitude,longitude,accuracy_meters,altitude,altitude_accuracy_meters,heading,speed,location')
  params.set('order', 'recorded_at.asc,id.asc')
  params.set('limit', String(options.limit ?? 1000))

  if (options.activityId) {
    params.append('activity_id', `eq.${options.activityId}`)
  }

  if (options.from) {
    params.append('recorded_at', `gte.${buildTashkentDateBoundary(options.from)}`)
  }

  if (options.to) {
    params.append('recorded_at', `lte.${buildTashkentDateBoundary(options.to, true)}`)
  }

  if (options.buildingId) {
    params.append('building_id', `eq.${options.buildingId}`)
  }

  if (options.employeeIds?.length) {
    params.append('employee_id', `in.(${options.employeeIds.join(',')})`)
  }

  return `${baseUrl}/rest/v1/employee_location_points?${params.toString()}`
}

async function fetchCustomersByIds(employeeIds: number[]) {
  if (!employeeIds.length) {
    return new Map<number, ActivityCustomerRow>()
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const params = new URLSearchParams()

  params.set('select', 'id,username')
  params.set('id', `in.(${employeeIds.join(',')})`)

  const rows = await $fetch<ActivityCustomerRow[]>(`${url}/rest/v1/customers?${params.toString()}`, {
    headers: getDataApiServerHeaders(serviceRoleKey)
  })

  return new Map(rows.map(row => [row.id, row]))
}

function normalizeEmployeeIds(rows: EmployeeLocationPointDbRow[]) {
  return [...new Set(rows.map(row => row.employee_id).filter(employeeId => Number.isInteger(employeeId) && employeeId > 0))]
}

function isMissingEmployeeLocationPointsTable(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const payload = error as { data?: { code?: string, message?: string }, code?: string, message?: string, statusCode?: number, status?: number }
  const code = payload.data?.code || payload.code
  const message = payload.data?.message || payload.message
  const statusCode = payload.statusCode || payload.status

  return code === 'PGRST205'
    || (statusCode === 404 && typeof message === 'string' && message.includes('employee_location_points'))
}

function createMissingEmployeeLocationPointsTableError() {
  return createError({
    statusCode: 409,
    statusMessage: 'РўР°Р±Р»РёС†Р° employee_location_points РѕС‚СЃСѓС‚СЃС‚РІСѓРµС‚. РЎРЅР°С‡Р°Р»Р° РІС‹РїРѕР»РЅРёС‚Рµ db/postgres/employee_location_points.sql.'
  })
}

function mapEmployeeLocationPointDbRowToRecord(
  row: EmployeeLocationPointDbRow,
  customer?: ActivityCustomerRow,
  fallbackName?: string | null
): EmployeeLocationPointRecord {
  const mapUrl = row.location?.mapUrl || `https://www.google.com/maps?q=${row.latitude},${row.longitude}`

  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: customer?.username?.trim() || fallbackName?.trim() || `Employee #${row.employee_id}`,
    activityId: row.activity_id,
    buildingId: row.building_id,
    recordedAt: row.recorded_at,
    capturedAt: row.captured_at,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy_meters,
    altitude: row.altitude,
    altitudeAccuracy: row.altitude_accuracy_meters,
    heading: row.heading,
    speed: row.speed,
    mapUrl
  }
}

export async function recordEmployeeLocationPoints(input: { points: EmployeeLocationPointInput[] }) {
  const rowsToInsert = input.points.map((point) => {
    assertEmployeeId(point.employeeId)

    const recordedAt = parseLocationRecordedAt(point.recordedAt)
    const location = serializeAuthLocation(point.location)

    if (!location) {
      throw createError({
        statusCode: 400,
        statusMessage: 'location must contain valid latitude and longitude.'
      })
    }

    return {
      employee_id: point.employeeId,
      activity_id: normalizePositiveInteger(point.activityId),
      building_id: normalizePositiveInteger(point.buildingId),
      recorded_at: recordedAt.toISOString(),
      captured_at: location.capturedAt,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy_meters: location.accuracy,
      altitude: location.altitude,
      altitude_accuracy_meters: location.altitudeAccuracy,
      heading: location.heading,
      speed: location.speed,
      source: 'mobile',
      location
    }
  })

  if (!rowsToInsert.length) {
    return [] as EmployeeLocationPointRecord[]
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  let rows: EmployeeLocationPointDbRow[]

  try {
    rows = await $fetch<EmployeeLocationPointDbRow[]>(`${url}/rest/v1/employee_location_points`, {
      method: 'POST',
      headers: {
        ...getDataApiServerHeaders(serviceRoleKey),
        Prefer: 'return=representation'
      },
      body: rowsToInsert
    })
  } catch (error) {
    if (isMissingEmployeeLocationPointsTable(error)) {
      throw createMissingEmployeeLocationPointsTableError()
    }

    throw error
  }

  const fallbackNameByEmployeeId = new Map<number, string | null | undefined>()
  for (const point of input.points) {
    if (!fallbackNameByEmployeeId.has(point.employeeId)) {
      fallbackNameByEmployeeId.set(point.employeeId, point.employeeName)
    }
  }

  return rows.map(row => mapEmployeeLocationPointDbRowToRecord(
    row,
    undefined,
    fallbackNameByEmployeeId.get(row.employee_id)
  ))
}

export async function listEmployeeLocationPoints(options: ListEmployeeLocationPointsOptions = {}) {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  let rows: EmployeeLocationPointDbRow[]

  try {
    rows = await $fetch<EmployeeLocationPointDbRow[]>(buildEmployeeLocationQuery(url, options), {
      headers: getDataApiServerHeaders(serviceRoleKey)
    })
  } catch (error) {
    if (isMissingEmployeeLocationPointsTable(error)) {
      throw createMissingEmployeeLocationPointsTableError()
    }

    throw error
  }

  if (!rows.length) {
    return [] as EmployeeLocationPointRecord[]
  }

  const customersById = await fetchCustomersByIds(normalizeEmployeeIds(rows))

  return rows.map(row => mapEmployeeLocationPointDbRowToRecord(row, customersById.get(row.employee_id)))
}
