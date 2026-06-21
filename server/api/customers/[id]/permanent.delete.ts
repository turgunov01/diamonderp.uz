import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import { mapCustomerDbRowToRecord, type CustomerDbRow } from '../customers'
import type { H3Event } from 'h3'

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

export default eventHandler(async (event) => {
  const customerId = parseCustomerId(event)
  const { url, serviceRoleKey } = getDataApiServerConfig()

  const rows = await $fetch<CustomerDbRow[]>(`${url}/rest/v1/customers`, {
    method: 'DELETE',
    headers: {
      ...getDataApiServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    query: {
      id: `eq.${customerId}`,
      status: 'eq.archived'
    }
  })

  const deletedRow = rows[0]
  if (!deletedRow) {
    const existingRows = await $fetch<Array<Pick<CustomerDbRow, 'id' | 'status'>>>(`${url}/rest/v1/customers`, {
      headers: getDataApiServerHeaders(serviceRoleKey),
      query: {
        select: 'id,status',
        id: `eq.${customerId}`
      }
    })

    const existing = existingRows[0]
    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ.'
      })
    }

    throw createError({
      statusCode: 409,
      statusMessage: 'РњРѕР¶РЅРѕ СѓРґР°Р»РёС‚СЊ РїРѕР»РЅРѕСЃС‚СЊСЋ С‚РѕР»СЊРєРѕ Р°СЂС…РёРІРёСЂРѕРІР°РЅРЅРѕРіРѕ СЃРѕС‚СЂСѓРґРЅРёРєР°.'
    })
  }

  return mapCustomerDbRowToRecord(deletedRow)
})

