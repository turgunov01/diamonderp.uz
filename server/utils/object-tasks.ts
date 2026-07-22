import type { H3Event } from 'h3'
import type { AuthRole, AuthSession } from '~~/shared/types/auth'
import { getDataApiServerConfig, getDataApiServerHeaders } from './data-api'
import { verifyAuthToken } from './auth'
import { isMobileEmployeeTaskRole } from './mobile-access'
import { randomUUID } from 'node:crypto'

interface TaskObjectRow {
  id: number
  building_id?: number | null
  name: string
  description?: string | null
  address?: string | null
  code?: string | null
  is_active?: boolean | null
}

interface TaskCustomerRow {
  id: number
  building_id?: number | null
  full_name?: string | null
  username: string
  phone_number?: string | null
  work_shift?: 'day' | 'night' | null
  status?: string | null
  role?: string | null
  object_pinned?: string | null
  object_positions?: string[] | null
}

interface ObjectTaskListDbRow {
  id: number
  object_id: number | null
  employee_id: number | null
  group_id?: string | null
  title: string
  note?: string | null
  due_date?: string | null
  status?: string | null
  review_status?: string | null
  reviewer_id?: number | null
  review_requested_at?: string | null
  reviewed_at?: string | null
  review_comment?: string | null
  review_photo_path?: string | null
  created_by_id?: number | null
  created_by_name?: string | null
  created_by_role?: string | null
  created_at?: string | null
  updated_at?: string | null
}

interface ObjectTaskItemDbRow {
  id: number
  task_list_id: number
  title: string
  is_done?: boolean | null
  completed_at?: string | null
  proof_photo_path?: string | null
  sort_order?: number | null
  created_at?: string | null
  updated_at?: string | null
}

export type ObjectTaskStatus = 'open' | 'in_progress' | 'completed'
export type ObjectTaskReviewStatus = 'none' | 'pending' | 'approved' | 'rejected'

export interface ObjectTaskEmployeeRecord {
  id: number
  name: string
  username: string
  phone?: string
  workShift?: 'day' | 'night'
  status: string
}

export interface ObjectTaskItemRecord {
  id: number
  taskListId: number
  title: string
  isDone: boolean
  completedAt: string | null
  sortOrder: number
  proofPhotoUrl: string | null
  proofPhotoUrls: string[]
  images: string[]
}

export interface ObjectTaskRecord {
  id: number
  objectId: number | null
  objectName: string
  employeeId: number | null
  employeeName: string
  employeeUsername?: string
  employeePhone?: string
  employeeStatus?: string
  title: string
  note: string | null
  dueDate: string | null
  status: ObjectTaskStatus
  reviewStatus: ObjectTaskReviewStatus
  reviewerId: number | null
  reviewRequestedAt: string | null
  reviewedAt: string | null
  reviewComment: string | null
  reviewPhotoUrl: string | null
  reviewPhotoUrls: string[]
  reviewImages: string[]
  createdById: number | null
  createdByName: string | null
  createdByRole: string | null
  createdAt: string | null
  updatedAt: string | null
  totalItems: number
  completedItems: number
  progressPercent: number
  items: ObjectTaskItemRecord[]
}

export interface ObjectTaskObjectCard {
  id: number
  buildingId?: number | null
  name: string
  description?: string
  address?: string
  code?: string
  isActive: boolean
  employeeCount: number
  totalTasks: number
  openTasks: number
  inProgressTasks: number
  completedTasks: number
  employees: ObjectTaskEmployeeRecord[]
  tasks: ObjectTaskRecord[]
}

export interface ObjectTaskOverview {
  buildingId: number | null
  objects: ObjectTaskObjectCard[]
}

interface FetchObjectOptions {
  buildingId?: number
  objectIds?: number[]
}

interface FetchCustomerOptions {
  buildingId?: number
  customerIds?: number[]
}

interface FetchTaskListOptions {
  listIds?: number[]
  objectIds?: number[]
  employeeIds?: number[]
  reviewerIds?: number[]
  status?: ObjectTaskStatus
  reviewStatus?: ObjectTaskReviewStatus
}

interface CreateObjectTaskListInput {
  objectId: number | string
  employeeId?: number | string | null
  title: string
  note?: string | null
  dueDate?: string | null
  items: string[]
  creator?: AuthSession | null
}

interface UpdateObjectTaskItemCompletionInput {
  taskId: number
  itemId: number
  employeeId: number
  // Object ids the caller has access to. Task completion is object-scoped:
  // any employee assigned to the task's object may complete its items.
  allowedObjectIds?: number[]
  done: boolean
  photoFiles?: {
    filename?: string
    type?: string
    data: Uint8Array
  }[]
}

const TASK_MANAGER_ROLES: AuthRole[] = ['admin', 'procurement']

function normalizeKey(value?: string | null) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizeDisplayName(customer?: TaskCustomerRow | null) {
  if (!customer) {
    return ''
  }

  return customer.full_name?.trim() || customer.username?.trim() || ''
}

function isObjectTaskStatus(value: unknown): value is ObjectTaskStatus {
  return value === 'open' || value === 'in_progress' || value === 'completed'
}

function isObjectTaskReviewStatus(value: unknown): value is ObjectTaskReviewStatus {
  return value === 'none' || value === 'pending' || value === 'approved' || value === 'rejected'
}

function normalizeReviewStatus(value?: string | null): ObjectTaskReviewStatus {
  if (isObjectTaskReviewStatus(value)) {
    return value
  }

  return 'none'
}

function parseDueDate(value?: string | null) {
  if (!value) {
    return null
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw createError({
      statusCode: 400,
      message: 'dueDate must use YYYY-MM-DD format.'
    })
  }

  return normalized
}

function parsePositiveInteger(value: unknown, field: string) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError({
      statusCode: 400,
      message: `${field} must be a positive integer.`
    })
  }

  return parsed
}

function normalizeDatabasePositiveInteger(value: unknown, field: string) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError({
      statusCode: 500,
      message: `Invalid ${field} returned from database.`
    })
  }

  return parsed
}

function normalizeOptionalDatabasePositiveInteger(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  return normalizeDatabasePositiveInteger(value, field)
}

function getDataApiErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const data = (error as { data?: { code?: string } }).data
  return typeof data?.code === 'string' ? data.code : undefined
}

function getErrorStatusCode(error: unknown) {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const statusCode = (error as { statusCode?: number }).statusCode
  const status = (error as { status?: number }).status
  if (typeof statusCode === 'number') return statusCode
  if (typeof status === 'number') return status
  return undefined
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (!error || typeof error !== 'object') {
    return ''
  }

  const message = (error as { message?: unknown }).message
  return typeof message === 'string' ? message : ''
}

function getErrorCause(error: unknown) {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  return (error as { cause?: unknown }).cause
}

function getConnectionErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function isMissingTableError(error: unknown) {
  const code = getDataApiErrorCode(error)
  const status = getErrorStatusCode(error)

  return code === '42P01' // Postgres undefined_table
    || code === 'PGRST302' // PostgREST: relation not found
    || status === 404 // Fallback: Postgres may return plain 404 with message "Not Found"
}

