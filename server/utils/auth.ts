import { compare } from 'bcryptjs'
import crypto from 'node:crypto'
import type { AuthRole, AuthSession, LoginRequestBody } from '~~/shared/types/auth'
import { getSupabaseServerConfig, getSupabaseServerHeaders } from './supabase'

export interface ErpUserAuthRow {
  id: number
  name: string
  email: string
  password_hash: string
  role: AuthRole
  avatar: string | null
  is_active: boolean | null
}

interface CustomerLoginRow {
  id: number
  full_name: string
  username: string
  password: string
  phone_number: string
  avatar: string | null
  role?: string | null
  status?: string | null
  must_change_password?: boolean | null
}

export interface CustomerProfileRow {
  id: number
  full_name: string
  username: string
  phone_number: string
  avatar: string | null
  role?: string | null
  status?: string | null
  must_change_password?: boolean | null
  work_shift?: 'day' | 'night' | null
  building_id?: number | null
  object_pinned?: string | null
  object_positions?: string[] | null
}

export interface VerifiedAuthTokenPayload {
  sub: string
  role: AuthRole
  email?: string
  phone?: string
  iat?: number
  exp?: number
}

export interface AuthenticatedLoginResult {
  source: 'erp' | 'customer'
  user: AuthSession
  token: string
  payload: VerifiedAuthTokenPayload
}

function getAuthSecret() {
  const config = useRuntimeConfig()
  return String(config.authTokenSecret || config.jwtSecret || config.privateToken || 'dev-secret')
}

export function isAuthRole(value: unknown): value is AuthRole {
  return value === 'admin' || value === 'hr' || value === 'procurement' || value === 'customer'
}

export function mapUserToSession(user: ErpUserAuthRow): AuthSession {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar: user.avatar
  }
}

export function mapCustomerToSession(row: CustomerProfileRow | CustomerLoginRow): AuthSession {
  return {
    id: row.id,
    email: undefined,
    phone: row.phone_number,
    name: row.full_name || row.username,
    role: (row.role as AuthRole | undefined) || 'customer',
    avatar: row.avatar
  }
}

export function normalizeCredentials(body: Partial<LoginRequestBody> | null | undefined) {
  const record = body as Record<string, unknown> | null | undefined
  const login = typeof body?.email === 'string'
    ? body.email.trim()
    : typeof record?.phone === 'string'
      ? record.phone.trim()
      : typeof record?.login === 'string'
        ? record.login.trim()
        : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!login || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Specify login and password.'
    })
  }

  return {
    login,
    password
  }
}

export function normalizePhoneOrUsername(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length >= 7) {
    return digits
  }

  return value.trim()
}

export function normalizePhone(value: string | null | undefined) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : ''
}

export function signAuthToken(
  payload: Omit<VerifiedAuthTokenPayload, 'iat' | 'exp'>,
  expiresInSeconds = 60 * 60 * 24
) {
  const secret = getAuthSecret()
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload: VerifiedAuthTokenPayload = {
    iat: now,
    exp: now + expiresInSeconds,
    ...payload
  }

  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const head = encode(header)
  const body = encode(fullPayload)
  const data = `${head}.${body}`
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url')

  return `${data}.${signature}`
}

export function verifyAuthToken(token: string): VerifiedAuthTokenPayload {
  if (typeof token !== 'string' || !token.trim()) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Missing auth token.'
    })
  }

  const parts = token.split('.')
  if (parts.length !== 3) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid auth token.'
    })
  }

  const head = parts[0]!
  const body = parts[1]!
  const signature = parts[2]!
  const secret = getAuthSecret()
  const expectedSignature = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')

  if (
    signature.length !== expectedSignature.length
    || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid auth token signature.'
    })
  }

  let payload: VerifiedAuthTokenPayload

  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as VerifiedAuthTokenPayload
  } catch {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid auth token payload.'
    })
  }

  if (!payload?.sub || !isAuthRole(payload.role)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid auth token claims.'
    })
  }

  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp === 'number' && payload.exp <= now) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Auth token expired.'
    })
  }

  return payload
}

