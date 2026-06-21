import {
  getLegacyWorkScheduleType,
  normalizeWorkScheduleType,
  type WorkScheduleSalaryType,
  type WorkScheduleShift,
  type WorkScheduleType
} from '~~/shared/utils/work-schedules'
import { getDataApiServerConfig, getDataApiServerHeaders } from './data-api'

export interface ObjectScheduleRow {
  id: number
  building_id?: number | null
  name: string
  schedule_type?: WorkScheduleType | string | null
}

export interface ScheduleCustomerLike {
  buildingId?: number | null
  building_id?: number | null
  objectPinned?: string | null
  object_pinned?: string | null
  objectPositions?: string[] | null
  object_positions?: string[] | null
  workShift?: WorkScheduleShift | null
  work_shift?: WorkScheduleShift | null
  salaryType?: WorkScheduleSalaryType | null
  salary_type?: WorkScheduleSalaryType | null
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

function getCustomerBuildingId(customer: ScheduleCustomerLike) {
  return customer.buildingId ?? customer.building_id ?? null
}

function getCustomerObjectNames(customer: ScheduleCustomerLike) {
  const pinned = (customer.objectPinned ?? customer.object_pinned ?? '').trim()
  const positions = customer.objectPositions ?? customer.object_positions ?? []
  const normalizedPositions = Array.isArray(positions)
    ? positions.map(position => (typeof position === 'string' ? position.trim() : '')).filter(Boolean)
    : []

  return Array.from(new Set([
    pinned,
    ...normalizedPositions
  ].filter(Boolean)))
}

function getLegacyScheduleType(customer: ScheduleCustomerLike) {
  return getLegacyWorkScheduleType({
    workShift: customer.workShift ?? customer.work_shift ?? null,
    salaryType: customer.salaryType ?? customer.salary_type ?? null
  })
}

function buildObjectScheduleMap(rows: ObjectScheduleRow[]) {
  const map = new Map<string, ObjectScheduleRow>()

  for (const row of rows) {
    const name = row.name?.trim()
    if (!name) continue

    map.set(`${row.building_id ?? 'global'}:${name}`, row)
    if (!map.has(`any:${name}`)) {
      map.set(`any:${name}`, row)
    }
  }

  return map
}

export async function listObjectSchedules(buildingId?: number | null) {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const query: Record<string, string> = {
    select: 'id,building_id,name,schedule_type',
    order: 'id.asc'
  }

  if (Number.isInteger(buildingId) && (buildingId ?? 0) > 0) {
    query.building_id = `eq.${buildingId}`
  }

  try {
    return await $fetch<ObjectScheduleRow[]>(`${url}/rest/v1/objects`, {
      headers: getDataApiServerHeaders(serviceRoleKey),
      query
    })
  } catch (error) {
    if (!isMissingScheduleTypeColumn(error)) {
      throw error
    }

    const fallbackQuery: Record<string, string> = {
      select: 'id,building_id,name',
      order: 'id.asc'
    }

    if (Number.isInteger(buildingId) && (buildingId ?? 0) > 0) {
      fallbackQuery.building_id = `eq.${buildingId}`
    }

    return await $fetch<ObjectScheduleRow[]>(`${url}/rest/v1/objects`, {
      headers: getDataApiServerHeaders(serviceRoleKey),
      query: fallbackQuery
    })
  }
}

export function resolveWorkScheduleTypeFromObjects(
  customer: ScheduleCustomerLike,
  objects: ObjectScheduleRow[]
): WorkScheduleType {
  const legacyType = getLegacyScheduleType(customer)
  const names = getCustomerObjectNames(customer)

  if (!names.length || !objects.length) {
    return legacyType
  }

  const buildingId = getCustomerBuildingId(customer)
  const map = buildObjectScheduleMap(objects)

  for (const name of names) {
    const object = map.get(`${buildingId ?? 'global'}:${name}`) || map.get(`any:${name}`)
    if (object) {
      return normalizeWorkScheduleType(object.schedule_type, legacyType)
    }
  }

  return legacyType
}

export async function resolveWorkScheduleTypeForCustomer(
  customer: ScheduleCustomerLike
): Promise<WorkScheduleType> {
  const objects = await listObjectSchedules(getCustomerBuildingId(customer))
  return resolveWorkScheduleTypeFromObjects(customer, objects)
}
