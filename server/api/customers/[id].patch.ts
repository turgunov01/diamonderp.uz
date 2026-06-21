import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import { deleteEmployeeActivitiesByEmployeeId } from '../../utils/employee-activity'
import { isAuthRole } from '../../utils/auth'
import {
  mapCustomerDbRowToRecord,
  mapUpdateBodyToDbUpdate,
  type CustomerDbRow,
  type SalaryType,
  type UpdateCustomerBody,
  type WorkShift
} from './customers'
import type { H3Event } from 'h3'

function isWorkShift(value: unknown): value is WorkShift {
  return value === 'day' || value === 'night'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isSalaryType(value: unknown): value is SalaryType {
  return value === 'fixed' || value === 'hourly'
}

function parseCustomerId(event: H3Event) {
  const rawId = getRouterParam(event, 'id')
  const customerId = Number(rawId)
  if (!rawId || !Number.isInteger(customerId) || customerId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.'
    })
  }

  return customerId
}

function parseMoney(value: unknown, fieldName: string, allowNegative = false) {
  const amount = typeof value === 'number' ? value : Number(value)
  const isInteger = Number.isInteger(amount)
  const isValid = allowNegative ? isInteger : (isInteger && amount >= 0)

  if (!isValid) {
    throw createError({
      statusCode: 400,
      statusMessage: allowNegative
        ? `РџРѕР»Рµ ${fieldName} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ С†РµР»С‹Рј С‡РёСЃР»РѕРј.`
        : `РџРѕР»Рµ ${fieldName} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ С†РµР»С‹Рј С‡РёСЃР»РѕРј РЅРµ РјРµРЅСЊС€Рµ 0.`
    })
  }

  return amount
}

function parseAge(value: unknown) {
  const age = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(age) || age < 18) {
    throw createError({
      statusCode: 400,
      statusMessage: 'РџРѕР»Рµ age РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ С†РµР»С‹Рј С‡РёСЃР»РѕРј РЅРµ РјРµРЅСЊС€Рµ 18.'
    })
  }

  return age
}

function parseOptionalBuildingId(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const buildingId = typeof value === 'number' ? value : Number(value)

  if (!Number.isInteger(buildingId) || buildingId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'РџРѕР»Рµ buildingId РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РїРѕР»РѕР¶РёС‚РµР»СЊРЅС‹Рј С†РµР»С‹Рј С‡РёСЃР»РѕРј.'
    })
  }

  return buildingId
}

function parseObjectPositions(value: unknown) {
  if (!Array.isArray(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'РџРѕР»Рµ objectPositions РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РјР°СЃСЃРёРІРѕРј СЃС‚СЂРѕРє.'
    })
  }

  const normalized = value
    .map(position => (typeof position === 'string' ? position.trim() : ''))
    .filter(Boolean)

  return normalized
}

function normalizePhone(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw createError({
      statusCode: 400,
      statusMessage: 'РџРѕР»Рµ phoneNumber РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ.'
    })
  }

  const digits = String(value).trim().replace(/\D/g, '')
  if (digits.length < 9) {
    throw createError({
      statusCode: 400,
      statusMessage: 'РџРѕР»Рµ phoneNumber РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РІР°Р»РёРґРЅС‹Рј РЅРѕРјРµСЂРѕРј.'
    })
  }

  return `+${digits}`
}