function isDataApiConnectionError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase()
  const cause = getErrorCause(error)
  const causeMessage = getErrorMessage(cause).toLowerCase()
  const code = getConnectionErrorCode(error) || getConnectionErrorCode(cause)

  return message.includes('fetch failed')
    || message.includes('<no response>')
    || causeMessage.includes('fetch failed')
    || causeMessage.includes('enotfound')
    || code === 'ENOTFOUND'
    || code === 'EAI_AGAIN'
    || code === 'ECONNREFUSED'
    || code === 'ETIMEDOUT'
}

function throwDataApiRequestError(error: unknown): never {
  if (isDataApiConnectionError(error)) {
    throw createError({
      statusCode: 503,
      message: 'База данных недоступна: не удалось выполнить сетевой запрос. Проверьте интернет/DNS и POSTGRES_HOST.'
    })
  }

  throw error
}

function throwMissingTaskTablesError() {
  throw createError({
    statusCode: 500,
    message: 'Таблицы object_task_lists/object_task_items не найдены. Примените миграцию db/postgres/object_tasks.sql в базе данных.'
  })
}

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
}

function encodeStoragePath(path: string) {
  return path.split('/').map(part => encodeURIComponent(part)).join('/')
}

async function ensureStorageBucket(options: {
  url: string
  serviceRoleKey: string
  bucket: string
  isPublic: boolean
}) {
  try {
    await $fetch(`${options.url}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        ...getDataApiServerHeaders(options.serviceRoleKey),
        'Content-Type': 'application/json'
      },
      body: {
        id: options.bucket,
        name: options.bucket,
        public: options.isPublic
      }
    })
  } catch (error: unknown) {
    const statusCode = getErrorStatusCode(error)
    if (statusCode === 400 || statusCode === 409) {
      return
    }

    const data = (error as { data?: { message?: string } }).data
    if (typeof data?.message === 'string' && data.message.toLowerCase().includes('already exists')) {
      return
    }

    throw createError({
      statusCode: 500,
      message: `Не удалось подготовить бакет "${options.bucket}".`
    })
  }
}

async function uploadStorageObject(options: {
  url: string
  serviceRoleKey: string
  bucket: string
  path: string
  data: Uint8Array
  contentType: string
}) {
  try {
    await $fetch(`${options.url}/storage/v1/object/${options.bucket}/${encodeStoragePath(options.path)}`, {
      method: 'POST',
      headers: {
        ...getDataApiServerHeaders(options.serviceRoleKey),
        'Content-Type': options.contentType,
        'x-upsert': 'true'
      },
      body: options.data
    })
  } catch {
    throw createError({
      statusCode: 400,
      message: `Не удалось загрузить файл в бакет "${options.bucket}".`
    })
  }
}

async function fetchRows<T>(request: () => Promise<T[]>) {
  try {
    return await request()
  } catch (error: unknown) {
    throwDataApiRequestError(error)
  }
}

async function fetchRowsOrEmpty<T>(request: () => Promise<T[]>) {
  try {
    return await request()
  } catch (error: unknown) {
    if (isMissingTableError(error)) {
      return []
    }

    throwDataApiRequestError(error)
  }
}

function readSessionCookie(event: H3Event) {
  const rawSession = getCookie(event, 'diamond-erp-session')
  if (!rawSession) {
    return null
  }

  try {
    return JSON.parse(decodeURIComponent(rawSession)) as AuthSession
  } catch {
    return null
  }
}

export function requireTaskManagerSession(event: H3Event): AuthSession {
  // Authorization must derive from the signed token, never the unsigned
  // `diamond-erp-session` cookie (which a client could forge to fake a role).
  const token = getCookie(event, 'diamond-erp-token')
  let payload
  try {
    payload = verifyAuthToken(token || '')
  } catch {
    throw createError({
      statusCode: 401,
      message: 'Session is required.'
    })
  }

  if (!TASK_MANAGER_ROLES.includes(payload.role)) {
    throw createError({
      statusCode: 403,
      message: 'Task management access denied.'
    })
  }

  // Identity (id, role) comes from the verified token; display-only fields
  // (name, avatar) are read from the session cookie without trusting them.
  const idFromSub = Number(payload.sub.split(':')[1])
  const profile = readSessionCookie(event)

  return {
    id: Number.isInteger(idFromSub) && idFromSub > 0 ? idFromSub : (profile?.id ?? 0),
    email: payload.email ?? profile?.email,
    name: profile?.name || payload.email || 'Unknown',
    role: payload.role,
    avatar: profile?.avatar ?? null
  }
}

function mapObjectRow(row: TaskObjectRow) {
  return {
    id: normalizeDatabasePositiveInteger(row.id, 'object id'),
    buildingId: normalizeOptionalDatabasePositiveInteger(row.building_id, 'object building id'),
    name: row.name,
    description: row.description || undefined,
    address: row.address || undefined,
    code: row.code || undefined,
    isActive: row.is_active !== false
  }
}

function mapCustomerRow(row: TaskCustomerRow): TaskCustomerRow {
  return {
    ...row,
    id: normalizeDatabasePositiveInteger(row.id, 'customer id'),
    building_id: normalizeOptionalDatabasePositiveInteger(row.building_id, 'customer building id')
  }
}

function mapEmployeeRow(row: TaskCustomerRow): ObjectTaskEmployeeRecord {
  const employeeId = normalizeDatabasePositiveInteger(row.id, 'customer id')

  return {
    id: employeeId,
    name: normalizeDisplayName(row) || `Employee #${employeeId}`,
    username: row.username,
    phone: row.phone_number || undefined,
    workShift: row.work_shift || undefined,
    status: row.status || 'active'
  }
}

function mapTaskListRow(row: ObjectTaskListDbRow): ObjectTaskListDbRow {
  return {
    ...row,
    id: normalizeDatabasePositiveInteger(row.id, 'task list id'),
    object_id: normalizeOptionalDatabasePositiveInteger(row.object_id, 'task object id'),
    employee_id: normalizeOptionalDatabasePositiveInteger(row.employee_id, 'task employee id'),
    reviewer_id: normalizeOptionalDatabasePositiveInteger(row.reviewer_id, 'task reviewer id'),
    created_by_id: normalizeOptionalDatabasePositiveInteger(row.created_by_id, 'task creator id')
  }
}

function mapTaskItemRow(row: ObjectTaskItemDbRow): ObjectTaskItemRecord {
  const { url, taskPhotoBucket } = getDataApiServerConfig()
  const base = url.replace(/\/+$/, '')
  const itemId = normalizeDatabasePositiveInteger(row.id, 'task item id')
  const taskListId = normalizeDatabasePositiveInteger(row.task_list_id, 'task item task list id')
  const raw = row.proof_photo_path || null
  let paths: string[] = []

  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        paths = parsed.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      } else if (typeof parsed === 'string' && parsed.trim()) {
        paths = [parsed.trim()]
      }
    } catch {
      paths = [raw]
    }
  }

  const proofPhotoUrls = paths.map(path => `${base}/storage/v1/object/public/${taskPhotoBucket}/${encodeStoragePath(path)}`)

  return {
    id: itemId,
    taskListId,
    title: row.title,
    isDone: row.is_done === true,
    completedAt: row.completed_at || null,
    sortOrder: row.sort_order ?? 0,
    proofPhotoUrl: proofPhotoUrls[0] || null,
    proofPhotoUrls,
    images: proofPhotoUrls
  }
}