export async function fetchUserByEmail(email: string) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()

  try {
    const rows = await $fetch<ErpUserAuthRow[]>(`${url}/rest/v1/erp_users`, {
      headers: getSupabaseServerHeaders(serviceRoleKey),
      query: {
        select: 'id,name,email,password_hash,role,avatar,is_active',
        email: `eq.${email}`,
        limit: '1'
      }
    })

    return rows[0] || null
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch erp user.',
      data: error
    })
  }
}

export async function fetchCustomerByLogin(login: string) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)
  const normalized = normalizePhoneOrUsername(login)
  const digits = normalized.replace(/\D/g, '')
  const plusDigits = digits ? `+${digits}` : ''

  const rows = await $fetch<CustomerLoginRow[]>(`${url}/rest/v1/customers`, {
    headers,
    query: {
      select: 'id,full_name,username,password,phone_number,avatar,status,must_change_password,role',
      or: `(${[
        `phone_number.eq.${normalized}`,
        `phone_number.eq.${login}`,
        digits ? `phone_number.eq.${digits}` : null,
        plusDigits ? `phone_number.eq.${plusDigits}` : null,
        digits ? `phone_number.ilike.%${digits}%` : null,
        `username.eq.${normalized}`,
        `username.eq.${login}`
      ].filter(Boolean).join(',')})`
    }
  })

  return rows[0] || null
}

export async function fetchErpUserById(id: number) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const rows = await $fetch<ErpUserAuthRow[]>(`${url}/rest/v1/erp_users`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query: {
      select: 'id,name,email,password_hash,role,avatar,is_active',
      id: `eq.${id}`,
      limit: '1'
    }
  })

  return rows[0] || null
}

export async function fetchCustomerProfileById(id: number) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)

  try {
    const rows = await $fetch<CustomerProfileRow[]>(`${url}/rest/v1/customers`, {
      headers,
      query: {
        select: 'id,full_name,username,phone_number,avatar,role,status,must_change_password,work_shift,building_id,object_pinned,object_positions',
        id: `eq.${id}`,
        limit: '1'
      }
    })

    return rows[0] || null
  } catch {
    const rows = await $fetch<CustomerProfileRow[]>(`${url}/rest/v1/customers`, {
      headers,
      query: {
        select: 'id,full_name,username,phone_number,avatar,role,status,must_change_password,work_shift,object_pinned,object_positions',
        id: `eq.${id}`,
        limit: '1'
      }
    })

    return rows[0] || null
  }
}

export async function authenticateLogin(body: Partial<LoginRequestBody> | null | undefined): Promise<AuthenticatedLoginResult> {
  const credentials = normalizeCredentials(body)
  const matchedUser = await fetchUserByEmail(credentials.login.toLowerCase())

  if (matchedUser && matchedUser.is_active !== false && isAuthRole(matchedUser.role)) {
    const passwordMatches = await compare(credentials.password, matchedUser.password_hash)
      .catch(() => false)

    if (passwordMatches) {
      const user = mapUserToSession(matchedUser)
      const payload = {
        sub: `erp:${matchedUser.id}`,
        role: user.role,
        email: user.email
      } satisfies Omit<VerifiedAuthTokenPayload, 'iat' | 'exp'>

      return {
        source: 'erp',
        user,
        token: signAuthToken(payload),
        payload
      }
    }
  }

  const customer = await fetchCustomerByLogin(credentials.login).catch(() => null)
  if (customer) {
    const bcryptOk = await compare(credentials.password, customer.password).catch(() => false)
    const plainOk = credentials.password === customer.password

    if (bcryptOk || plainOk) {
      const user = mapCustomerToSession(customer)
      const payload = {
        sub: `customer:${customer.id}`,
        role: user.role,
        phone: user.phone
      } satisfies Omit<VerifiedAuthTokenPayload, 'iat' | 'exp'>

      return {
        source: 'customer',
        user,
        token: signAuthToken(payload),
        payload
      }
    }
  }

  throw createError({
    statusCode: 401,
    statusMessage: 'Invalid login or password.'
  })
}

