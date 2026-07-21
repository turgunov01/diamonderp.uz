import type { H3Event } from 'h3'
import type { AuthRole, AuthSession } from '~~/shared/types/auth'
import {
  fetchCustomerProfileById,
  fetchErpUserById,
  isErpAuthRole,
  mapCustomerToSession,
  mapUserToSession,
  verifyAuthToken,
  type CustomerProfileRow,
  type ErpUserAuthRow,
  type VerifiedAuthTokenPayload
} from './auth'
import { getDataApiServerConfig, getDataApiServerHeaders } from './data-api'
import {
  DEFAULT_WORK_SCHEDULE_TYPE,
  normalizeWorkScheduleType,
  type WorkScheduleType
} from '~~/shared/utils/work-schedules'
import { resolveWorkScheduleTypeFromObjects } from './object-schedules'

interface ObjectRow {
  id: number
  building_id?: number | null
  name: string
  description?: string | null
  address?: string | null
  code?: string | null
  is_active?: boolean | null
  schedule_type?: WorkScheduleType | string | null
}

export type MobileFrontend = 'erp' | 'employee' | 'manager' | 'supervisor' | 'procurement'
export type MobileSource = 'erp' | AuthRole

export interface MobileObjectRecord {
  id: number
  buildingId?: number | null
  name: string
  description?: string
  address?: string
  code?: string
  isActive: boolean
  scheduleType: WorkScheduleType
}

export interface MobileAccessContext {
  source: MobileSource
  role: AuthRole
  frontend: MobileFrontend
  user: AuthSession
  payload: VerifiedAuthTokenPayload
  customer?: CustomerProfileRow
  erpUser?: ErpUserAuthRow
  objects: MobileObjectRecord[]
  objectIds: number[]
  objectNames: string[]
  buildingId?: number | null
  scheduleType?: WorkScheduleType
}

function mapObjectRow(row: ObjectRow): MobileObjectRecord {
  const objectId = Number(row.id)
  const buildingId = row.building_id === null || row.building_id === undefined
    ? null
    : Number(row.building_id)

  return {
    id: Number.isInteger(objectId) && objectId > 0 ? objectId : row.id,
    buildingId: Number.isInteger(buildingId) && buildingId > 0 ? buildingId : null,
    name: row.name,
    description: row.description || undefined,
    address: row.address || undefined,
    code: row.code || undefined,
    isActive: row.is_active !== false,
    scheduleType: normalizeWorkScheduleType(row.schedule_type)
  }
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

function getFrontend(role: AuthRole): MobileFrontend {
  if (role === 'admin' || role === 'hr') {
    return 'erp'
  }

  if (role === 'manager') {
    return 'manager'
  }

  if (role === 'supervisor') {
    return 'supervisor'
  }

  if (role === 'procurement') {
    return 'procurement'
  }

  return 'employee'
}

export function isFrontlineMobileRole(role: AuthRole) {
  return role !== 'admin'
    && role !== 'hr'
    && role !== 'procurement'
    && role !== 'manager'
    && role !== 'supervisor'
}

export function isFrontlineMobileAccess(
  context: MobileAccessContext
): context is MobileAccessContext & { customer: CustomerProfileRow } {
  return Boolean(context.customer) && isFrontlineMobileRole(context.role)
}

const EMPLOYEE_TASK_ROLES = new Set(['cleaner', 'manager'])

export function isMobileEmployeeTaskRole(role: unknown) {
  const normalizedRole = typeof role === 'string' && role.trim()
    ? role.trim().toLowerCase()
    : 'customer'

  return EMPLOYEE_TASK_ROLES.has(normalizedRole)
}

export function isMobileEmployeeTaskAccess(
  context: MobileAccessContext
): context is MobileAccessContext & { customer: CustomerProfileRow } {
  return Boolean(context.customer) && isMobileEmployeeTaskRole(context.role)
}

function readBearerToken(event: H3Event) {
  const authorization = getHeader(event, 'authorization') || getHeader(event, 'Authorization')
  if (typeof authorization === 'string' && authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim()
  }

  const cookieToken = getCookie(event, 'diamond-erp-token')
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim()
  }

  throw createError({
    statusCode: 401,
    message: 'Missing bearer token.'
  })
}

async function fetchObjectsByBuilding(buildingId?: number | null) {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const query: Record<string, string> = {
    select: 'id,building_id,name,description,address,code,is_active,schedule_type',
    order: 'id.asc'
  }

  if (Number.isInteger(buildingId) && (buildingId ?? 0) > 0) {
    query.building_id = `eq.${buildingId}`
  }

  let rows: ObjectRow[]

  try {
    rows = await $fetch<ObjectRow[]>(`${url}/rest/v1/objects`, {
      headers: getDataApiServerHeaders(serviceRoleKey),
      query
    })
  } catch (error) {
    if (!isMissingScheduleTypeColumn(error)) {
      throw error
    }

    const fallbackQuery: Record<string, string> = {
      select: 'id,building_id,name,description,address,code,is_active',
      order: 'id.asc'
    }

    if (Number.isInteger(buildingId) && (buildingId ?? 0) > 0) {
      fallbackQuery.building_id = `eq.${buildingId}`
    }

    rows = await $fetch<ObjectRow[]>(`${url}/rest/v1/objects`, {
      headers: getDataApiServerHeaders(serviceRoleKey),
      query: fallbackQuery
    })
  }

  return rows.map(mapObjectRow)
}