function deriveTaskStatus(items: ObjectTaskItemRecord[]): ObjectTaskStatus {
  if (!items.length) {
    return 'open'
  }

  const completedItems = items.filter(item => item.isDone).length
  if (!completedItems) {
    return 'open'
  }

  if (completedItems === items.length) {
    return 'completed'
  }

  return 'in_progress'
}

function isEmployeeAssignedToObject(customer: TaskCustomerRow, objectName: string) {
  const targetKey = normalizeKey(objectName)
  if (!targetKey) {
    return false
  }

  const assignedKeys = [
    normalizeKey(customer.object_pinned),
    ...(Array.isArray(customer.object_positions) ? customer.object_positions.map(value => normalizeKey(value)) : [])
  ]

  return assignedKeys.includes(targetKey)
}

function isAssignableEmployee(customer: TaskCustomerRow, objectName: string) {
  const role = customer.role || 'customer'
  const status = customer.status || 'active'

  if (!isMobileEmployeeTaskRole(role)) {
    return false
  }

  if (status === 'archived' || status === 'inactive') {
    return false
  }

  return isEmployeeAssignedToObject(customer, objectName)
}

async function fetchObjects(options: FetchObjectOptions = {}) {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const query: Record<string, string> = {
    select: 'id,building_id,name,description,address,code,is_active',
    order: 'name.asc'
  }

  if (options.objectIds?.length) {
    query.id = `in.(${options.objectIds.join(',')})`
  }

  if (Number.isInteger(options.buildingId) && (options.buildingId ?? 0) > 0) {
    query.building_id = `eq.${options.buildingId}`
  }

  const rows = await fetchRows<TaskObjectRow>(() => $fetch<TaskObjectRow[]>(`${url}/rest/v1/objects`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query
  }))

  return rows.map(mapObjectRow)
}

async function fetchCustomers(options: FetchCustomerOptions = {}) {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const query: Record<string, string> = {
    select: 'id,building_id,full_name,username,phone_number,work_shift,status,role,object_pinned,object_positions',
    order: 'full_name.asc'
  }

  if (options.customerIds?.length) {
    query.id = `in.(${options.customerIds.join(',')})`
  } else if (Number.isInteger(options.buildingId) && (options.buildingId ?? 0) > 0) {
    query.or = `(building_id.eq.${options.buildingId},building_id.is.null)`
  }

  const rows = await fetchRows<TaskCustomerRow>(() => $fetch<TaskCustomerRow[]>(`${url}/rest/v1/customers`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query
  }))

  return rows.map(mapCustomerRow)
}

async function fetchTaskLists(options: FetchTaskListOptions = {}) {
  if (options.listIds && !options.listIds.length) {
    return []
  }

  if (options.objectIds && !options.objectIds.length) {
    return []
  }

  if (options.employeeIds && !options.employeeIds.length) {
    return []
  }

  if (options.reviewerIds && !options.reviewerIds.length) {
    return []
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const query: Record<string, string> = {
    select: 'id,object_id,employee_id,group_id,title,note,due_date,status,review_status,reviewer_id,review_requested_at,reviewed_at,review_comment,review_photo_path,created_by_id,created_by_name,created_by_role,created_at,updated_at',
    order: 'updated_at.desc'
  }

  if (options.listIds?.length) {
    query.id = `in.(${options.listIds.join(',')})`
  }

  if (options.objectIds?.length) {
    query.object_id = `in.(${options.objectIds.join(',')})`
  }

  if (options.employeeIds?.length) {
    query.employee_id = `in.(${options.employeeIds.join(',')})`
  }

  if (options.reviewerIds?.length) {
    query.reviewer_id = `in.(${options.reviewerIds.join(',')})`
  }

  if (options.status) {
    query.status = `eq.${options.status}`
  }

  if (options.reviewStatus) {
    query.review_status = `eq.${options.reviewStatus}`
  }

  const rows = await fetchRowsOrEmpty<ObjectTaskListDbRow>(() => $fetch<ObjectTaskListDbRow[]>(`${url}/rest/v1/object_task_lists`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query
  }))

  return rows.map(mapTaskListRow)
}

async function fetchTaskItems(taskListIds: number[]) {
  if (!taskListIds.length) {
    return []
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()

  return await fetchRowsOrEmpty<ObjectTaskItemDbRow>(() => $fetch<ObjectTaskItemDbRow[]>(`${url}/rest/v1/object_task_items`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query: {
      select: 'id,task_list_id,title,is_done,completed_at,proof_photo_path,sort_order,created_at,updated_at',
      task_list_id: `in.(${taskListIds.join(',')})`,
      order: 'sort_order.asc,id.asc'
    }
  }))
}

function buildTaskRecord(
  row: ObjectTaskListDbRow,
  items: ObjectTaskItemRecord[],
  objectById: Map<number, ReturnType<typeof mapObjectRow>>,
  employeeById: Map<number, TaskCustomerRow>
): ObjectTaskRecord {
  const { url, taskPhotoBucket } = getDataApiServerConfig()
  const base = url.replace(/\/+$/, '')
  const taskId = normalizeDatabasePositiveInteger(row.id, 'task list id')
  const objectId = normalizeOptionalDatabasePositiveInteger(row.object_id, 'task object id')
  const employeeId = normalizeOptionalDatabasePositiveInteger(row.employee_id, 'task employee id')
  const reviewerId = normalizeOptionalDatabasePositiveInteger(row.reviewer_id, 'task reviewer id')
  const createdById = normalizeOptionalDatabasePositiveInteger(row.created_by_id, 'task creator id')
  const object = objectId ? objectById.get(objectId) : undefined
  const employee = employeeId ? employeeById.get(employeeId) : undefined
  const completedItems = items.filter(item => item.isDone).length
  const totalItems = items.length
  const status = deriveTaskStatus(items)
  const reviewStatus = normalizeReviewStatus(row.review_status)
  const rawReviewPhoto = row.review_photo_path || null
  let reviewPhotoPaths: string[] = []

  if (rawReviewPhoto) {
    try {
      const parsed = JSON.parse(rawReviewPhoto)
      if (Array.isArray(parsed)) {
        reviewPhotoPaths = parsed.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      } else if (typeof parsed === 'string' && parsed.trim()) {
        reviewPhotoPaths = [parsed.trim()]
      }
    } catch {
      reviewPhotoPaths = [rawReviewPhoto]
    }
  }

  const reviewPhotoUrls = reviewPhotoPaths.map(path => `${base}/storage/v1/object/public/${taskPhotoBucket}/${encodeStoragePath(path)}`)

  return {
    id: taskId,
    objectId,
    objectName: object?.name || `Object #${objectId ?? taskId}`,
    employeeId,
    employeeName: employeeId
      ? (normalizeDisplayName(employee) || `Employee #${employeeId}`)
      : 'Все сотрудники',
    employeeUsername: employeeId ? (employee?.username || undefined) : undefined,
    employeePhone: employeeId ? (employee?.phone_number || undefined) : undefined,
    employeeStatus: employeeId ? (employee?.status || undefined) : undefined,
    title: row.title,
    note: row.note || null,
    dueDate: row.due_date || null,
    status,
    reviewStatus,
    reviewerId,
    reviewRequestedAt: row.review_requested_at || null,
    reviewedAt: row.reviewed_at || null,
    reviewComment: row.review_comment || null,
    reviewPhotoUrl: reviewPhotoUrls[0] || null,
    reviewPhotoUrls,
    reviewImages: reviewPhotoUrls,
    createdById,
    createdByName: row.created_by_name || null,
    createdByRole: row.created_by_role || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    totalItems,
    completedItems,
    progressPercent: totalItems ? Math.round((completedItems / totalItems) * 100) : 0,
    items
  }
}

