import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import { mapCustomerDbRowToRecord, type CustomerDbRow } from '../customers'
import type { H3Event } from 'h3'

function parseCustomerId(event: H3Event) {
  const rawId = getRouterParam(event, 'id')
  const id = Number(rawId)
  if (!rawId || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный идентификатор пользователя.' })
  }
  return id
}

export default eventHandler(async (event) => {
  const customerId = parseCustomerId(event)
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = {
    ...getDataApiServerHeaders(serviceRoleKey),
    Prefer: 'return=representation'
  }

  const rows = await $fetch<CustomerDbRow[]>(`${url}/rest/v1/customers?id=eq.${customerId}`, {
    method: 'PATCH',
    headers,
    body: {
      status: 'active',
      archived_at: null,
      deactivation_comment: null,
      must_change_password: true
    }
  })

  const restored = rows[0]
  if (!restored) {
    throw createError({ statusCode: 404, statusMessage: 'Пользователь не найден.' })
  }

  return mapCustomerDbRowToRecord(restored)
})
