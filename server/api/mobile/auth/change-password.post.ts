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
    'Р°': 'a', 'Р±': 'b', 'РІ': 'v', 'Рі': 'g', 'Т“': 'g', 'Рґ': 'd', 'Рµ': 'e', 'С‘': 'e', 'Р¶': 'zh', 'Р·': 'z', 'Рё': 'i', 'Р№': 'y',
    'Рє': 'k', 'Т›': 'q', 'Р»': 'l', 'Рј': 'm', 'РЅ': 'n', 'ТЈ': 'ng', 'Рѕ': 'o', 'У©': 'o', 'Рї': 'p', 'СЂ': 'r', 'СЃ': 's', 'С‚': 't',
    'Сѓ': 'u', 'Т±': 'u', 'ТЇ': 'u', 'С„': 'f', 'С…': 'h', 'Ті': 'h', 'С†': 'ts', 'С‡': 'ch', 'С€': 'sh', 'С‰': 'sch', 'С‹': 'y', 'СЌ': 'e',
    'СЋ': 'yu', 'СЏ': 'ya', 'СЊ': '', 'СЉ': '', 'Р№Рѕ': 'yo', 'Сћ': 'o'
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
      statusMessage: 'РџР°СЂРѕР»СЊ РЅРµ РјРѕР¶РµС‚ СЃРѕРІРїР°РґР°С‚СЊ СЃ Р¤РРћ РёР»Рё РЅРёРєРЅРµР№РјРѕРј.'
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