function buildItemsMap(rows: ObjectTaskItemDbRow[]) {
  const map = new Map<number, ObjectTaskItemRecord[]>()

  for (const row of rows) {
    const item = mapTaskItemRow(row)
    const next = map.get(item.taskListId) || []
    next.push(item)
    map.set(item.taskListId, next)
  }

  return map
}

function sortTasks(tasks: ObjectTaskRecord[]) {
  return [...tasks].sort((left, right) => {
    const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime()
    const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime()
    return rightTime - leftTime
  })
}

export function parseOptionalObjectTaskStatus(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (isObjectTaskStatus(value)) {
    return value
  }

  throw createError({
    statusCode: 400,
    message: 'Invalid task status.'
  })
}

export function parseOptionalObjectTaskReviewStatus(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (isObjectTaskReviewStatus(value)) {
    return value
  }

  throw createError({
    statusCode: 400,
    message: 'Invalid task review status.'
  })
}

export async function buildObjectTaskOverview(
  buildingId?: number,
  options: { view?: 'raw' | 'grouped' } = {}
): Promise<ObjectTaskOverview> {
  const objects = await fetchObjects({ buildingId })
  const objectIds = objects.map(object => object.id)
  const [customers, taskLists] = await Promise.all([
    fetchCustomers({ buildingId }),
    fetchTaskLists({ objectIds })
  ])
  const taskItems = await fetchTaskItems(taskLists.map(task => task.id))

  const objectById = new Map(objects.map(object => [object.id, object]))
  const customerById = new Map(customers.map(customer => [customer.id, customer]))
  const itemsByTaskId = buildItemsMap(taskItems)

  const pairs = taskLists.map((row) => {
    return {
      row,
      record: buildTaskRecord(row, itemsByTaskId.get(row.id) || [], objectById, customerById)
    }
  })

  const view = options.view === 'grouped' ? 'grouped' : 'raw'
  const taskRecords = view === 'raw'
    ? sortTasks(pairs.map(pair => pair.record))
    : sortTasks(buildGroupedTaskRecords(pairs.map(pair => ({ row: pair.row, record: pair.record }))))

  return {
    buildingId: Number.isInteger(buildingId) ? buildingId ?? null : null,
    objects: objects.map((object) => {
      const employees = customers
        .filter(customer => isAssignableEmployee(customer, object.name))
        .map(mapEmployeeRow)
      const tasks = taskRecords.filter(task => task.objectId === object.id)

      return {
        ...object,
        employeeCount: employees.length,
        totalTasks: tasks.length,
        openTasks: tasks.filter(task => task.status === 'open').length,
        inProgressTasks: tasks.filter(task => task.status === 'in_progress').length,
        completedTasks: tasks.filter(task => task.status === 'completed').length,
        employees,
        tasks
      } satisfies ObjectTaskObjectCard
    })
  }
}

function buildGroupedTaskRecords(pairs: { row: ObjectTaskListDbRow, record: ObjectTaskRecord }[]) {
  type Group = {
    representative: ObjectTaskRecord
    records: ObjectTaskRecord[]
  }

  const groups = new Map<string, Group>()
  const output: ObjectTaskRecord[] = []

  for (const pair of pairs) {
    const objectId = pair.record.objectId
    if (typeof objectId !== 'number' || objectId <= 0) {
      continue
    }

    if (!pair.row.group_id) {
      output.push(pair.record)
      continue
    }

    const groupKey = `${objectId}:${pair.row.group_id}`
    const existing = groups.get(groupKey)

    if (!existing) {
      groups.set(groupKey, {
        representative: pair.record,
        records: [pair.record]
      })
      continue
    }

    existing.records.push(pair.record)
  }

  for (const group of groups.values()) {
    const records = group.records
    if (records.length <= 1) {
      output.push(group.representative)
      continue
    }

    const representativeSeed = records[0] ?? group.representative
    const representative = records.reduce((best, current) => {
      const statusRank = (status: ObjectTaskStatus) => status === 'completed' ? 2 : status === 'in_progress' ? 1 : 0
      const bestRank = statusRank(best.status)
      const currentRank = statusRank(current.status)

      if (currentRank !== bestRank) {
        return currentRank > bestRank ? current : best
      }

      const bestTime = new Date(best.updatedAt || best.createdAt || 0).getTime()
      const currentTime = new Date(current.updatedAt || current.createdAt || 0).getTime()
      return currentTime > bestTime ? current : best
    }, representativeSeed)

    const totalEmployees = records.length
    const completedEmployees = records.filter(task => task.status === 'completed').length

    const status: ObjectTaskStatus = completedEmployees === totalEmployees
      ? 'completed'
      : completedEmployees > 0
        ? 'in_progress'
        : 'open'

    const latestTimestamp = records
      .map(task => task.updatedAt || task.createdAt || null)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map(value => new Date(value).getTime())
      .filter(value => Number.isFinite(value))
      .reduce((max, value) => Math.max(max, value), 0)

    const updatedAt = latestTimestamp ? new Date(latestTimestamp).toISOString() : representative.updatedAt

    output.push({
      ...representative,
      employeeId: null,
      employeeName: 'Все сотрудники',
      employeeUsername: undefined,
      employeePhone: undefined,
      employeeStatus: undefined,
      status,
      totalItems: totalEmployees,
      completedItems: completedEmployees,
      progressPercent: totalEmployees ? Math.round((completedEmployees / totalEmployees) * 100) : 0,
      updatedAt
    })
  }

  return output
}

async function deleteTaskList(taskListId: number) {
  const { url, serviceRoleKey } = getDataApiServerConfig()

  await $fetch(`${url}/rest/v1/object_task_lists`, {
    method: 'DELETE',
    headers: getDataApiServerHeaders(serviceRoleKey),
    query: {
      id: `eq.${taskListId}`
    }
  })
}

