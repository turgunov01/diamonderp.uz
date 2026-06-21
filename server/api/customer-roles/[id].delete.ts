import type { H3Event } from 'h3'
import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import type { CustomerRoleDbRow } from './roles'

function parseRoleId(event: H3Event) {
  const rawId = getRouterParam(event, 'id')
  const roleId = Number(rawId)

  if (!rawId || !Number.isInteger(roleId) || roleId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ СЂРѕР»Рё.'
    })
  }

  return roleId
}

async function fetchRoleById(roleId: number) {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const rows = await $fetch<CustomerRoleDbRow[]>(`${url}/rest/v1/customer_roles`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query: {
      select: 'id,building_id,code,label',
      id: `eq.${roleId}`,
      limit: '1'
    }
  })

  return rows[0] || null
}

async function roleIsUsed(role: CustomerRoleDbRow) {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const query: Record<string, string> = {
    select: 'id',
    role: `eq.${role.code}`,
    limit: '1'
  }

  if (Number.isInteger(role.building_id) && (role.building_id ?? 0) > 0) {
    query.building_id = `eq.${role.building_id}`
  }

  const rows = await $fetch<Array<{ id: number }>>(`${url}/rest/v1/customers`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query
  })

  return Boolean(rows.length)
}

export default eventHandler(async (event) => {
  const roleId = parseRoleId(event)
  const role = await fetchRoleById(roleId)

  if (!role) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Р РѕР»СЊ РЅРµ РЅР°Р№РґРµРЅР°.'
    })
  }

  if (await roleIsUsed(role)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Р РѕР»СЊ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ Сѓ СЃРѕС‚СЂСѓРґРЅРёРєРѕРІ. РЎРЅР°С‡Р°Р»Р° РёР·РјРµРЅРёС‚Рµ СЂРѕР»Рё Сѓ СЃРѕС‚СЂСѓРґРЅРёРєРѕРІ.'
    })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  await $fetch(`${url}/rest/v1/customer_roles?id=eq.${roleId}`, {
    method: 'DELETE',
    headers: {
      ...getDataApiServerHeaders(serviceRoleKey),
      Prefer: 'return=minimal'
    }
  })

  return { success: true }
})
