import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import { mapCustomerDbRowToRecord, type CustomerDbRow } from '../customers'
import type { H3Event } from 'h3'

function parseCustomerId(event: H3Event) {
  const rawId = getRouterParam(event, 'id')
  const customerId = Number(rawId)
  if (!rawId || !Number.isInteger(customerId) || customerId <= 0) {
    throw createError({
      statusCode: 400,
      message: 'Некорректный идентификатор пользователя.'
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
        message: 'Пользователь не найден.'
      })
    }

    throw createError({
      statusCode: 409,
      message: 'Можно удалить полностью только архивированного сотрудника.'
    })
  }

  return mapCustomerDbRowToRecord(deletedRow)
})