export async function createObjectTaskList(input: CreateObjectTaskListInput) {
  const objectId = parsePositiveInteger(input.objectId, 'objectId')
  const requestedEmployeeId = input.employeeId === undefined || input.employeeId === null || input.employeeId === ''
    ? null
    : parsePositiveInteger(input.employeeId, 'employeeId')
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null
  const dueDate = parseDueDate(input.dueDate)
  const itemTitles = Array.isArray(input.items)
    ? input.items.map(item => typeof item === 'string' ? item.trim() : '').filter(Boolean)
    : []

  if (!title) {
    throw createError({
      statusCode: 400,
      message: 'title is required.'
    })
  }

  if (!itemTitles.length) {
    throw createError({
      statusCode: 400,
      message: 'At least one todo item is required.'
    })
  }

  const objects = await fetchObjects({ objectIds: [objectId] })
  const object = objects[0]

  if (!object) {
    throw createError({
      statusCode: 404,
      message: 'Object not found.'
    })
  }

  const customers = await fetchCustomers({ buildingId: object.buildingId ?? undefined })
  const targetEmployees = (() => {
    if (requestedEmployeeId) {
      const employee = customers.find(customer => customer.id === requestedEmployeeId)
      if (!employee) {
        throw createError({
          statusCode: 404,
          message: 'Employee not found.'
        })
      }

      if (!isAssignableEmployee(employee, object.name)) {
        throw createError({
          statusCode: 400,
          message: 'Employee is not assigned to the selected object.'
        })
      }

      return [employee]
    }

    return customers.filter(customer => isAssignableEmployee(customer, object.name))
  })()

  if (!targetEmployees.length) {
    throw createError({
      statusCode: 400,
      message: 'No employees found for the selected object.'
    })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)
  const now = new Date().toISOString()
  const groupId = randomUUID()

  let createdLists: ObjectTaskListDbRow[] = []

  try {
    const rows = await $fetch<ObjectTaskListDbRow[]>(`${url}/rest/v1/object_task_lists`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'return=representation'
      },
      body: targetEmployees.map(employee => ({
        object_id: objectId,
        employee_id: employee.id,
        group_id: groupId,
        title,
        note,
        due_date: dueDate,
        status: 'open',
        created_by_id: input.creator?.id ?? null,
        created_by_name: input.creator?.name ?? null,
        created_by_role: input.creator?.role ?? null,
        updated_at: now
      }))
    })
    createdLists = rows.map(mapTaskListRow)
  } catch (error: unknown) {
    if (isMissingTableError(error)) {
      throwMissingTaskTablesError()
    }
    throw error
  }

  if (!createdLists.length) {
    throw createError({
      statusCode: 500,
      message: 'Failed to create task list.'
    })
  }

  let createdItems: ObjectTaskItemDbRow[] = []

  try {
    createdItems = await $fetch<ObjectTaskItemDbRow[]>(`${url}/rest/v1/object_task_items`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'return=representation'
      },
      body: createdLists.flatMap(list => itemTitles.map((itemTitle, index) => ({
        task_list_id: list.id,
        title: itemTitle,
        sort_order: index,
        is_done: false,
        completed_at: null,
        updated_at: now
      })))
    })
  } catch (error: unknown) {
    await Promise.all(createdLists.map(list => deleteTaskList(list.id).catch(() => undefined)))
    if (isMissingTableError(error)) {
      throwMissingTaskTablesError()
    }
    throw error
  }

  const objectById = new Map([[object.id, object]])
  const customerById = new Map(targetEmployees.map(employee => [employee.id, employee]))
  const itemsByTaskId = buildItemsMap(createdItems)

  const representative = createdLists[0]
  if (!representative) {
    throw createError({
      statusCode: 500,
      message: 'Failed to create task list.'
    })
  }
  const representativeItems = itemsByTaskId.get(representative.id) || []
  const task = buildTaskRecord(representative, representativeItems, objectById, customerById)

  if (!requestedEmployeeId) {
    return {
      ...task,
      employeeId: null,
      employeeName: 'Все сотрудники',
      employeeUsername: undefined,
      employeePhone: undefined,
      employeeStatus: undefined
    }
  }

  return task
}

export async function listEmployeeObjectTasks(employeeId: number, objectIds: number[] = [], status?: ObjectTaskStatus) {
  const normalizedEmployeeId = parsePositiveInteger(employeeId, 'employeeId')
  const normalizedObjectIds = Array.from(new Set(objectIds
    .map(value => typeof value === 'number' ? value : Number(value))
    .filter((value): value is number => Number.isInteger(value) && value > 0)))

  const [taskLists, customers] = await Promise.all([
    fetchTaskLists({
      employeeIds: [normalizedEmployeeId],
      objectIds: normalizedObjectIds.length ? normalizedObjectIds : undefined,
      status
    }),
    fetchCustomers({ customerIds: [normalizedEmployeeId] })
  ])

  if (!taskLists.length) {
    return []
  }

  const taskItems = await fetchTaskItems(taskLists.map(task => task.id))
  const referencedObjectIds = Array.from(new Set(taskLists
    .map(task => task.object_id)
    .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0)))
  const objects = referencedObjectIds.length ? await fetchObjects({ objectIds: referencedObjectIds }) : []

  const objectById = new Map(objects.map(object => [object.id, object]))
  const customerById = new Map(customers.map(customer => [customer.id, customer]))
  const itemsByTaskId = buildItemsMap(taskItems)

  return sortTasks(taskLists.map(row => buildTaskRecord(row, itemsByTaskId.get(row.id) || [], objectById, customerById)))
}

export async function listEmployeeObjectTasksByObject(
  employeeId: number,
  objectId: number,
  status?: ObjectTaskStatus
) {
  const normalizedEmployeeId = parsePositiveInteger(employeeId, 'employeeId')
  const normalizedObjectId = parsePositiveInteger(objectId, 'objectId')

  const [taskLists, customers, objects] = await Promise.all([
    fetchTaskLists({ objectIds: [normalizedObjectId], employeeIds: [normalizedEmployeeId], status }),
    fetchCustomers({ customerIds: [normalizedEmployeeId] }),
    fetchObjects({ objectIds: [normalizedObjectId] })
  ])

  if (!objects.length) {
    throw createError({
      statusCode: 404,
      message: 'Object not found.'
    })
  }

  if (!taskLists.length) {
    return []
  }

  const taskItems = await fetchTaskItems(taskLists.map(task => task.id))
  const objectById = new Map(objects.map(object => [object.id, object]))
  const customerById = new Map(customers.map(customer => [customer.id, customer]))
  const itemsByTaskId = buildItemsMap(taskItems)

  return sortTasks(taskLists.map(row => buildTaskRecord(row, itemsByTaskId.get(row.id) || [], objectById, customerById)))
}

export async function listScopedObjectTasks(objectIds: number[] = [], status?: ObjectTaskStatus) {
  const normalizedObjectIds = Array.from(new Set(objectIds
    .map(value => typeof value === 'number' ? value : Number(value))
    .filter((value): value is number => Number.isInteger(value) && value > 0)))

  if (!normalizedObjectIds.length) {
    return []
  }

  const taskLists = await fetchTaskLists({
    objectIds: normalizedObjectIds,
    status
  })

  if (!taskLists.length) {
    return []
  }

  const taskItems = await fetchTaskItems(taskLists.map(task => task.id))
  const employeeIds = Array.from(new Set(taskLists
    .map(task => task.employee_id)
    .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0)))

  const [objects, customers] = await Promise.all([
    fetchObjects({ objectIds: normalizedObjectIds }),
    employeeIds.length ? fetchCustomers({ customerIds: employeeIds }) : Promise.resolve([])
  ])

  const objectById = new Map(objects.map(object => [object.id, object]))
  const customerById = new Map(customers.map(customer => [customer.id, customer]))
  const itemsByTaskId = buildItemsMap(taskItems)

  return sortTasks(taskLists.map(row => buildTaskRecord(row, itemsByTaskId.get(row.id) || [], objectById, customerById)))
}

