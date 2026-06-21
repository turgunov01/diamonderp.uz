import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import { mapCustomerDbRowToRecord, type CustomerDbRow } from '../customers'
import type { H3Event } from 'h3'

function parseCustomerId(event: H3Event) {
  const rawId = getRouterParam(event, 'id')
  const id = Number(rawId)
  if (!rawId || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.' })
  }
  return id
}

export default eventHandler(async (event) => {
  const customerId = parseCustomerId(event)
  const body = await readBody(event)
  const comment = typeof body?.comment === 'string' ? body.comment.trim() : null

  if (!comment) {
    throw createError({ statusCode: 400, statusMessage: 'РљРѕРјРјРµРЅС‚Р°СЂРёР№ РѕР±СЏР·Р°С‚РµР»РµРЅ РїСЂРё Р°СЂС…РёРІР°С†РёРё.' })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = {
    ...getDataApiServerHeaders(serviceRoleKey),
    Prefer: 'return=representation'
  }

  const rows = await $fetch<CustomerDbRow[]>(`${url}/rest/v1/customers?id=eq.${customerId}`, {
    method: 'PATCH',
    headers,
    body: {
      status: 'archived',
      archived_at: new Date().toISOString(),
      deactivation_comment: comment,
      object_pinned: '',
      must_change_password: true
    }
  })

  const updated = rows[0]
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ.' })
  }

  return mapCustomerDbRowToRecord(updated)
})
