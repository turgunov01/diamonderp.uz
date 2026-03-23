import { listEmployeeActivities } from '../../utils/employee-activity'

function parseDateFilter(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined
}

function parseBuildingId(value: unknown) {
  const buildingId = typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(buildingId) && buildingId > 0 ? buildingId : undefined
}

function parseEmployeeIds(value: unknown) {
  const rawValues = Array.isArray(value) ? value : [value]
  const employeeIds = rawValues
    .flatMap(rawValue => typeof rawValue === 'string' ? rawValue.split(',') : [])
    .map(rawValue => Number(rawValue.trim()))
    .filter((employeeId): employeeId is number => Number.isInteger(employeeId) && employeeId > 0)

  return employeeIds.length ? [...new Set(employeeIds)] : undefined
}

export default eventHandler(async (event) => {
  const query = getQuery(event)

  return await listEmployeeActivities({
    from: parseDateFilter(query.from),
    to: parseDateFilter(query.to),
    buildingId: parseBuildingId(query.buildingId),
    employeeIds: parseEmployeeIds(query.employeeIds)
  })
})
