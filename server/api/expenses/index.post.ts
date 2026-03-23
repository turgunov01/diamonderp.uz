import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import {
  isExpenseStatus,
  mapExpenseDbRowToRecord,
  parseNonNegativeInt,
  type ExpenseDbRow,
  type ExpenseStatus
} from './expenses'

interface CreateExpenseBody {
  title: string
  category: string
  vendor: string
  plannedAmount: number
  actualAmount?: number
  dueDate?: string
  notes?: string
  status?: ExpenseStatus
  objectId?: number
}

function requiredTrimmedString(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !value.trim().length) {
    throw createError({
      statusCode: 400,
      statusMessage: `${fieldName} is required.`
    })
  }

  return value.trim()
}

function parseCreateBody(body: unknown): CreateExpenseBody {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Тело запроса должно быть корректным объектом.' })
  }

  const input = body as Partial<CreateExpenseBody>
  const title = requiredTrimmedString(input.title, 'title')
  const category = requiredTrimmedString(input.category, 'category')
  const vendor = requiredTrimmedString(input.vendor, 'vendor')
  const plannedAmount = parseNonNegativeInt(input.plannedAmount, 'plannedAmount')
  const objectId = parseNonNegativeInt(input.objectId, 'objectId')

  let status: ExpenseStatus = 'draft'
  if (input.status !== undefined) {
    if (!isExpenseStatus(input.status)) {
      throw createError({ statusCode: 400, statusMessage: 'Некорректный статус.' })
    }
    status = input.status
  }

  const actualAmount = input.actualAmount !== undefined
    ? parseNonNegativeInt(input.actualAmount, 'actualAmount')
    : undefined

  return {
    title,
    category,
    vendor,
    plannedAmount,
    actualAmount,
    dueDate: typeof input.dueDate === 'string' && input.dueDate.length ? input.dueDate : undefined,
    notes: typeof input.notes === 'string' && input.notes.trim().length ? input.notes.trim() : undefined,
    status,
    objectId
  }
}

export default eventHandler(async (event) => {
  const payload = parseCreateBody(await readBody(event))
  const { url, serviceRoleKey } = getSupabaseServerConfig()

  const rows = await $fetch<ExpenseDbRow[]>(`${url}/rest/v1/expenses`, {
    method: 'POST',
    headers: {
      ...getSupabaseServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    body: {
      title: payload.title,
      category: payload.category,
      vendor: payload.vendor,
      planned_amount: payload.plannedAmount,
      actual_amount: payload.actualAmount ?? null,
      currency: 'UZS',
      due_date: payload.dueDate || null,
      status: payload.status,
      notes: payload.notes || null,
      object_id: payload.objectId
    }
  })

  const created = rows[0]
  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Supabase не вернул созданный расход.' })
  }

  setResponseStatus(event, 201)
  return mapExpenseDbRowToRecord(created)
})

