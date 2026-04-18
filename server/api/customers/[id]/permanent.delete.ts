import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../../utils/supabase'
import { mapCustomerDbRowToRecord, type CustomerDbRow } from '../customers'
import type { H3Event } from 'h3'

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

export default eventHandler(async (event) => {
  const customerId = parseCustomerId(event)
  const { url, serviceRoleKey } = getSupabaseServerConfig()

  const rows = await $fetch<CustomerDbRow[]>(`${url}/rest/v1/customers`, {
    method: 'DELETE',
    headers: {
      ...getSupabaseServerHeaders(serviceRoleKey),
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
      headers: getSupabaseServerHeaders(serviceRoleKey),
      query: {
        select: 'id,status',
        id: `eq.${customerId}`
      }
    })

    const existing = existingRows[0]
    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Пользователь не найден.'
      })
    }

    throw createError({
      statusCode: 409,
      statusMessage: 'Можно удалить полностью только архивированного сотрудника.'
    })
  }

  return mapCustomerDbRowToRecord(deletedRow)
})

