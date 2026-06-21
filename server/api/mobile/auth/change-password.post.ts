import { compare, hash } from 'bcryptjs'
import { requireMobileAccess } from '../../../utils/mobile-access'
import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'

interface ChangePasswordBody {
  currentPassword: string
  newPassword: string
}

interface CustomerPasswordRow {
  id: number
  full_name: string
  username: string
  password: string
  must_change_password?: boolean | null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function transliterateToLatin(value: string) {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'ғ': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y',
    'к': 'k', 'қ': 'q', 'л': 'l', 'м': 'm', 'н': 'n', 'ң': 'ng', 'о': 'o', 'ө': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
    'у': 'u', 'ұ': 'u', 'ү': 'u', 'ф': 'f', 'х': 'h', 'ҳ': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ы': 'y', 'э': 'e',
    'ю': 'yu', 'я': 'ya', 'ь': '', 'ъ': '', 'йо': 'yo', 'ў': 'o'
  }

  return value
    .toLowerCase()
    .split('')
    .map(char => map[char] ?? char)
    .join('')
}

function ensurePasswordSafe(password: string, fullName: string, username: string) {
  const normalizedPassword = password.toLowerCase()
  const normalizedName = transliterateToLatin(fullName).toLowerCase().replace(/\s+/g, '')
  const normalizedUsername = username.toLowerCase()

  if (normalizedPassword === normalizedName || normalizedPassword === normalizedUsername) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Пароль не может совпадать с ФИО или никнеймом.'
    })
  }
}

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  if (!access.customer) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only customer accounts can change password.'
    })
  }

  const body = await readBody<Partial<ChangePasswordBody>>(event)
  const currentPassword = isNonEmptyString(body?.currentPassword) ? body.currentPassword : ''
  const newPassword = isNonEmptyString(body?.newPassword) ? body.newPassword : ''

  if (!currentPassword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'currentPassword is required.'
    })
  }

  if (newPassword.trim().length < 6) {
    throw createError({
      statusCode: 400,
      statusMessage: 'newPassword must be at least 6 chars.'
    })
  }

  if (newPassword === currentPassword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'New password must be different from the current password.'
    })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const rows = await $fetch<CustomerPasswordRow[]>(`${url}/rest/v1/customers`, {
    headers,
    query: {
      select: 'id,full_name,username,password,must_change_password',
      id: `eq.${access.user.id}`,
      limit: '1'
    }
  })

  const customer = rows[0]
  if (!customer) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Customer not found.'
    })
  }

  const bcryptOk = await compare(currentPassword, customer.password).catch(() => false)
  const plainOk = currentPassword === customer.password

  if (!bcryptOk && !plainOk) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid current password.'
    })
  }

  ensurePasswordSafe(newPassword, customer.full_name, customer.username)

  const hashedPassword = await hash(newPassword, 10)

  const updatedRows = await $fetch<CustomerPasswordRow[]>(`${url}/rest/v1/customers?id=eq.${customer.id}`, {
    method: 'PATCH',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    body: {
      password: hashedPassword,
      must_change_password: false
    }
  })

  if (!updatedRows[0]) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update password.'
    })
  }

  return {
    ok: true,
    mustChangePassword: false
  }
})