export async function listScopedObjectTasksByObject(objectId: number, status?: ObjectTaskStatus) {
  const normalizedObjectId = parsePositiveInteger(objectId, 'objectId')

  return await listScopedObjectTasks([normalizedObjectId], status)
}

export async function listReviewerObjectTasks(
  reviewerId: number,
  objectIds: number[],
  reviewStatus: ObjectTaskReviewStatus = 'pending'
) {
  const normalizedReviewerId = parsePositiveInteger(reviewerId, 'reviewerId')
  const normalizedObjectIds = Array.from(new Set(objectIds
    .map(value => typeof value === 'number' ? value : Number(value))
    .filter((value): value is number => Number.isInteger(value) && value > 0)))

  if (!normalizedObjectIds.length) {
    return []
  }

  const status = reviewStatus === 'pending' || reviewStatus === 'approved' || reviewStatus === 'none'
    ? 'completed'
    : undefined

  const taskLists = await fetchTaskLists({
    objectIds: normalizedObjectIds,
    status,
    reviewStatus
  })

  let legacyCompletedLists: ObjectTaskListDbRow[] = []
  if (reviewStatus === 'pending') {
    legacyCompletedLists = await fetchTaskLists({
      objectIds: normalizedObjectIds,
      status: 'completed',
      reviewStatus: 'none'
    })
  }

  const combinedLists = legacyCompletedLists.length
    ? Array.from(new Map([...taskLists, ...legacyCompletedLists].map(row => [row.id, row])).values())
    : taskLists

  const visibleTaskLists = combinedLists.filter((task) => {
    if (typeof task.reviewer_id !== 'number' || !Number.isInteger(task.reviewer_id) || task.reviewer_id <= 0) {
      return true
    }

    return task.reviewer_id === normalizedReviewerId
  })

  const taskItems = await fetchTaskItems(visibleTaskLists.map(task => task.id))
  const employeeIds = Array.from(new Set(visibleTaskLists
    .map(task => task.employee_id)
    .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0)))
  const taskObjectIds = Array.from(new Set(visibleTaskLists
    .map(task => task.object_id)
    .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0)))

  const [objects, customers] = await Promise.all([
    taskObjectIds.length ? fetchObjects({ objectIds: taskObjectIds }) : Promise.resolve([]),
    employeeIds.length ? fetchCustomers({ customerIds: employeeIds }) : Promise.resolve([])
  ])

  const objectById = new Map(objects.map(object => [object.id, object]))
  const customerById = new Map(customers.map(customer => [customer.id, customer]))
  const itemsByTaskId = buildItemsMap(taskItems)

  const tasks = visibleTaskLists.map<ObjectTaskRecord>((row) => {
    const task = buildTaskRecord(row, itemsByTaskId.get(row.id) || [], objectById, customerById)

    if (reviewStatus === 'pending' && task.status === 'completed' && task.reviewStatus === 'none') {
      return {
        ...task,
        reviewStatus: 'pending',
        reviewRequestedAt: task.reviewRequestedAt || task.updatedAt || task.createdAt || null
      }
    }

    return task
  })

  return sortTasks(tasks)
}

export async function listReviewerObjectTasksByObject(
  reviewerId: number,
  objectId: number,
  reviewStatus: ObjectTaskReviewStatus = 'pending'
) {
  const normalizedReviewerId = parsePositiveInteger(reviewerId, 'reviewerId')
  const normalizedObjectId = parsePositiveInteger(objectId, 'objectId')
  const status = reviewStatus === 'pending' || reviewStatus === 'approved' || reviewStatus === 'none'
    ? 'completed'
    : undefined

  const taskLists = await fetchTaskLists({
    objectIds: [normalizedObjectId],
    status,
    reviewStatus
  })

  let legacyCompletedLists: ObjectTaskListDbRow[] = []
  if (reviewStatus === 'pending') {
    legacyCompletedLists = await fetchTaskLists({
      objectIds: [normalizedObjectId],
      status: 'completed',
      reviewStatus: 'none'
    })
  }

  const combinedLists = legacyCompletedLists.length
    ? Array.from(new Map([...taskLists, ...legacyCompletedLists].map(row => [row.id, row])).values())
    : taskLists

  const visibleTaskLists = combinedLists.filter((task) => {
    if (typeof task.reviewer_id !== 'number' || !Number.isInteger(task.reviewer_id) || task.reviewer_id <= 0) {
      return true
    }

    return task.reviewer_id === normalizedReviewerId
  })

  const taskItems = await fetchTaskItems(visibleTaskLists.map(task => task.id))
  const employeeIds = Array.from(new Set(visibleTaskLists
    .map(task => task.employee_id)
    .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0)))
  const objects = await fetchObjects({ objectIds: [normalizedObjectId] })

  if (!objects.length) {
    throw createError({
      statusCode: 404,
      message: 'Object not found.'
    })
  }

  const customers = employeeIds.length ? await fetchCustomers({ customerIds: employeeIds }) : []
  const objectById = new Map(objects.map(object => [object.id, object]))
  const customerById = new Map(customers.map(customer => [customer.id, customer]))
  const itemsByTaskId = buildItemsMap(taskItems)

  const tasks = visibleTaskLists.map<ObjectTaskRecord>((row) => {
    const task = buildTaskRecord(row, itemsByTaskId.get(row.id) || [], objectById, customerById)

    if (reviewStatus === 'pending' && task.status === 'completed' && task.reviewStatus === 'none') {
      return {
        ...task,
        reviewStatus: 'pending',
        reviewRequestedAt: task.reviewRequestedAt || task.updatedAt || task.createdAt || null
      }
    }

    return task
  })

  return sortTasks(tasks)
}

export async function getReviewerTaskById(reviewerId: number, taskId: number) {
  const normalizedReviewerId = parsePositiveInteger(reviewerId, 'reviewerId')
  const normalizedTaskId = parsePositiveInteger(taskId, 'taskId')

  const taskList = await fetchTaskListById(normalizedTaskId)
  if (!taskList) {
    throw createError({
      statusCode: 404,
      message: 'Task not found.'
    })
  }

  if (
    typeof taskList.reviewer_id === 'number'
    && Number.isInteger(taskList.reviewer_id)
    && taskList.reviewer_id > 0
    && taskList.reviewer_id !== normalizedReviewerId
  ) {
    throw createError({
      statusCode: 403,
      message: 'Task review access denied.'
    })
  }

  const [taskItems, objects, customers] = await Promise.all([
    fetchTaskItems([normalizedTaskId]),
    Number(taskList.object_id) > 0
      ? fetchObjects({ objectIds: [Number(taskList.object_id)] })
      : Promise.resolve([]),
    Number(taskList.employee_id) > 0
      ? fetchCustomers({ customerIds: [Number(taskList.employee_id)] })
      : Promise.resolve([])
  ])

  const objectById = new Map(objects.map(object => [object.id, object]))
  const customerById = new Map(customers.map(customer => [customer.id, customer]))
  const items = taskItems.map(mapTaskItemRow)

  const task = buildTaskRecord(taskList, items, objectById, customerById)

  if (task.reviewStatus === 'none') {
    if (task.status !== 'completed') {
      throw createError({
        statusCode: 404,
        message: 'Task not found.'
      })
    }

    return {
      ...task,
      reviewStatus: 'pending',
      reviewRequestedAt: task.reviewRequestedAt || task.updatedAt || task.createdAt || null
    }
  }

  return task
}

