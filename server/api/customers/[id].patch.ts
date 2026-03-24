import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import { deleteEmployeeActivitiesByEmployeeId } from '../../utils/employee-activity'
import {
  mapCustomerDbRowToRecord,
  mapUpdateBodyToDbUpdate,
  type CustomerDbRow,
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

function parseCustomerId(event: H3Event) {
  const rawId = getRouterParam(event, 'id')
  const customerId = Number(rawId)
  if (!rawId || !Number.isInteger(customerId) || customerId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Некорректный идентификатор пользователя.'
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
        ? `Поле ${fieldName} должно быть целым числом.`
        : `Поле ${fieldName} должно быть целым числом не меньше 0.`
    })
  }

  return amount
}

function parseAge(value: unknown) {
  const age = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(age) || age < 18) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Поле age должно быть целым числом не меньше 18.'
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
      statusMessage: 'Поле buildingId должно быть положительным целым числом.'
    })
  }

  return buildingId
}

function parseObjectPositions(value: unknown) {
  if (!Array.isArray(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Поле objectPositions должно быть массивом строк.'
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
      statusMessage: 'Поле phoneNumber обязательно.'
    })
  }

  const digits = String(value).trim().replace(/\D/g, '')
  if (digits.length < 9) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Поле phoneNumber должно быть валидным номером.'
    })
  }

  return `+${digits}`
}

function parseUpdateBody(body: unknown): UpdateCustomerBody {
  if (!body || typeof body !== 'object') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Тело запроса должно быть корректным JSON-объектом.'
    })
  }

  const input = body as Record<string, unknown>
  const update: UpdateCustomerBody = {}

  if (input.fullName !== undefined) {
    if (!isNonEmptyString(input.fullName)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Поле fullName обязательно.'
      })
    }
    update.fullName = input.fullName.trim()
  }

  if (input.username !== undefined) {
    if (!isNonEmptyString(input.username) || input.username.trim().length < 3) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Поле username должно содержать минимум 3 символа.'
      })
    }
    update.username = input.username.trim()
  }

  if (input.password !== undefined) {
    if (!isNonEmptyString(input.password) || input.password.trim().length < 6) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Поле password должно содержать минимум 6 символов.'
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
        statusMessage: 'Поле workShift должно быть \'day\' или \'night\'.'
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
    if (!isNonEmptyString(input.role)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Поле role должно быть строкой.'
      })
    }
    update.role = input.role.trim()
  }

  if (input.baseSalary !== undefined) {
    update.baseSalary = parseMoney(input.baseSalary, 'baseSalary', false)
  }

  if (input.positionBonus !== undefined) {
    update.positionBonus = parseMoney(input.positionBonus, 'positionBonus', true)
  }

  let requestedStatus: UpdateCustomerBody['status'] | undefined

  if (input.status !== undefined) {
    const allowed = ['pending', 'active', 'inactive', 'archived']
    if (typeof input.status !== 'string' || !allowed.includes(input.status)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Поле status должно быть pending, active, inactive или archived.'
      })
    }
    requestedStatus = input.status as UpdateCustomerBody['status']
    update.status = requestedStatus
  }

  if (input.mustChangePassword !== undefined) {
    if (typeof input.mustChangePassword !== 'boolean') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Поле mustChangePassword должно быть true/false.'
      })
    }
    update.mustChangePassword = input.mustChangePassword
  }

  if (input.deactivationComment !== undefined) {
    if (input.deactivationComment !== null && typeof input.deactivationComment !== 'string') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Поле deactivationComment должно быть строкой.'
      })
    }
    update.deactivationComment = input.deactivationComment as string | undefined
  }

  if (input.archivedAt !== undefined) {
    if (input.archivedAt !== null && typeof input.archivedAt !== 'string') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Поле archivedAt должно быть ISO-датой или null.'
      })
    }
    update.archivedAt = input.archivedAt as string | null
  }

  if (requestedStatus === 'archived') {
    const comment = update.deactivationComment ?? (typeof input.deactivationComment === 'string' ? input.deactivationComment : '')
    if (typeof comment !== 'string' || !comment.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Для архивации обязательно заполните комментарий deactivationComment.'
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
      statusMessage: 'Нужно передать хотя бы одно поле для обновления.'
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
  const { url, serviceRoleKey } = getSupabaseServerConfig()

  try {
    const rows = await $fetch<CustomerDbRow[]>(`${url}/rest/v1/customers`, {
      method: 'PATCH',
      headers: {
        ...getSupabaseServerHeaders(serviceRoleKey),
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
        statusMessage: 'Пользователь не найден.'
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
        statusMessage: 'Пользователь с таким username или phoneNumber уже существует.'
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
