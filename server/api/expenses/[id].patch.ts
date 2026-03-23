import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import {
  isExpenseStatus,
  mapExpenseDbRowToRecord,
  parseNonNegativeInt,
  type ExpenseDbRow
} from './expenses'
import type { H3Event } from 'h3'

interface UpdateExpenseBody {
  status?: string
  actualAmount?: number
  notes?: string
}

function parseExpenseId(event: H3Event) {
  const rawId = getRouterParam(event, 'id')
  const expenseId = Number(rawId)

  if (!rawId || !Number.isInteger(expenseId) || expenseId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный id расхода.' })
  }

  return expenseId
}

function parseUpdateBody(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Тело запроса должно быть корректным объектом.' })
  }

  const input = body as UpdateExpenseBody
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  }

  if (input.status !== undefined) {
    if (!isExpenseStatus(input.status)) {
      throw createError({ statusCode: 400, statusMessage: 'Некорректный статус.' })
    }
    patch.status = input.status
  }

  if (input.actualAmount !== undefined) {
    patch.actual_amount = parseNonNegativeInt(input.actualAmount, 'actualAmount')
  }

  if (input.notes !== undefined) {
    patch.notes = typeof input.notes === 'string' && input.notes.trim().length
      ? input.notes.trim()
      : null
  }

  if (Object.keys(patch).length === 1) {
    throw createError({ statusCode: 400, statusMessage: 'Нет данных для обновления.' })
  }

  return patch
}

export default eventHandler(async (event) => {
  const expenseId = parseExpenseId(event)
  const patch = parseUpdateBody(await readBody(event))
  const { url, serviceRoleKey } = getSupabaseServerConfig()

  const rows = await $fetch<ExpenseDbRow[]>(`${url}/rest/v1/expenses`, {
    method: 'PATCH',
    headers: {
      ...getSupabaseServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    query: {
      id: `eq.${expenseId}`
    },
    body: patch
  })

  const updated = rows[0]
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Расход не найден.' })
  }

  return mapExpenseDbRowToRecord(updated)
})