function parseUpdateBody(body: unknown): UpdateCustomerBody {
  if (!body || typeof body !== 'object') {
    throw createError({
      statusCode: 400,
      statusMessage: 'РўРµР»Рѕ Р·Р°РїСЂРѕСЃР° РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РєРѕСЂСЂРµРєС‚РЅС‹Рј JSON-РѕР±СЉРµРєС‚РѕРј.'
    })
  }

  const input = body as Record<string, unknown>
  const update: UpdateCustomerBody = {}

  if (input.fullName !== undefined) {
    if (!isNonEmptyString(input.fullName)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'РџРѕР»Рµ fullName РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ.'
      })
    }
    update.fullName = input.fullName.trim()
  }

  if (input.username !== undefined) {
    if (!isNonEmptyString(input.username) || input.username.trim().length < 3) {
      throw createError({
        statusCode: 400,
        statusMessage: 'РџРѕР»Рµ username РґРѕР»Р¶РЅРѕ СЃРѕРґРµСЂР¶Р°С‚СЊ РјРёРЅРёРјСѓРј 3 СЃРёРјРІРѕР»Р°.'
      })
    }
    update.username = input.username.trim()
  }

  if (input.password !== undefined) {
    if (!isNonEmptyString(input.password) || input.password.trim().length < 6) {
      throw createError({
        statusCode: 400,
        statusMessage: 'РџРѕР»Рµ password РґРѕР»Р¶РЅРѕ СЃРѕРґРµСЂР¶Р°С‚СЊ РјРёРЅРёРјСѓРј 6 СЃРёРјРІРѕР»РѕРІ.'
      })
    }
    update.password = input.password
  }

  if (input.phoneNumber !== undefined) {
    update.phoneNumber = normalizePhone(input.phoneNumber)
  }

  if (input.age !== undefined) {
    update.age = parseAge(input.age)
  }

  if (input.buildingId !== undefined) {
    update.buildingId = parseOptionalBuildingId(input.buildingId)
  }

  if (input.workShift !== undefined) {
    if (!isWorkShift(input.workShift)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'РџРѕР»Рµ workShift РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ \'day\' РёР»Рё \'night\'.'
      })
    }
    update.workShift = input.workShift
  }

  if (input.objectPinned !== undefined) {
    update.objectPinned = typeof input.objectPinned === 'string' ? input.objectPinned.trim() : ''
  }

  if (input.objectPositions !== undefined) {
    update.objectPositions = parseObjectPositions(input.objectPositions)
  }

  if (input.role !== undefined) {
    if (!isNonEmptyString(input.role) || !isAuthRole(input.role.trim()) || input.role.trim().length > 64) {
      throw createError({
        statusCode: 400,
        statusMessage: 'РџРѕР»Рµ role СЃРѕРґРµСЂР¶РёС‚ РЅРµРґРѕРїСѓСЃС‚РёРјСѓСЋ СЂРѕР»СЊ.'
      })
    }
    update.role = input.role.trim().toLowerCase()
  }

  if (input.baseSalary !== undefined) {
    update.baseSalary = parseMoney(input.baseSalary, 'baseSalary', false)
  }

  if (input.positionBonus !== undefined) {
    update.positionBonus = parseMoney(input.positionBonus, 'positionBonus', true)
  }

  const salaryTypeValue = input.salaryType ?? input.salary_type
  if (salaryTypeValue !== undefined) {
    if (!isSalaryType(salaryTypeValue)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'РџРѕР»Рµ salaryType РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ fixed РёР»Рё hourly.'
      })
    }
    update.salaryType = salaryTypeValue
  }

  const hourlyRateValue = input.hourlyRate ?? input.hourly_rate
  if (hourlyRateValue !== undefined) {
    update.hourlyRate = parseMoney(hourlyRateValue, 'hourlyRate', false)
  }

  let requestedStatus: UpdateCustomerBody['status'] | undefined

  if (input.status !== undefined) {
    const allowed = ['pending', 'active', 'inactive', 'archived']
    if (typeof input.status !== 'string' || !allowed.includes(input.status)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'РџРѕР»Рµ status РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ pending, active, inactive РёР»Рё archived.'
      })
    }
    requestedStatus = input.status as UpdateCustomerBody['status']
    update.status = requestedStatus
  }

  if (input.mustChangePassword !== undefined) {
    if (typeof input.mustChangePassword !== 'boolean') {
      throw createError({
        statusCode: 400,
        statusMessage: 'РџРѕР»Рµ mustChangePassword РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ true/false.'
      })
    }
    update.mustChangePassword = input.mustChangePassword
  }

  if (input.deactivationComment !== undefined) {
    if (input.deactivationComment !== null && typeof input.deactivationComment !== 'string') {
      throw createError({
        statusCode: 400,
        statusMessage: 'РџРѕР»Рµ deactivationComment РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ СЃС‚СЂРѕРєРѕР№.'
      })
    }
    update.deactivationComment = input.deactivationComment as string | undefined
  }

  if (input.archivedAt !== undefined) {
    if (input.archivedAt !== null && typeof input.archivedAt !== 'string') {
      throw createError({
        statusCode: 400,
        statusMessage: 'РџРѕР»Рµ archivedAt РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ ISO-РґР°С‚РѕР№ РёР»Рё null.'
      })
    }
    update.archivedAt = input.archivedAt as string | null
  }

  if (requestedStatus === 'archived') {
    const comment = update.deactivationComment ?? (typeof input.deactivationComment === 'string' ? input.deactivationComment : '')
    if (typeof comment !== 'string' || !comment.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Р”Р»СЏ Р°СЂС…РёРІР°С†РёРё РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ Р·Р°РїРѕР»РЅРёС‚Рµ РєРѕРјРјРµРЅС‚Р°СЂРёР№ deactivationComment.'
      })
    }
    update.deactivationComment = comment.trim()
    if (!update.archivedAt) {
      update.archivedAt = new Date().toISOString()
    }
  }

  if (Object.keys(update).length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'РќСѓР¶РЅРѕ РїРµСЂРµРґР°С‚СЊ С…РѕС‚СЏ Р±С‹ РѕРґРЅРѕ РїРѕР»Рµ РґР»СЏ РѕР±РЅРѕРІР»РµРЅРёСЏ.'
    })
  }

  return update
}

function isCustomerInactive(row: CustomerDbRow) {
  return !row.object_pinned?.trim()
}

export default eventHandler(async (event) => {
  const customerId = parseCustomerId(event)
  const updateBody = parseUpdateBody(await readBody(event))
  const { url, serviceRoleKey } = getDataApiServerConfig()

  try {
    const rows = await $fetch<CustomerDbRow[]>(`${url}/rest/v1/customers`, {
      method: 'PATCH',
      headers: {
        ...getDataApiServerHeaders(serviceRoleKey),
        Prefer: 'return=representation'
      },
      query: {
        id: `eq.${customerId}`
      },
      body: mapUpdateBodyToDbUpdate(updateBody)
    })

    const updatedRow = rows[0]
    if (!updatedRow) {
      throw createError({
        statusCode: 404,
        statusMessage: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ.'
      })
    }

    if (isCustomerInactive(updatedRow)) {
      try {
        await deleteEmployeeActivitiesByEmployeeId(customerId)
      } catch (cleanupError) {
        console.error('Failed to cleanup employee activities after customer deactivation.', cleanupError)
      }
    }

    return mapCustomerDbRowToRecord(updatedRow)
  } catch (error: unknown) {
    const data = error && typeof error === 'object' && 'data' in error
      ? error.data as { code?: string, message?: string } | undefined
      : undefined

    if (data?.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃ С‚Р°РєРёРј username РёР»Рё phoneNumber СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚.'
      })
    }

    if (data?.message) {
      throw createError({
        statusCode: 400,
        statusMessage: data.message
      })
    }

    throw error
  }
})
