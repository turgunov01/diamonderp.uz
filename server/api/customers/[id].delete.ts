import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import { deleteEmployeeActivitiesByEmployeeId } from '../../utils/employee-activity'
import { mapCustomerDbRowToRecord, type CustomerDbRow } from './customers'
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

async function deleteCustomerRow(url: string, serviceRoleKey: string, customerId: number) {
  const rows = await $fetch<CustomerDbRow[]>(`${url}/rest/v1/customers`, {
    method: 'DELETE',
    headers: {
      ...getSupabaseServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    query: {
      id: `eq.${customerId}`
    }
  })

  const deletedRow = rows[0]
  if (!deletedRow) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Пользователь не найден.'
    })
  }

  return deletedRow
}

function getSupabaseErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('data' in error)) {
    return undefined
  }

  const data = error.data as { code?: string } | undefined
  return data?.code
}

export default eventHandler(async (event) => {
  const customerId = parseCustomerId(event)
  const { url, serviceRoleKey } = getSupabaseServerConfig()

  try {
    const deletedRow = await deleteCustomerRow(url, serviceRoleKey, customerId)

    try {
      await deleteEmployeeActivitiesByEmployeeId(customerId)
    } catch (cleanupError) {
      console.error('Failed to cleanup employee activities after customer delete.', cleanupError)
    }

    return mapCustomerDbRowToRecord(deletedRow)
  } catch (error) {
    if (getSupabaseErrorCode(error) === '23503') {
      await deleteEmployeeActivitiesByEmployeeId(customerId)

      const deletedRow = await deleteCustomerRow(url, serviceRoleKey, customerId)
      return mapCustomerDbRowToRecord(deletedRow)
    }

    throw error
  }
})