async function fetchTaskListById(taskId: number) {
  const rows = await fetchTaskLists({ listIds: [taskId] })
  return rows[0] || null
}

async function fetchTaskItem(taskId: number, itemId: number) {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const rows = await fetchRowsOrEmpty<ObjectTaskItemDbRow>(() => $fetch<ObjectTaskItemDbRow[]>(`${url}/rest/v1/object_task_items`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query: {
      select: 'id,task_list_id,title,is_done,completed_at,proof_photo_path,sort_order,created_at,updated_at',
      id: `eq.${itemId}`,
      task_list_id: `eq.${taskId}`,
      limit: '1'
    }
  }))

  return rows[0] || null
}

export async function updateObjectTaskItemCompletion(input: UpdateObjectTaskItemCompletionInput) {
  const taskId = parsePositiveInteger(input.taskId, 'taskId')
  const itemId = parsePositiveInteger(input.itemId, 'itemId')
  const employeeId = parsePositiveInteger(input.employeeId, 'employeeId')

  const taskList = await fetchTaskListById(taskId)
  if (!taskList) {
    throw createError({
      statusCode: 404,
      message: 'Task list not found.'
    })
  }

  // Tasks are shared per object: any employee with access to the task's object
  // may complete its items (the mobile task list is object-scoped as well), not
  // only the originally-assigned employee.
  const taskObjectId = Number(taskList.object_id)
  if (input.allowedObjectIds && !input.allowedObjectIds.includes(taskObjectId)) {
    throw createError({
      statusCode: 403,
      message: 'Task item access denied.'
    })
  }

  // Only an approved task is final/locked. A task still pending review may keep
  // receiving item edits (re-uploaded photos, idempotent re-submits) — locking it
  // there wrongly rejected the employee's follow-up updates with a 409.
  const reviewStatus = normalizeReviewStatus(taskList.review_status)
  if (reviewStatus === 'approved') {
    throw createError({
      statusCode: 409,
      message: 'Task is already approved and locked.'
    })
  }

  const existingItem = await fetchTaskItem(taskId, itemId)
  if (!existingItem) {
    throw createError({
      statusCode: 404,
      message: 'Task item not found.'
    })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)
  const now = new Date().toISOString()

  const existingPaths = (() => {
    try {
      const parsed = existingItem.proof_photo_path ? JSON.parse(existingItem.proof_photo_path) : []
      if (Array.isArray(parsed)) return parsed.filter((p: unknown) => typeof p === 'string' && p.trim().length > 0)
      if (typeof parsed === 'string' && parsed.trim()) return [parsed.trim()]
      return []
    } catch {
      return existingItem.proof_photo_path ? [existingItem.proof_photo_path] : []
    }
  })()

  const isCompleting = input.done === true && existingItem.is_done !== true
  if (isCompleting && (!input.photoFiles || !input.photoFiles.length) && !existingPaths.length) {
    throw createError({
      statusCode: 400,
      message: 'Photo is required to complete this item.'
    })
  }

  const proofPhotoPaths = [...existingPaths]

  if (input.photoFiles?.length) {
    const { taskPhotoBucket } = getDataApiServerConfig()
    await ensureStorageBucket({
      url,
      serviceRoleKey,
      bucket: taskPhotoBucket,
      isPublic: true
    })

    for (const file of input.photoFiles) {
      const safeName = sanitizeFileName(file.filename || 'task-proof')
      const uniqueId = `${taskId}-${itemId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const proofPath = `${employeeId}/tasks/${uniqueId}-${safeName}`

      await uploadStorageObject({
        url,
        serviceRoleKey,
        bucket: taskPhotoBucket,
        path: proofPath,
        data: file.data,
        contentType: file.type || 'application/octet-stream'
      })

      proofPhotoPaths.push(proofPath)
    }
  }

  const [updatedItem] = await $fetch<ObjectTaskItemDbRow[]>(`${url}/rest/v1/object_task_items`, {
    method: 'PATCH',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    query: {
      id: `eq.${itemId}`,
      task_list_id: `eq.${taskId}`
    },
    body: {
      is_done: input.done,
      completed_at: input.done ? now : null,
      updated_at: now,
      proof_photo_path: proofPhotoPaths.length ? JSON.stringify(proofPhotoPaths) : null
    }
  })

  if (!updatedItem) {
    throw createError({
      statusCode: 500,
      message: 'Failed to update task item.'
    })
  }

  const allItems = await fetchTaskItems([taskId])
  const mappedItems = allItems.map(mapTaskItemRow)
  const nextStatus = deriveTaskStatus(mappedItems)

  const previousStatus = isObjectTaskStatus(taskList.status) ? taskList.status : 'open'
  const isNewCompletion = nextStatus === 'completed' && previousStatus !== 'completed'
  const taskListPatch: Record<string, unknown> = {
    status: nextStatus,
    updated_at: now
  }

  if (isNewCompletion) {
    taskListPatch.review_status = 'pending'
    taskListPatch.review_requested_at = now
    taskListPatch.reviewed_at = null
    taskListPatch.review_comment = null
  } else if (nextStatus !== 'completed' && reviewStatus === 'pending') {
    // Task dropped back below 100% while awaiting review — clear the stale pending
    // flag so it leaves the manager's review queue until it is completed again.
    taskListPatch.review_status = 'none'
    taskListPatch.review_requested_at = null
  }

  const [updatedTaskList] = await $fetch<ObjectTaskListDbRow[]>(`${url}/rest/v1/object_task_lists`, {
    method: 'PATCH',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    query: {
      id: `eq.${taskId}`
    },
    body: taskListPatch
  })

  const [objects, customers] = await Promise.all([
    Number(taskList.object_id) > 0 ? fetchObjects({ objectIds: [Number(taskList.object_id)] }) : Promise.resolve([]),
    fetchCustomers({ customerIds: [employeeId] })
  ])

  const objectById = new Map(objects.map(object => [object.id, object]))
  const customerById = new Map(customers.map(customer => [customer.id, customer]))

  return buildTaskRecord(updatedTaskList || taskList, mappedItems, objectById, customerById)
}

export async function getEmployeeTaskById(employeeId: number, taskId: number) {
  const normalizedEmployeeId = parsePositiveInteger(employeeId, 'employeeId')
  const normalizedTaskId = parsePositiveInteger(taskId, 'taskId')

  const taskList = await fetchTaskListById(normalizedTaskId)
  if (!taskList) {
    throw createError({
      statusCode: 404,
      message: 'Task not found.'
    })
  }

  const [taskItems, objects, customers] = await Promise.all([
    fetchTaskItems([normalizedTaskId]),
    Number(taskList.object_id) > 0
      ? fetchObjects({ objectIds: [Number(taskList.object_id)] })
      : Promise.resolve([]),
    fetchCustomers({ customerIds: [normalizedEmployeeId] })
  ])

  if (Number(taskList.employee_id) !== normalizedEmployeeId) {
    throw createError({
      statusCode: 403,
      message: 'Task access denied.'
    })
  }

  const objectById = new Map(objects.map(object => [object.id, object]))
  const customerById = new Map(customers.map(customer => [customer.id, customer]))
  const items = taskItems.map(mapTaskItemRow)

  return buildTaskRecord(taskList, items, objectById, customerById)
}

export async function getObjectScopedTaskById(taskId: number) {
  const normalizedTaskId = parsePositiveInteger(taskId, 'taskId')

  const taskList = await fetchTaskListById(normalizedTaskId)
  if (!taskList) {
    throw createError({
      statusCode: 404,
      message: 'Task not found.'
    })
  }

  const [taskItems, objects, customers] = await Promise.all([
    fetchTaskItems([normalizedTaskId]),
    Number(taskList.object_id) > 0
      ? fetchObjects({ objectIds: [Number(taskList.object_id)] })
      : Promise.resolve([]),
    Number(taskList.employee_id) > 0
      ? fetchCustomers({ customerIds: [Number(taskList.employee_id)] })
      : Promise.resolve([])
  ])

  const objectById = new Map(objects.map(object => [object.id, object]))
  const customerById = new Map(customers.map(customer => [customer.id, customer]))
  const items = taskItems.map(mapTaskItemRow)

  return buildTaskRecord(taskList, items, objectById, customerById)
}

type ObjectTaskReviewDecision = 'approved' | 'rejected'

function isReviewDecision(value: unknown): value is ObjectTaskReviewDecision {
  return value === 'approved' || value === 'rejected'
}

export async function reviewObjectTaskList(input: {
  taskId: number
  reviewerId: number
  decision: ObjectTaskReviewDecision
  comment?: string | null
  photoFiles?: {
    filename?: string
    type?: string
    data: Uint8Array
  }[]
}) {
  const taskId = parsePositiveInteger(input.taskId, 'taskId')
  const reviewerId = parsePositiveInteger(input.reviewerId, 'reviewerId')

  if (!isReviewDecision(input.decision)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid review decision.'
    })
  }

  const comment = typeof input.comment === 'string' ? input.comment.trim() : null
  if (input.decision === 'rejected' && !comment) {
    throw createError({
      statusCode: 400,
      message: 'comment is required to reject a task.'
    })
  }

  const taskList = await fetchTaskListById(taskId)
  if (!taskList) {
    throw createError({
      statusCode: 404,
      message: 'Task not found.'
    })
  }

  const reviewStatus = normalizeReviewStatus(taskList.review_status)
  if (reviewStatus !== 'pending' && reviewStatus !== 'none') {
    throw createError({
      statusCode: 409,
      message: 'Task is not pending review.'
    })
  }

  const existingReviewPhotoPaths = (() => {
    try {
      const raw = taskList.review_photo_path
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter((p: unknown) => typeof p === 'string' && p.trim().length > 0)
      if (typeof parsed === 'string' && parsed.trim()) return [parsed.trim()]
      return []
    } catch {
      return taskList.review_photo_path ? [taskList.review_photo_path] : []
    }
  })()

  if (input.decision === 'approved' && (!input.photoFiles || !input.photoFiles.length) && !existingReviewPhotoPaths.length) {
    throw createError({
      statusCode: 400,
      message: 'Photo is required to approve a task.'
    })
  }

  if (
    typeof taskList.reviewer_id === 'number'
    && Number.isInteger(taskList.reviewer_id)
    && taskList.reviewer_id > 0
    && taskList.reviewer_id !== reviewerId
  ) {
    throw createError({
      statusCode: 403,
      message: 'Task review access denied.'
    })
  }

  const existingItems = await fetchTaskItems([taskId])
  const mappedItems = existingItems.map(mapTaskItemRow)
  const derivedStatus = deriveTaskStatus(mappedItems)

  if (derivedStatus !== 'completed') {
    throw createError({
      statusCode: 409,
      message: 'Task is not completed yet.'
    })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)
  const now = new Date().toISOString()

  const reviewPhotoPaths = [...existingReviewPhotoPaths]

  if (input.decision === 'approved' && input.photoFiles?.length) {
    const { taskPhotoBucket } = getDataApiServerConfig()
    await ensureStorageBucket({
      url,
      serviceRoleKey,
      bucket: taskPhotoBucket,
      isPublic: true
    })

    for (const file of input.photoFiles) {
      const safeName = sanitizeFileName(file.filename || 'task-review')
      const uniqueId = `${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const proofPath = `${reviewerId}/task-reviews/${uniqueId}-${safeName}`

      await uploadStorageObject({
        url,
        serviceRoleKey,
        bucket: taskPhotoBucket,
        path: proofPath,
        data: file.data,
        contentType: file.type || 'application/octet-stream'
      })

      reviewPhotoPaths.push(proofPath)
    }
  }

  if (input.decision === 'rejected') {
    await $fetch(`${url}/rest/v1/object_task_items`, {
      method: 'PATCH',
      headers,
      query: {
        task_list_id: `eq.${taskId}`
      },
      body: {
        is_done: false,
        completed_at: null,
        proof_photo_path: null,
        updated_at: now
      }
    })
  }

  const patchBody: Record<string, unknown> = {
    review_status: input.decision,
    reviewer_id: reviewerId,
    reviewed_at: now,
    review_comment: comment,
    review_photo_path: reviewPhotoPaths.length ? JSON.stringify(reviewPhotoPaths) : null,
    updated_at: now
  }

  if (reviewStatus === 'none' && !taskList.review_requested_at) {
    patchBody.review_requested_at = now
  }

  if (input.decision === 'rejected') {
    patchBody.status = 'open'
    patchBody.review_photo_path = null
  }

  const [updatedTaskList] = await $fetch<ObjectTaskListDbRow[]>(`${url}/rest/v1/object_task_lists`, {
    method: 'PATCH',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    query: {
      id: `eq.${taskId}`
    },
    body: patchBody
  })

  const refreshedItems = input.decision === 'rejected'
    ? (await fetchTaskItems([taskId])).map(mapTaskItemRow)
    : mappedItems

  const [objects, customers] = await Promise.all([
    Number(taskList.object_id) > 0
      ? fetchObjects({ objectIds: [Number(taskList.object_id)] })
      : Promise.resolve([]),
    Number(taskList.employee_id) > 0
      ? fetchCustomers({ customerIds: [Number(taskList.employee_id)] })
      : Promise.resolve([])
  ])

  const objectById = new Map(objects.map(object => [object.id, object]))
  const customerById = new Map(customers.map(customer => [customer.id, customer]))

  return buildTaskRecord(updatedTaskList || taskList, refreshedItems, objectById, customerById)
}