function normalizeObjectNames(customer: CustomerProfileRow) {
  return Array.from(new Set([
    customer.object_pinned?.trim(),
    ...(Array.isArray(customer.object_positions) ? customer.object_positions : [])
      .map(value => typeof value === 'string' ? value.trim() : '')
  ].filter((value): value is string => Boolean(value))))
}

async function buildCustomerAccess(customer: CustomerProfileRow, payload: VerifiedAuthTokenPayload): Promise<MobileAccessContext> {
  const user = mapCustomerToSession(customer)
  const allowedObjectNames = normalizeObjectNames(customer)
  const buildingObjects = await fetchObjectsByBuilding(customer.building_id ?? null)
  const objects = allowedObjectNames.length
    ? buildingObjects.filter(object => allowedObjectNames.includes(object.name.trim()))
    : (isFrontlineMobileRole(user.role) ? [] : buildingObjects)

  const scheduleSourceObjects = objects.length ? objects : buildingObjects
  const scheduleRows = scheduleSourceObjects.map(object => ({
    id: object.id,
    building_id: object.buildingId,
    name: object.name,
    schedule_type: object.scheduleType
  }))
  const scheduleType = resolveWorkScheduleTypeFromObjects(customer, scheduleRows)

  return {
    source: user.role,
    role: user.role,
    frontend: getFrontend(user.role),
    user,
    payload,
    customer,
    objects,
    objectIds: objects.map(object => object.id),
    objectNames: objects.map(object => object.name),
    buildingId: customer.building_id ?? null,
    scheduleType
  }
}

async function buildErpAccess(userRow: ErpUserAuthRow, payload: VerifiedAuthTokenPayload): Promise<MobileAccessContext> {
  if (userRow.is_active === false || !isErpAuthRole(userRow.role)) {
    throw createError({
      statusCode: 401,
      message: 'User is inactive.'
    })
  }

  const user = mapUserToSession(userRow)
  const objects = await fetchObjectsByBuilding()

  return {
    source: 'erp',
    role: user.role,
    frontend: getFrontend(user.role),
    user,
    payload,
    erpUser: userRow,
    objects,
    objectIds: objects.map(object => object.id),
    objectNames: objects.map(object => object.name),
    buildingId: null,
    scheduleType: DEFAULT_WORK_SCHEDULE_TYPE
  }
}

export async function resolveMobileAccessFromPayload(payload: VerifiedAuthTokenPayload): Promise<MobileAccessContext> {
  const [source, idRaw] = payload.sub.split(':')
  const entityId = Number(idRaw)

  if (!Number.isInteger(entityId) || entityId <= 0) {
    throw createError({
      statusCode: 401,
      message: 'Invalid auth token subject.'
    })
  }

  if (source === 'customer') {
    const customer = await fetchCustomerProfileById(entityId)
    if (!customer) {
      throw createError({
        statusCode: 401,
        message: 'Customer not found.'
      })
    }

    return await buildCustomerAccess(customer, payload)
  }

  if (source === 'erp') {
    const userRow = await fetchErpUserById(entityId)
    if (!userRow) {
      throw createError({
        statusCode: 401,
        message: 'ERP user not found.'
      })
    }

    return await buildErpAccess(userRow, payload)
  }

  throw createError({
    statusCode: 401,
    message: 'Unsupported auth token subject.'
  })
}

export async function requireMobileAccess(event: H3Event): Promise<MobileAccessContext> {
  const token = readBearerToken(event)
  return await resolveMobileAccessFromPayload(verifyAuthToken(token))
}

export function parseRequestedObjectId(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  const objectId = typeof value === 'string' || typeof value === 'number'
    ? Number(value)
    : NaN

  if (!Number.isInteger(objectId) || objectId <= 0) {
    throw createError({
      statusCode: 400,
      message: 'Invalid objectId.'
    })
  }

  return objectId
}

export function resolveScopedObjectIds(context: MobileAccessContext, requestedObjectId?: number) {
  if (requestedObjectId === undefined) {
    return context.objectIds
  }

  if (!context.objectIds.includes(requestedObjectId)) {
    throw createError({
      statusCode: 403,
      message: 'Object access denied.'
    })
  }

  return [requestedObjectId]
}

export function findAccessibleObject(context: MobileAccessContext, objectId: number) {
  // Object ids arrive from the data API as strings while callers pass a parsed
  // Number, so compare them numerically to avoid a strict-equality miss (404).
  return context.objects.find(object => Number(object.id) === Number(objectId))
}
