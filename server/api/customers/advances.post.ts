import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import { mapAdvanceDbRowToRecord, type EmployeeAdvanceDbRow } from './advances'

interface CreateAdvanceBody {
  customerId: number
  amount: number
  currency?: string
  comment?: string
  objectId?: number
  buildingId?: number
  issuedBy?: string
}

function parseBody(body: unknown): CreateAdvanceBody {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Тело запроса должно быть объектом.' })
  }

  const input = body as Record<string, unknown>
  const customerId = Number(input.customerId)
  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'customerId обязателен.' })
  }

  const amount = Number(input.amount)
  if (!Number.isInteger(amount) || amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'amount должен быть положительным целым числом.' })
  }

  const currency = typeof input.currency === 'string' && input.currency.trim().length
    ? input.currency.trim().toUpperCase()
    : 'UZS'

  return {
    customerId,
    amount,
    currency,
    comment: typeof input.comment === 'string' ? input.comment.trim() : undefined,
    objectId: input.objectId ? Number(input.objectId) : undefined,
    buildingId: input.buildingId ? Number(input.buildingId) : undefined,
    issuedBy: typeof input.issuedBy === 'string' ? input.issuedBy.trim() : undefined
  }
}

export default eventHandler(async (event) => {
  const payload = parseBody(await readBody(event))
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = {
    ...getDataApiServerHeaders(serviceRoleKey),
    Prefer: 'return=representation'
  }

  const rows = await $fetch<EmployeeAdvanceDbRow[]>(`${url}/rest/v1/employee_advances`, {
    method: 'POST',
    headers,
    body: {
      customer_id: payload.customerId,
      amount: payload.amount,
      currency: payload.currency,
      comment: payload.comment ?? null,
      object_id: payload.objectId ?? null,
      building_id: payload.buildingId ?? null,
      issued_by: payload.issuedBy ?? null
    }
  })

  const created = rows[0]
  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Не удалось создать аванс.' })
  }

  setResponseStatus(event, 201)
  return mapAdvanceDbRowToRecord(created)
})
