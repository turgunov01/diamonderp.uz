import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import { mapCustomerRoleRow, normalizeRoleCode, type CustomerRoleDbRow } from './roles'

interface CreateCustomerRoleBody {
  buildingId?: number | null
  code: string
  label: string
}

function parseBuildingId(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Поле buildingId должно быть положительным целым числом или null.'
    })
  }

  return parsed
}

export default eventHandler(async (event) => {
  const body = await readBody<CreateCustomerRoleBody>(event)
  const buildingId = parseBuildingId(body?.buildingId)
  const code = normalizeRoleCode(body?.code)
  const label = typeof body?.label === 'string' ? body.label.trim() : ''

  if (!code) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Поле code обязательно (латиница/цифры/._-).'
    })
  }

  if (!label) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Поле label обязательно.'
    })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const [created] = await $fetch<CustomerRoleDbRow[]>(`${url}/rest/v1/customer_roles`, {
    method: 'POST',
    headers: {
      ...getDataApiServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    body: {
      building_id: buildingId,
      code,
      label,
      is_active: true
    }
  })

  if (!created) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Не удалось создать роль.'
    })
  }

  setResponseStatus(event, 201)
  return mapCustomerRoleRow(created)
})
