import type { H3Event } from 'h3'
import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import {
  isReservedCustomerRoleCode,
  mapCustomerRoleRow,
  normalizeRoleCode,
  type CustomerRoleDbRow
} from './roles'

interface UpdateCustomerRoleBody {
  code?: string
  label?: string
  isActive?: boolean
}

function parseRoleId(event: H3Event) {
  const rawId = getRouterParam(event, 'id')
  const roleId = Number(rawId)

  if (!rawId || !Number.isInteger(roleId) || roleId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Некорректный идентификатор роли.'
    })
  }

  return roleId
}

async function fetchRoleById(roleId: number) {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const rows = await $fetch<CustomerRoleDbRow[]>(`${url}/rest/v1/customer_roles`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query: {
      select: 'id,building_id,code,label,is_active,created_at',
      id: `eq.${roleId}`,
      limit: '1'
    }
  })

  return rows[0] || null
}

export default eventHandler(async (event) => {
  const roleId = parseRoleId(event)
  const input = await readBody<UpdateCustomerRoleBody>(event)
  const existing = await fetchRoleById(roleId)

  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Роль не найдена.'
    })
  }

  const label = typeof input?.label === 'string' ? input.label.trim() : undefined
  const wantsCodeUpdate = input?.code !== undefined
  const nextCode = wantsCodeUpdate ? normalizeRoleCode(input.code) : undefined

  if (label !== undefined && !label) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Поле label не может быть пустым.'
    })
  }

  if (wantsCodeUpdate) {
    if (!nextCode) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Поле code не может быть пустым.'
      })
    }

    if (!existing.building_id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Нельзя менять code у глобальной роли. Создайте новую роль с нужным кодом.'
      })
    }

    if (isReservedCustomerRoleCode(existing.code)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Нельзя менять code у системной роли.'
      })
    }

    if (isReservedCustomerRoleCode(nextCode) && nextCode !== existing.code) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Нельзя менять code на системное значение.'
      })
    }
  }

  const update: Record<string, unknown> = {}
  if (label !== undefined) {
    update.label = label
  }
  if (typeof input?.isActive === 'boolean') {
    update.is_active = input.isActive
  }
  if (wantsCodeUpdate && nextCode && nextCode !== existing.code) {
    update.code = nextCode
  }

  if (!Object.keys(update).length) {
    return mapCustomerRoleRow(existing)
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()

  if (update.code && existing.building_id) {
    await $fetch(`${url}/rest/v1/customers`, {
      method: 'PATCH',
      headers: getDataApiServerHeaders(serviceRoleKey),
      query: {
        building_id: `eq.${existing.building_id}`,
        role: `eq.${existing.code}`
      },
      body: {
        role: update.code
      }
    })
  }

  const [updated] = await $fetch<CustomerRoleDbRow[]>(`${url}/rest/v1/customer_roles`, {
    method: 'PATCH',
    headers: {
      ...getDataApiServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    query: {
      id: `eq.${roleId}`
    },
    body: update
  })

  if (!updated) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Не удалось обновить роль.'
    })
  }

  return mapCustomerRoleRow(updated)
})
