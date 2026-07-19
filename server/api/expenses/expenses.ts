export type ExpenseStatus = 'draft' | 'approved' | 'rejected' | 'paid'
export type ExpenseCalculationType = 'kg' | 'liter' | 'piece'

export interface ExpenseWarehouseItemDbRow {
  id: number
  name: string
  manufacturer: string
  calculation_type: ExpenseCalculationType
  unit_price: number
}

export interface ExpenseWarehouseItem {
  id: number
  name: string
  manufacturer: string
  calculationType: ExpenseCalculationType
  unitPrice: number
}

export interface ExpenseDbRow {
  id: number
  title: string
  category: string
  vendor: string
  planned_amount: number
  actual_amount: number | null
  warehouse_item_id: number | null
  quantity: number | string | null
  currency: string
  due_date: string | null
  status: ExpenseStatus
  notes: string | null
  created_at: string
  updated_at: string
  warehouseItem?: ExpenseWarehouseItemDbRow | null
}

export interface ExpenseRecord {
  id: number
  title: string
  category: string
  vendor: string
  plannedAmount: number
  actualAmount?: number
  warehouseItemId?: number
  warehouseItem?: ExpenseWarehouseItem
  quantity?: number
  currency: string
  dueDate?: string
  status: ExpenseStatus
  notes?: string
  createdAt: string
  updatedAt: string
}

export function mapExpenseDbRowToRecord(row: ExpenseDbRow): ExpenseRecord {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    vendor: row.vendor,
    plannedAmount: row.planned_amount,
    actualAmount: row.actual_amount ?? undefined,
    warehouseItemId: row.warehouse_item_id ?? undefined,
    warehouseItem: row.warehouseItem
      ? {
          id: row.warehouseItem.id,
          name: row.warehouseItem.name,
          manufacturer: row.warehouseItem.manufacturer,
          calculationType: row.warehouseItem.calculation_type,
          unitPrice: Number(row.warehouseItem.unit_price) || 0
        }
      : undefined,
    quantity: row.quantity === null || row.quantity === undefined ? undefined : Number(row.quantity),
    currency: row.currency,
    dueDate: row.due_date || undefined,
    status: row.status,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function isExpenseStatus(value: unknown): value is ExpenseStatus {
  return value === 'draft' || value === 'approved' || value === 'rejected' || value === 'paid'
}

export function parseNonNegativeInt(value: unknown, fieldName: string) {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(amount) || amount < 0) {
    throw createError({
      statusCode: 400,
      message: `${fieldName} must be an integer >= 0.`
    })
  }

  return amount
}
