import { compare } from 'bcryptjs'
import crypto from 'node:crypto'
import type { AuthRole, AuthSession, LoginRequestBody } from '~~/shared/types/auth'
import { postgresQuery } from './postgres'

export interface ErpUserAuthRow {
  id: number
  name: string
  email: string
  password_hash: string
  role: AuthRole
  avatar: string | null
  is_active: boolean | null
  must_change_password?: boolean | null
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
  return typeof value === 'string' && value.trim().length > 0
}

export function isErpAuthRole(value: unknown): value is AuthRole {
  return value === 'admin' || value === 'hr' || value === 'procurement'
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
  const role = typeof row.role === 'string' && row.role.trim().length
    ? row.role.trim().toLowerCase()
    : 'customer'

  return {
    id: row.id,
    email: undefined,
    phone: row.phone_number,
    name: row.full_name || row.username,
    role,
    avatar: row.avatar
  }
}

export function normalizeCredentials(body: Partial<LoginRequestBody> | null | undefined) {
  const record = body as Record<string, unknown> | null | undefined
  const login = [
    body?.email,
    record?.phone,
    record?.login
  ].find(value => typeof value === 'string' && value.trim().length > 0)
  const normalizedLogin = typeof login === 'string' ? login.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!normalizedLogin || !password) {
    throw createError({
      statusCode: 400,
      message: 'Specify login and password.'
    })
  }

  return {
    login: normalizedLogin,
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
      message: 'Missing auth token.'
    })
  }

  const parts = token.split('.')
  if (parts.length !== 3) {
    throw createError({
      statusCode: 401,
      message: 'Invalid auth token.'
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
      message: 'Invalid auth token signature.'
    })
  }

  let payload: VerifiedAuthTokenPayload

  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as VerifiedAuthTokenPayload
  } catch {
    throw createError({
      statusCode: 401,
      message: 'Invalid auth token payload.'
    })
  }

  if (!payload?.sub || !isAuthRole(payload.role)) {
    throw createError({
      statusCode: 401,
      message: 'Invalid auth token claims.'
    })
  }

  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp === 'number' && payload.exp <= now) {
    throw createError({
      statusCode: 401,
      message: 'Auth token expired.'
    })
  }

  return payload
}

export async function fetchUserByEmail(email: string) {
  try {
    const result = await postgresQuery<ErpUserAuthRow>(
      `select id, name, email, password_hash, role, avatar, is_active
       from public.erp_users
       where lower(email) = lower($1)
       limit 1`,
      [email]
    )

    return result.rows[0] || null
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch erp user.',
      data: error
    })
  }
}

export async function fetchCustomerByLogin(login: string) {
  const normalized = normalizePhoneOrUsername(login)
  const digits = normalizePhone(login)
  const plusDigits = digits ? `+${digits}` : ''

  const result = await postgresQuery<CustomerLoginRow>(
    `select id, full_name, username, password, phone_number, avatar, status, must_change_password, role
     from public.customers
     where phone_number = $1
        or phone_number = $2
        or phone_number = $3
        or phone_number = $4
        or ($3 <> '' and regexp_replace(coalesce(phone_number, ''), '[^0-9]', '', 'g') = $3)
        or lower(username) = lower($1)
        or lower(username) = lower($2)
     limit 1`,
    [normalized, login.trim(), digits, plusDigits]
  )

  return result.rows[0] || null
}

export async function fetchErpUserById(id: number) {
  const result = await postgresQuery<ErpUserAuthRow>(
    `select id, name, email, password_hash, role, avatar, is_active, must_change_password
     from public.erp_users
     where id = $1
     limit 1`,
    [id]
  )

  return result.rows[0] || null
}

export async function fetchCustomerProfileById(id: number) {
  const result = await postgresQuery<CustomerProfileRow>(
    `select id, full_name, username, phone_number, avatar, role, status, must_change_password,
            work_shift, building_id, object_pinned, object_positions
     from public.customers
     where id = $1
     limit 1`,
    [id]
  )

  return result.rows[0] || null
}

export async function authenticateLogin(body: Partial<LoginRequestBody> | null | undefined): Promise<AuthenticatedLoginResult> {
  const credentials = normalizeCredentials(body)
  const matchedUser = await fetchUserByEmail(credentials.login.toLowerCase())

  if (matchedUser && matchedUser.is_active !== false && isErpAuthRole(matchedUser.role)) {
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
    message: 'Invalid login or password.'
  })
}
