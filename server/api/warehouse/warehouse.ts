export type WarehouseCalculationType = 'kg' | 'liter' | 'piece'

export interface WarehouseItemDbRow {
  id: number
  name: string
  manufacturer: string
  calculation_type: WarehouseCalculationType
  unit_price: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface WarehouseItemRecord {
  id: number
  name: string
  manufacturer: string
  calculationType: WarehouseCalculationType
  unitPrice: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export function mapWarehouseItemDbRowToRecord(row: WarehouseItemDbRow): WarehouseItemRecord {
  return {
    id: row.id,
    name: row.name,
    manufacturer: row.manufacturer,
    calculationType: row.calculation_type,
    unitPrice: Number(row.unit_price) || 0,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function isWarehouseCalculationType(value: unknown): value is WarehouseCalculationType {
  return value === 'kg' || value === 'liter' || value === 'piece'
}

export function requiredTrimmedString(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !value.trim().length) {
    throw createError({
      statusCode: 400,
      statusMessage: `${fieldName} is required.`
    })
  }

  return value.trim()
}

export function parsePositiveInt(value: unknown, fieldName: string) {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(amount) || amount <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `${fieldName} must be an integer > 0.`
    })
  }

  return amount
}

export function parsePositiveNumber(value: unknown, fieldName: string) {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `${fieldName} must be a number > 0.`
    })
  }

  return amount
}
