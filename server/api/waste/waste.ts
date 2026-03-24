export type BinCategory = 'Макулатура' | 'Пластик' | 'Общее'
export type BinStatus = 'available' | 'loaded'
export type WasteDirection = 'in' | 'out'

export interface WasteBinRow {
  id: number
  object_id: number | null
  category: BinCategory
  volume_m3: number
  weight_kg: number
  status: BinStatus
  created_at: string
  updated_at: string
}

export interface WasteReportRow {
  id: number
  bin_id: number
  object_id: number | null
  category: BinCategory
  amount_m3: number
  amount_kg: number
  direction: WasteDirection
  from_object_id?: number | null
  to_object_id?: number | null
  vehicle?: string | null
  photo_url?: string | null
  comment?: string | null
  created_at: string
}

export interface WasteBin {
  id: number
  objectId: number | null
  category: BinCategory
  volumeM3: number
  weightKg: number
  status: BinStatus
  createdAt: string
  updatedAt: string
}

export interface WasteReport {
  id: number
  binId: number
  objectId: number | null
  category: BinCategory
  amountM3: number
  amountKg: number
  direction: WasteDirection
  fromObjectId?: number | null
  toObjectId?: number | null
  vehicle?: string | null
  photoUrl?: string | null
  comment?: string | null
  createdAt: string
}

export function mapBinRow(row: WasteBinRow): WasteBin {
  return {
    id: row.id,
    objectId: row.object_id,
    category: row.category,
    volumeM3: Number(row.volume_m3 || 0),
    weightKg: Number(row.weight_kg || 0),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function mapReportRow(row: WasteReportRow): WasteReport {
  return {
    id: row.id,
    binId: row.bin_id,
    objectId: row.object_id,
    category: row.category,
    amountM3: Number(row.amount_m3 || 0),
    amountKg: Number(row.amount_kg || 0),
    direction: row.direction,
    fromObjectId: row.from_object_id ?? null,
    toObjectId: row.to_object_id ?? null,
    vehicle: row.vehicle ?? null,
    photoUrl: row.photo_url ?? null,
    comment: row.comment ?? null,
    createdAt: row.created_at
  }
}
