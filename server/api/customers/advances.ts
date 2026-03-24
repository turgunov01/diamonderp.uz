export type AdvanceStatus = 'issued' | 'settled' | 'cancelled'

export interface EmployeeAdvanceRecord {
  id: number
  customerId: number
  amount: number
  currency: string
  comment?: string | null
  status: AdvanceStatus
  issuedBy?: string | null
  issuedAt: string
  settledAt?: string | null
  objectId?: number | null
  buildingId?: number | null
}

export interface EmployeeAdvanceDbRow {
  id: number
  customer_id: number
  amount: number
  currency: string
  comment?: string | null
  status: AdvanceStatus
  issued_by?: string | null
  issued_at: string
  settled_at?: string | null
  object_id?: number | null
  building_id?: number | null
}

export function mapAdvanceDbRowToRecord(row: EmployeeAdvanceDbRow): EmployeeAdvanceRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    amount: row.amount,
    currency: row.currency,
    comment: row.comment ?? null,
    status: row.status,
    issuedBy: row.issued_by ?? null,
    issuedAt: row.issued_at,
    settledAt: row.settled_at ?? null,
    objectId: row.object_id ?? null,
    buildingId: row.building_id ?? null
  }
}
