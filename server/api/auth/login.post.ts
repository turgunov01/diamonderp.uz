import { compare } from 'bcryptjs'
import crypto from 'node:crypto'
import type { AuthRole, AuthSession, LoginRequestBody, LoginResponse } from '~~/shared/types/auth'
import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'

interface ErpUserRow {
  id: number
  name: string
  email: string
  password_hash: string
  role: AuthRole
  avatar: string | null
  is_active: boolean | null
}

function isAuthRole(value: unknown): value is AuthRole {
  return value === 'admin' || value === 'hr' || value === 'procurement' || value === 'customer'
}

function normalizeCredentials(body: Partial<LoginRequestBody> | null | undefined) {
  const login = typeof body?.email === 'string'
    ? body.email.trim()
    : typeof (body as any)?.phone === 'string'
      ? (body as any).phone.trim()
      : typeof (body as any)?.login === 'string'
        ? (body as any).login.trim()
        : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!login || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Укажите email/телефон и пароль.'
    })
  }

  return {
    login,
    password
  }
}

async function fetchUserByEmail(email: string) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()

  try {
    const rows = await $fetch<ErpUserRow[]>(`${url}/rest/v1/erp_users`, {
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
      statusMessage: 'Не удалось получить пользователя из таблицы erp_users.',
      data: error
    })
  }
}

function mapUserToSession(user: ErpUserRow): AuthSession {
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    avatar: user.avatar
  }
}

interface CustomerRow {
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

function mapCustomerToSession(row: CustomerRow): AuthSession {
  return {
    email: undefined,
    phone: row.phone_number,
    name: row.full_name || row.username,
    role: (row.role as AuthRole | undefined) || 'customer',
    avatar: row.avatar
  }
}

function signToken(payload: Record<string, unknown>, secret: string, expiresInSeconds = 60 * 60 * 24) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = {
    iat: now,
    exp: now + expiresInSeconds,
    ...payload
  }

  const encode = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const h = encode(header)
  const p = encode(fullPayload)
  const data = `${h}.${p}`
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${signature}`
}

function normalizePhoneOrUsername(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length >= 7) return digits
  return value.trim()
}

async function fetchCustomer(login: string) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)
  const normalized = normalizePhoneOrUsername(login)
  const digits = normalized.replace(/\D/g, '')
  const plusDigits = digits ? `+${digits}` : ''

  const rows = await $fetch<CustomerRow[]>(`${url}/rest/v1/customers`, {
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

export default eventHandler(async (event): Promise<LoginResponse> => {
  const credentials = normalizeCredentials(await readBody<Partial<LoginRequestBody>>(event))
  const config = useRuntimeConfig(event)
  const jwtSecret = config.authTokenSecret || config.jwtSecret || config.privateToken || 'dev-secret'

  // 1) Try ERP users (email/password)
  const matchedUser = await fetchUserByEmail(credentials.login.toLowerCase())
  if (matchedUser && matchedUser.is_active !== false && isAuthRole(matchedUser.role)) {
    const passwordMatches = await compare(credentials.password, matchedUser.password_hash)
      .catch(() => false)
    if (passwordMatches) {
      const user = mapUserToSession(matchedUser)
      const token = signToken({ sub: `erp:${matchedUser.id}`, role: user.role, email: user.email }, jwtSecret)
      return { user, token }
    }
  }

  // 2) Try Customers (phone or username + password)
  const customer = await fetchCustomer(credentials.login).catch(() => null)
  if (customer) {
    const bcryptOk = await compare(credentials.password, customer.password).catch(() => false)
    const plainOk = credentials.password === customer.password

    if (bcryptOk || plainOk) {
      const user = mapCustomerToSession(customer)
      const token = signToken({ sub: `customer:${customer.id}`, role: user.role, phone: user.phone }, jwtSecret)
      return { user, token }
    }
  }

  throw createError({
    statusCode: 401,
    statusMessage: 'Неверный email/телефон или пароль.'
  })
})
