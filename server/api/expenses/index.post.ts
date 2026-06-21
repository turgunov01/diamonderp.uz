import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import {
  isExpenseStatus,
  mapExpenseDbRowToRecord,
  parseNonNegativeInt,
  type ExpenseDbRow,
  type ExpenseStatus
} from './expenses'
import {
  mapWarehouseItemDbRowToRecord,
  parsePositiveInt,
  parsePositiveNumber,
  type WarehouseItemDbRow
} from '../warehouse/warehouse'

interface CreateExpenseBody {
  title?: string
  category?: string
  vendor?: string
  plannedAmount?: number
  actualAmount?: number
  warehouseItemId?: number
  quantity?: number
  dueDate?: string
  notes?: string
  status?: ExpenseStatus
  objectId?: number
}

interface ParsedCreateExpenseBody extends CreateExpenseBody {
  status: ExpenseStatus
  objectId: number
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

function parseCreateBody(body: unknown): ParsedCreateExpenseBody {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Тело запроса должно быть корректным объектом.' })
  }

  const input = body as Partial<CreateExpenseBody>
  const objectId = parsePositiveInt(input.objectId, 'objectId')
  const warehouseItemId = input.warehouseItemId !== undefined
    ? parsePositiveInt(input.warehouseItemId, 'warehouseItemId')
    : undefined
  const quantity = input.quantity !== undefined
    ? parsePositiveNumber(input.quantity, 'quantity')
    : undefined

  let title: string | undefined
  let category: string | undefined
  let vendor: string | undefined
  let plannedAmount: number | undefined

  if (warehouseItemId) {
    if (quantity === undefined) {
      throw createError({ statusCode: 400, statusMessage: 'quantity is required.' })
    }
  } else {
    title = requiredTrimmedString(input.title, 'title')
    category = requiredTrimmedString(input.category, 'category')
    vendor = requiredTrimmedString(input.vendor, 'vendor')
    plannedAmount = parseNonNegativeInt(input.plannedAmount, 'plannedAmount')
  }

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
    warehouseItemId,
    quantity,
    dueDate: typeof input.dueDate === 'string' && input.dueDate.length ? input.dueDate : undefined,
    notes: typeof input.notes === 'string' && input.notes.trim().length ? input.notes.trim() : undefined,
    status,
    objectId
  }
}

async function fetchWarehouseItem(url: string, serviceRoleKey: string, id: number) {
  const rows = await $fetch<WarehouseItemDbRow[]>(`${url}/rest/v1/warehouse_items`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query: {
      select: 'id,name,manufacturer,calculation_type,unit_price,is_active,created_at,updated_at',
      id: `eq.${id}`,
      is_active: 'eq.true',
      limit: '1'
    }
  })

  const row = rows[0]
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Позиция склада не найдена.' })
  }

  return mapWarehouseItemDbRowToRecord(row)
}

export default eventHandler(async (event) => {
  const payload = parseCreateBody(await readBody(event))
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const warehouseItem = payload.warehouseItemId
    ? await fetchWarehouseItem(url, serviceRoleKey, payload.warehouseItemId)
    : null
  const plannedAmount = warehouseItem && payload.quantity
    ? Math.round(warehouseItem.unitPrice * payload.quantity)
    : payload.plannedAmount

  const rows = await $fetch<ExpenseDbRow[]>(`${url}/rest/v1/expenses`, {
    method: 'POST',
    headers: {
      ...getDataApiServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    body: {
      title: warehouseItem?.name || payload.title,
      category: warehouseItem ? 'Склад' : payload.category,
      vendor: warehouseItem?.manufacturer || payload.vendor,
      planned_amount: plannedAmount,
      actual_amount: payload.actualAmount ?? null,
      warehouse_item_id: warehouseItem?.id ?? null,
      quantity: payload.quantity ?? null,
      currency: 'UZS',
      due_date: payload.dueDate || null,
      status: payload.status,
      notes: payload.notes || null,
      object_id: payload.objectId
    }
  })

  const created = rows[0]
  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Postgres не вернул созданный расход.' })
  }

  setResponseStatus(event, 201)
  return mapExpenseDbRowToRecord(created)
})
