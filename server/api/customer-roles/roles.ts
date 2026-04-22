export interface CustomerRoleDbRow {
  id: number
  building_id?: number | null
  code: string
  label: string
  is_active?: boolean | null
  created_at?: string | null
}

export interface CustomerRoleRecord {
  id: number
  buildingId: number | null
  code: string
  label: string
  isActive: boolean
  createdAt: string | null
  scope: 'global' | 'building' | 'fallback'
  isSystem: boolean
  isReadonly: boolean
}

export const DEFAULT_CUSTOMER_ROLES: Array<Pick<CustomerRoleRecord, 'code' | 'label'>> = [
  { code: 'customer', label: 'Сотрудник' },
  { code: 'cleaner', label: 'Клинер' },
  { code: 'manager', label: 'Менеджер' },
  { code: 'supervisor', label: 'Супервайзер' },
  { code: 'procurement', label: 'Закупщик' },
  { code: 'hr', label: 'HR' },
  { code: 'admin', label: 'Админ' }
]

const RESERVED_ROLE_CODES = new Set(DEFAULT_CUSTOMER_ROLES.map(role => role.code))

export function isReservedCustomerRoleCode(value: string) {
  return RESERVED_ROLE_CODES.has(value)
}

export function normalizeRoleCode(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function mapCustomerRoleRow(row: CustomerRoleDbRow): CustomerRoleRecord {
  const code = row.code.trim().toLowerCase()
  const buildingId = row.building_id ?? null

  return {
    id: row.id,
    buildingId,
    code: row.code,
    label: row.label,
    isActive: row.is_active !== false,
    createdAt: row.created_at ?? null,
    scope: buildingId ? 'building' : 'global',
    isSystem: isReservedCustomerRoleCode(code),
    isReadonly: false
  }
}

export function dedupeRolesByCode(rows: CustomerRoleRecord[], buildingId?: number) {
  if (!Number.isInteger(buildingId) || (buildingId ?? 0) <= 0) {
    return rows
  }

  const byCode = new Map<string, CustomerRoleRecord>()

  // Prefer building-specific role over global one with same code.
  for (const role of rows) {
    const key = role.code.trim()
    if (!key) continue

    const existing = byCode.get(key)
    if (!existing) {
      byCode.set(key, role)
      continue
    }

    if (existing.buildingId !== buildingId && role.buildingId === buildingId) {
      byCode.set(key, role)
    }
  }

  return Array.from(byCode.values())
}
