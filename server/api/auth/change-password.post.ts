import { compare, hash } from 'bcryptjs'
import type { H3Event } from 'h3'
import { isErpAuthRole, verifyAuthToken } from '../../utils/auth'
import { postgresQuery } from '../../utils/postgres'

interface ChangePasswordBody {
  currentPassword: string
  newPassword: string
}

interface ErpPasswordRow {
  id: number | string
  name: string
  email: string
  password_hash: string
  role: string
  is_active: boolean | null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function readAuthToken(event: H3Event) {
  const authorization = getHeader(event, 'authorization') || getHeader(event, 'Authorization')
  if (typeof authorization === 'string' && authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim()
  }

  return getCookie(event, 'diamond-erp-token') || ''
}

function getErpUserId(event: H3Event) {
  let payload: ReturnType<typeof verifyAuthToken>

  try {
    payload = verifyAuthToken(readAuthToken(event))
  } catch {
    throw createError({ statusCode: 401, message: 'Требуется авторизация.' })
  }

  const [source, rawUserId] = payload.sub.split(':')
  const userId = Number(rawUserId)

  if (source !== 'erp' || !Number.isInteger(userId) || userId <= 0 || !isErpAuthRole(payload.role)) {
    throw createError({ statusCode: 403, message: 'Смена пароля доступна только аккаунтам админки.' })
  }

  return userId
}

function ensurePasswordSafe(password: string, user: ErpPasswordRow) {
  const normalizedPassword = password.trim().toLowerCase()
  const normalizedName = user.name.trim().toLowerCase()
  const normalizedEmail = user.email.trim().toLowerCase()
  const emailLogin = normalizedEmail.split('@')[0] || ''

  if (
    normalizedPassword === normalizedName
    || normalizedPassword === normalizedEmail
    || normalizedPassword === emailLogin
  ) {
    throw createError({
      statusCode: 400,
      message: 'Пароль не может совпадать с именем или email.'
    })
  }
}

export default eventHandler(async (event) => {
  const userId = getErpUserId(event)
  const body = await readBody<Partial<ChangePasswordBody>>(event)
  const currentPassword = isNonEmptyString(body?.currentPassword) ? body.currentPassword : ''
  const newPassword = isNonEmptyString(body?.newPassword) ? body.newPassword : ''

  if (!currentPassword) {
    throw createError({ statusCode: 400, message: 'Введите текущий пароль.' })
  }

  if (newPassword.trim().length < 8) {
    throw createError({ statusCode: 400, message: 'Новый пароль должен содержать минимум 8 символов.' })
  }

  if (newPassword === currentPassword) {
    throw createError({ statusCode: 400, message: 'Новый пароль должен отличаться от текущего.' })
  }

  const userResult = await postgresQuery<ErpPasswordRow>(
    `select id, name, email, password_hash, role, is_active
     from public.erp_users
     where id = $1
     limit 1`,
    [userId]
  )

  const user = userResult.rows[0]
  if (!user || user.is_active === false || !isErpAuthRole(user.role)) {
    throw createError({ statusCode: 404, message: 'Пользователь админки не найден.' })
  }

  const passwordMatches = await compare(currentPassword, user.password_hash).catch(() => false)
  if (!passwordMatches) {
    throw createError({ statusCode: 401, message: 'Текущий пароль указан неверно.' })
  }

  ensurePasswordSafe(newPassword, user)

  const passwordHash = await hash(newPassword, 10)
  const updated = await postgresQuery<Pick<ErpPasswordRow, 'id'>>(
    `update public.erp_users
     set password_hash = $1
     where id = $2
     returning id`,
    [passwordHash, Number(user.id)]
  )

  if (!updated.rows[0]) {
    throw createError({ statusCode: 500, message: 'Не удалось обновить пароль.' })
  }

  return { ok: true }
})
