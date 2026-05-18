import type { H3Event } from 'h3'
import type { AuthLocationPayload, AuthRole } from '~~/shared/types/auth'
import { getSupabaseServerConfig, getSupabaseServerHeaders } from './supabase'

export type AuthLocationEventType = 'login' | 'logout'
export type AuthLocationSource = 'erp' | 'customer'

export interface AuthLocationRecordInput {
  event: H3Event
  source: AuthLocationSource
  userId: number
  role: AuthRole
  eventType: AuthLocationEventType
  location?: unknown
  occurredAt?: string
}

function normalizeNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return normalizeNumber(value)
}

function normalizeCapturedAt(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function normalizeAuthLocationPayload(value: unknown): AuthLocationPayload | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const input = value as Record<string, unknown>
  const latitude = normalizeNumber(input.latitude)
  const longitude = normalizeNumber(input.longitude)

  if (latitude === null || longitude === null) {
    return null
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null
  }

  return {
    latitude,
    longitude,
    accuracy: normalizeOptionalNumber(input.accuracy),
    altitude: normalizeOptionalNumber(input.altitude),
    altitudeAccuracy: normalizeOptionalNumber(input.altitudeAccuracy),
    heading: normalizeOptionalNumber(input.heading),
    speed: normalizeOptionalNumber(input.speed),
    capturedAt: normalizeCapturedAt(input.capturedAt)
  }
}

export function serializeAuthLocation(location?: unknown) {
  const normalized = normalizeAuthLocationPayload(location)
  if (!normalized) {
    return null
  }

  return {
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    accuracy: normalized.accuracy ?? null,
    altitude: normalized.altitude ?? null,
    altitudeAccuracy: normalized.altitudeAccuracy ?? null,
    heading: normalized.heading ?? null,
    speed: normalized.speed ?? null,
    capturedAt: normalized.capturedAt ?? null,
    mapUrl: `https://www.google.com/maps?q=${normalized.latitude},${normalized.longitude}`
  }
}

function getClientIp(event: H3Event) {
  const forwarded = getHeader(event, 'x-forwarded-for')
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || null
  }

  const realIp = getHeader(event, 'x-real-ip')
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim()
  }

  return null
}

function getMissingColumnFallbackBody(body: Record<string, unknown>) {
  const fallback = { ...body }
  delete fallback.last_login_location
  delete fallback.last_logout_location
  return fallback
}

async function updateLastAuthLocation(input: {
  source: AuthLocationSource
  userId: number
  eventType: AuthLocationEventType
  occurredAt: string
  location: ReturnType<typeof serializeAuthLocation>
}) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)
  const table = input.source === 'customer' ? 'customers' : 'erp_users'
  const timestampColumn = input.eventType === 'login' ? 'last_login_at' : 'last_logout_at'
  const locationColumn = input.eventType === 'login' ? 'last_login_location' : 'last_logout_location'
  const body: Record<string, unknown> = {
    [timestampColumn]: input.occurredAt,
    [locationColumn]: input.location
  }

  try {
    await $fetch(`${url}/rest/v1/${table}`, {
      method: 'PATCH',
      headers,
      query: {
        id: `eq.${input.userId}`
      },
      body
    })
  } catch {
    try {
      await $fetch(`${url}/rest/v1/${table}`, {
        method: 'PATCH',
        headers,
        query: {
          id: `eq.${input.userId}`
        },
        body: getMissingColumnFallbackBody(body)
      })
    } catch {
      // Auth must not fail because audit columns are not deployed yet.
    }
  }
}

async function insertAuthLocationEvent(input: {
  source: AuthLocationSource
  userId: number
  role: AuthRole
  eventType: AuthLocationEventType
  occurredAt: string
  location: ReturnType<typeof serializeAuthLocation>
  userAgent: string | null
  ipAddress: string | null
}) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)

  await $fetch(`${url}/rest/v1/auth_location_events`, {
    method: 'POST',
    headers,
    body: {
      source: input.source,
      user_id: input.userId,
      role: input.role,
      event_type: input.eventType,
      occurred_at: input.occurredAt,
      captured_at: input.location?.capturedAt ?? null,
      latitude: input.location?.latitude ?? null,
      longitude: input.location?.longitude ?? null,
      accuracy_meters: input.location?.accuracy ?? null,
      altitude: input.location?.altitude ?? null,
      altitude_accuracy_meters: input.location?.altitudeAccuracy ?? null,
      heading: input.location?.heading ?? null,
      speed: input.location?.speed ?? null,
      location: input.location,
      user_agent: input.userAgent,
      ip_address: input.ipAddress
    }
  })
}

export async function recordAuthLocationEvent(input: AuthLocationRecordInput) {
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    return
  }

  const occurredAt = input.occurredAt || new Date().toISOString()
  const location = serializeAuthLocation(input.location)
  const userAgent = getHeader(input.event, 'user-agent') || null
  const ipAddress = getClientIp(input.event)

  await updateLastAuthLocation({
    source: input.source,
    userId: input.userId,
    eventType: input.eventType,
    occurredAt,
    location
  })

  await insertAuthLocationEvent({
    source: input.source,
    userId: input.userId,
    role: input.role,
    eventType: input.eventType,
    occurredAt,
    location,
    userAgent,
    ipAddress
  }).catch(() => undefined)
}
