import { listEmployeeLocationPoints } from '../../../utils/employee-locations'

function parseDateFilter(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined
}

function parsePositiveInteger(value: unknown) {
  const parsed = typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function parseEmployeeIds(value: unknown) {
  const rawValues = Array.isArray(value) ? value : [value]
  const employeeIds = rawValues
    .flatMap(rawValue => typeof rawValue === 'string' ? rawValue.split(',') : [])
    .map(rawValue => Number(rawValue.trim()))
    .filter((employeeId): employeeId is number => Number.isInteger(employeeId) && employeeId > 0)

  return employeeIds.length ? [...new Set(employeeIds)] : undefined
}

function parseLimit(value: unknown) {
  const parsed = typeof value === 'string' ? Number(value) : NaN
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 1000
  }

  return Math.min(parsed, 5000)
}

export default eventHandler(async (event) => {
  const query = getQuery(event)

  return await listEmployeeLocationPoints({
    activityId: parsePositiveInteger(query.activityId),
    from: parseDateFilter(query.from),
    to: parseDateFilter(query.to),
    buildingId: parsePositiveInteger(query.buildingId),
    employeeIds: parseEmployeeIds(query.employeeIds),
    limit: parseLimit(query.limit)
  })
})
