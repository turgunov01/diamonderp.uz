import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import { mapAdvanceDbRowToRecord, type EmployeeAdvanceDbRow, type AdvanceStatus } from '../advances'
import type { H3Event } from 'h3'

function parseAdvanceId(event: H3Event) {
  const raw = getRouterParam(event, 'id')
  const id = Number(raw)
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: 'Некорректный id аванса.' })
  }
  return id
}

function parseBody(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, message: 'Тело запроса должно быть объектом.' })
  }

  const input = body as Record<string, unknown>
  const update: Partial<{
    comment: string | null
    status: AdvanceStatus
  }> = {}

  if (input.comment !== undefined) {
    if (input.comment !== null && typeof input.comment !== 'string') {
      throw createError({ statusCode: 400, message: 'comment должен быть строкой или null.' })
    }
    update.comment = input.comment as string | null
  }

  if (input.status !== undefined) {
    const status = String(input.status)
    if (!['issued', 'settled', 'cancelled'].includes(status)) {
      throw createError({ statusCode: 400, message: 'status должен быть issued/settled/cancelled.' })
    }
    update.status = status as AdvanceStatus
  }

  if (!Object.keys(update).length) {
    throw createError({ statusCode: 400, message: 'Нужно передать хотя бы одно поле.' })
  }

  if (update.status && update.status !== 'issued') {
    update.comment = update.comment ?? 'Закрыт'
  }

  return update
}

export default eventHandler(async (event) => {
  const advanceId = parseAdvanceId(event)
  const update = parseBody(await readBody(event))
  const { url, serviceRoleKey } = getDataApiServerConfig()

  const headers = {
    ...getDataApiServerHeaders(serviceRoleKey),
    Prefer: 'return=representation'
  }

  const rows = await $fetch<EmployeeAdvanceDbRow[]>(`${url}/rest/v1/employee_advances?id=eq.${advanceId}`, {
    method: 'PATCH',
    headers,
    body: {
      comment: update.comment ?? null,
      status: update.status ?? undefined,
      settled_at: update.status && update.status !== 'issued' ? new Date().toISOString() : undefined
    }
  })

  const updated = rows[0]
  if (!updated) {
    throw createError({ statusCode: 404, message: 'Аванс не найден.' })
  }

  return mapAdvanceDbRowToRecord(updated)
})
