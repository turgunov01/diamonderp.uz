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
      statusMessage: 'РџРѕР»Рµ buildingId РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РїРѕР»РѕР¶РёС‚РµР»СЊРЅС‹Рј С†РµР»С‹Рј С‡РёСЃР»РѕРј РёР»Рё null.'
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
      statusMessage: 'РџРѕР»Рµ code РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ (Р»Р°С‚РёРЅРёС†Р°/С†РёС„СЂС‹/._-).'
    })
  }

  if (!label) {
    throw createError({
      statusCode: 400,
      statusMessage: 'РџРѕР»Рµ label РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ.'
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
      statusMessage: 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ СЂРѕР»СЊ.'
    })
  }

  setResponseStatus(event, 201)
  return mapCustomerRoleRow(created)
})
