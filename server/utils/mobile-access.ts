import type { H3Event } from 'h3'
import type { AuthRole, AuthSession } from '~~/shared/types/auth'
import {
  fetchCustomerProfileById,
  fetchErpUserById,
  isAuthRole,
  mapCustomerToSession,
  mapUserToSession,
  verifyAuthToken,
  type CustomerProfileRow,
  type ErpUserAuthRow,
  type VerifiedAuthTokenPayload
} from './auth'
import { getSupabaseServerConfig, getSupabaseServerHeaders } from './supabase'

interface ObjectRow {
  id: number
  building_id?: number | null
  name: string
  description?: string | null
  address?: string | null
  code?: string | null
  is_active?: boolean | null
}

export interface MobileObjectRecord {
  id: number
  buildingId?: number | null
  name: string
  description?: string
  address?: string
  code?: string
  isActive: boolean
}

export interface MobileAccessContext {
  source: 'customer' | 'erp'
  role: AuthRole
  frontend: 'employee' | 'erp'
  user: AuthSession
  payload: VerifiedAuthTokenPayload
  customer?: CustomerProfileRow
  erpUser?: ErpUserAuthRow
  objects: MobileObjectRecord[]
  objectIds: number[]
  objectNames: string[]
  buildingId?: number | null
}

function mapObjectRow(row: ObjectRow): MobileObjectRecord {
  return {
    id: row.id,
    buildingId: row.building_id ?? null,
    name: row.name,
    description: row.description || undefined,
    address: row.address || undefined,
    code: row.code || undefined,
    isActive: row.is_active !== false
  }
}

function getFrontend(role: AuthRole): 'employee' | 'erp' {
  return role === 'customer' ? 'employee' : 'erp'
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
    statusMessage: 'Missing bearer token.'
  })
}

async function fetchObjectsByBuilding(buildingId?: number | null) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const query: Record<string, string> = {
    select: 'id,building_id,name,description,address,code,is_active',
    order: 'id.asc'
  }

  if (Number.isInteger(buildingId) && (buildingId ?? 0) > 0) {
    query.building_id = `eq.${buildingId}`
  }

  const rows = await $fetch<ObjectRow[]>(`${url}/rest/v1/objects`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query
  })

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
    : []

  return {
    source: 'customer',
    role: user.role,
    frontend: getFrontend(user.role),
    user,
    payload,
    customer,
    objects,
    objectIds: objects.map(object => object.id),
    objectNames: objects.map(object => object.name),
    buildingId: customer.building_id ?? null
  }
}

async function buildErpAccess(userRow: ErpUserAuthRow, payload: VerifiedAuthTokenPayload): Promise<MobileAccessContext> {
  if (userRow.is_active === false || !isAuthRole(userRow.role)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'User is inactive.'
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
    buildingId: null
  }
}

export async function resolveMobileAccessFromPayload(payload: VerifiedAuthTokenPayload): Promise<MobileAccessContext> {
  const [source, idRaw] = payload.sub.split(':')
  const entityId = Number(idRaw)

  if (!Number.isInteger(entityId) || entityId <= 0) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid auth token subject.'
    })
  }

  if (source === 'customer') {
    const customer = await fetchCustomerProfileById(entityId)
    if (!customer) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Customer not found.'
      })
    }

    return await buildCustomerAccess(customer, payload)
  }

  if (source === 'erp') {
    const userRow = await fetchErpUserById(entityId)
    if (!userRow) {
      throw createError({
        statusCode: 401,
        statusMessage: 'ERP user not found.'
      })
    }

    return await buildErpAccess(userRow, payload)
  }

  throw createError({
    statusCode: 401,
    statusMessage: 'Unsupported auth token subject.'
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
      statusMessage: 'Invalid objectId.'
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
      statusMessage: 'Object access denied.'
    })
  }

  return [requestedObjectId]
}

export function findAccessibleObject(context: MobileAccessContext, objectId: number) {
  return context.objects.find(object => object.id === objectId)
}
