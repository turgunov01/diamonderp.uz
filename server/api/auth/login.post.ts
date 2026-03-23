import { compare } from 'bcryptjs'
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
  return value === 'admin' || value === 'hr' || value === 'procurement'
}

function normalizeCredentials(body: Partial<LoginRequestBody> | null | undefined) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!email || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Укажите email и пароль.'
    })
  }

  return {
    email,
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

export default eventHandler(async (event): Promise<LoginResponse> => {
  const credentials = normalizeCredentials(await readBody<Partial<LoginRequestBody>>(event))
  const matchedUser = await fetchUserByEmail(credentials.email)

  if (!matchedUser || matchedUser.is_active === false || !isAuthRole(matchedUser.role)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Неверный email или пароль.'
    })
  }

  const passwordMatches = await compare(credentials.password, matchedUser.password_hash)

  if (!passwordMatches) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Неверный email или пароль.'
    })
  }

  return {
    user: mapUserToSession(matchedUser)
  }
})
