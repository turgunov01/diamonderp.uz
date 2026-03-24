export type WorkShift = 'day' | 'night'
export type CustomerLifecycleStatus = 'pending' | 'active' | 'inactive' | 'archived'

export interface CustomerRecord {
  id: number
  buildingId?: number | null
  fullName: string
  username: string
  avatar: {
    src: string
  }
  password: string
  phoneNumber: string
  passportFile: string
  passportFrontPath?: string
  passportBackPath?: string
  age: number
  workShift: WorkShift
  objectPinned: string
  objectPositions: string[]
  baseSalary: number
  positionBonus: number
  salaryCurrency: 'UZS'
  status: CustomerLifecycleStatus
  mustChangePassword: boolean
  activatedAt?: string | null
  archivedAt?: string | null
  deactivationComment?: string | null
}

export interface CreateCustomerBody {
  buildingId?: number | null
  fullName: string
  username: string
  avatar: {
    src: string
  }
  password: string
  phoneNumber: string
  passportFile: string
  passportFrontPath?: string
  passportBackPath?: string
  age: number
  workShift: WorkShift
  objectPinned: string
  objectPositions: string[]
  baseSalary?: number
  positionBonus?: number
  salaryCurrency?: 'UZS'
  status?: CustomerLifecycleStatus
  mustChangePassword?: boolean
}

export interface UpdateCustomerBody {
  buildingId?: number | null
  fullName?: string
  username?: string
  password?: string
  phoneNumber?: string
  age?: number
  workShift?: WorkShift
  objectPinned?: string
  objectPositions?: string[]
  baseSalary?: number
  positionBonus?: number
  status?: CustomerLifecycleStatus
  mustChangePassword?: boolean
  deactivationComment?: string
  archivedAt?: string | null
}

export interface CustomerDbRow {
  id: number
  building_id?: number | null
  full_name: string
  username: string
  avatar: string
  password: string
  phone_number: string
  passport_file: string
  passport_front_path?: string | null
  passport_back_path?: string | null
  age: number
  work_shift: WorkShift
  object_pinned: string
  object_positions: string[]
  base_salary?: number
  position_bonus?: number
  salary_currency?: 'UZS'
  status?: CustomerLifecycleStatus
  must_change_password?: boolean
  activated_at?: string | null
  archived_at?: string | null
  deactivation_comment?: string | null
}

export function mapCustomerDbRowToRecord(row: CustomerDbRow): CustomerRecord {
  return {
    id: row.id,
    buildingId: row.building_id ?? null,
    fullName: row.full_name,
    username: row.username,
    avatar: { src: row.avatar },
    password: row.password,
    phoneNumber: row.phone_number,
    passportFile: row.passport_file,
    passportFrontPath: row.passport_front_path || undefined,
    passportBackPath: row.passport_back_path || undefined,
    age: row.age,
    workShift: row.work_shift,
    objectPinned: row.object_pinned,
    objectPositions: row.object_positions,
    baseSalary: row.base_salary ?? 1000000,
    positionBonus: row.position_bonus ?? 0,
    salaryCurrency: row.salary_currency ?? 'UZS',
    status: row.status || 'pending',
    mustChangePassword: row.must_change_password ?? true,
    activatedAt: row.activated_at ?? null,
    archivedAt: row.archived_at ?? null,
    deactivationComment: row.deactivation_comment ?? null
  }
}

export function mapCreateBodyToDbInsert(body: CreateCustomerBody) {
  return {
    full_name: body.fullName,
    username: body.username,
    building_id: body.buildingId ?? null,
    avatar: body.avatar.src,
    password: body.password,
    phone_number: body.phoneNumber,
    passport_file: body.passportFile,
    passport_front_path: body.passportFrontPath ?? null,
    passport_back_path: body.passportBackPath ?? null,
    age: body.age,
    work_shift: body.workShift,
    object_pinned: body.objectPinned,
    object_positions: body.objectPositions,
    base_salary: body.baseSalary ?? 1000000,
    position_bonus: body.positionBonus ?? 0,
    salary_currency: body.salaryCurrency ?? 'UZS',
    status: body.status ?? 'pending',
    must_change_password: body.mustChangePassword ?? true
  }
}

export function mapUpdateBodyToDbUpdate(body: UpdateCustomerBody) {
  const update: {
    full_name?: string
    username?: string
    building_id?: number | null
    password?: string
    phone_number?: string
    age?: number
    work_shift?: WorkShift
    object_pinned?: string
    object_positions?: string[]
    base_salary?: number
    position_bonus?: number
    status?: CustomerLifecycleStatus
    must_change_password?: boolean
    deactivation_comment?: string | null
    archived_at?: string | null
  } = {}

  if (body.fullName) {
    update.full_name = body.fullName
  }
  if (body.username) {
    update.username = body.username
  }
  if (body.buildingId !== undefined) {
    update.building_id = body.buildingId
  }
  if (body.password) {
    update.password = body.password
  }
  if (body.phoneNumber) {
    update.phone_number = body.phoneNumber
  }
  if (typeof body.age === 'number') {
    update.age = body.age
  }
  if (body.workShift) {
    update.work_shift = body.workShift
  }
  if (body.objectPinned !== undefined) {
    update.object_pinned = body.objectPinned
  }
  if (body.objectPositions) {
    update.object_positions = body.objectPositions
  }
  if (typeof body.baseSalary === 'number') {
    update.base_salary = body.baseSalary
  }
  if (typeof body.positionBonus === 'number') {
    update.position_bonus = body.positionBonus
  }
  if (body.status) {
    update.status = body.status
  }
  if (typeof body.mustChangePassword === 'boolean') {
    update.must_change_password = body.mustChangePassword
  }
  if (body.deactivationComment !== undefined) {
    update.deactivation_comment = body.deactivationComment
  }
  if (body.archivedAt !== undefined) {
    update.archived_at = body.archivedAt
  }

  return update
}
