import { recordEmployeeActivity } from '../../../utils/employee-activity'
import { recordEmployeeLocationPoints, type EmployeeLocationPointInput } from '../../../utils/employee-locations'
import { isFrontlineMobileAccess, requireMobileAccess } from '../../../utils/mobile-access'

interface LocationPointBody {
  location?: unknown
  locations?: unknown[]
  recordedAt?: string
}

interface NormalizedLocationPointBody {
  location: unknown
  recordedAt?: string
}

const MAX_LOCATION_POINTS_PER_REQUEST = 250

function getValidCapturedAt(location: unknown) {
  if (!location || typeof location !== 'object') {
    return undefined
  }

  const capturedAt = (location as Record<string, unknown>).capturedAt
  if (typeof capturedAt !== 'string' || !capturedAt.trim()) {
    return undefined
  }

  const date = new Date(capturedAt)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function normalizeLocationItem(rawItem: unknown, fallbackRecordedAt?: string): NormalizedLocationPointBody {
  if (rawItem && typeof rawItem === 'object' && 'location' in rawItem) {
    const item = rawItem as { location?: unknown, recordedAt?: unknown }
    return {
      location: item.location,
      recordedAt: typeof item.recordedAt === 'string'
        ? item.recordedAt
        : fallbackRecordedAt || getValidCapturedAt(item.location)
    }
  }

  return {
    location: rawItem,
    recordedAt: fallbackRecordedAt || getValidCapturedAt(rawItem)
  }
}

function normalizeLocationBody(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request body must be a valid JSON object.'
    })
  }

  const input = body as LocationPointBody
  const fallbackRecordedAt = typeof input.recordedAt === 'string' ? input.recordedAt : undefined
  const items = Array.isArray(input.locations)
    ? input.locations.map(item => normalizeLocationItem(item, fallbackRecordedAt))
    : [normalizeLocationItem(input.location, fallbackRecordedAt)]

  if (!items.length || items.some(item => item.location === undefined || item.location === null)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'location or locations must be provided.'
    })
  }

  if (items.length > MAX_LOCATION_POINTS_PER_REQUEST) {
    throw createError({
      statusCode: 413,
      statusMessage: `At most ${MAX_LOCATION_POINTS_PER_REQUEST} location points are allowed per request.`
    })
  }

  return items
}

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  if (!isFrontlineMobileAccess(access)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only employee accounts can record location points.'
    })
  }

  const points = normalizeLocationBody(await readBody(event).catch(() => null))
  const pointsToInsert: EmployeeLocationPointInput[] = []

  for (const point of points) {
    const activity = await recordEmployeeActivity({
      employeeId: access.customer.id,
      recordedAt: point.recordedAt,
      location: point.location
    })

    pointsToInsert.push({
      employeeId: access.customer.id,
      employeeName: access.customer.username,
      activityId: activity.activity.id,
      buildingId: access.customer.building_id ?? null,
      recordedAt: activity.recordedAt,
      location: point.location
    })
  }

  const records = await recordEmployeeLocationPoints({
    points: pointsToInsert
  })

  return {
    role: access.role,
    frontend: access.frontend,
    count: records.length,
    locations: records
  }
})
