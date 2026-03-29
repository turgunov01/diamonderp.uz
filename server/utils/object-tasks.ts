import type { H3Event } from 'h3'
import type { AuthRole, AuthSession } from '~~/shared/types/auth'
import { getSupabaseServerConfig, getSupabaseServerHeaders } from './supabase'

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
  title: string
  note?: string | null
  due_date?: string | null
  status?: string | null
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
  sort_order?: number | null
  created_at?: string | null
  updated_at?: string | null
}

export type ObjectTaskStatus = 'open' | 'in_progress' | 'completed'

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
  status?: ObjectTaskStatus
}

interface CreateObjectTaskListInput {
  objectId: number | string
  employeeId: number | string
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
  done: boolean
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
      statusMessage: 'dueDate must use YYYY-MM-DD format.'
    })
  }

  return normalized
}

function parsePositiveInteger(value: unknown, field: string) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `${field} must be a positive integer.`
    })
  }

  return parsed
}

function getSupabaseErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const data = (error as { data?: { code?: string } }).data
  return typeof data?.code === 'string' ? data.code : undefined
}

function isMissingTableError(error: unknown) {
  return getSupabaseErrorCode(error) === '42P01'
}

async function fetchRowsOrEmpty<T>(request: () => Promise<T[]>) {
  try {
    return await request()
  } catch (error: unknown) {
    if (isMissingTableError(error)) {
      return []
    }

    throw error
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

export function requireTaskManagerSession(event: H3Event) {
  const session = readSessionCookie(event)
  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Session is required.'
    })
  }

  if (!TASK_MANAGER_ROLES.includes(session.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Task management access denied.'
    })
  }

  return session
}

function mapObjectRow(row: TaskObjectRow) {
  return {
    id: row.id,
    buildingId: row.building_id ?? null,
    name: row.name,
    description: row.description || undefined,
    address: row.address || undefined,
    code: row.code || undefined,
    isActive: row.is_active !== false
  }
}

function mapEmployeeRow(row: TaskCustomerRow): ObjectTaskEmployeeRecord {
  return {
    id: row.id,
    name: normalizeDisplayName(row) || `Employee #${row.id}`,
    username: row.username,
    phone: row.phone_number || undefined,
    workShift: row.work_shift || undefined,
    status: row.status || 'active'
  }
}

function mapTaskItemRow(row: ObjectTaskItemDbRow): ObjectTaskItemRecord {
  return {
    id: row.id,
    taskListId: row.task_list_id,
    title: row.title,
    isDone: row.is_done === true,
    completedAt: row.completed_at || null,
    sortOrder: row.sort_order ?? 0
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

  if (role !== 'customer') {
    return false
  }

  if (status === 'archived' || status === 'inactive') {
    return false
  }

  return isEmployeeAssignedToObject(customer, objectName)
}

async function fetchObjects(options: FetchObjectOptions = {}) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
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

  const rows = await $fetch<TaskObjectRow[]>(`${url}/rest/v1/objects`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query
  })

  return rows.map(mapObjectRow)
}

async function fetchCustomers(options: FetchCustomerOptions = {}) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const query: Record<string, string> = {
    select: 'id,building_id,full_name,username,phone_number,work_shift,status,role,object_pinned,object_positions',
    order: 'full_name.asc'
  }

  if (options.customerIds?.length) {
    query.id = `in.(${options.customerIds.join(',')})`
  } else if (Number.isInteger(options.buildingId) && (options.buildingId ?? 0) > 0) {
    query.or = `(building_id.eq.${options.buildingId},building_id.is.null)`
  }

  return await $fetch<TaskCustomerRow[]>(`${url}/rest/v1/customers`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query
  })
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

  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const query: Record<string, string> = {
    select: 'id,object_id,employee_id,title,note,due_date,status,created_by_id,created_by_name,created_by_role,created_at,updated_at',
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

  if (options.status) {
    query.status = `eq.${options.status}`
  }

  return await fetchRowsOrEmpty<ObjectTaskListDbRow>(() => $fetch<ObjectTaskListDbRow[]>(`${url}/rest/v1/object_task_lists`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query
  }))
}

async function fetchTaskItems(taskListIds: number[]) {
  if (!taskListIds.length) {
    return []
  }

  const { url, serviceRoleKey } = getSupabaseServerConfig()

  return await fetchRowsOrEmpty<ObjectTaskItemDbRow>(() => $fetch<ObjectTaskItemDbRow[]>(`${url}/rest/v1/object_task_items`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query: {
      select: 'id,task_list_id,title,is_done,completed_at,sort_order,created_at,updated_at',
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
  const object = typeof row.object_id === 'number' ? objectById.get(row.object_id) : undefined
  const employee = typeof row.employee_id === 'number' ? employeeById.get(row.employee_id) : undefined
  const completedItems = items.filter(item => item.isDone).length
  const totalItems = items.length
  const status = deriveTaskStatus(items)

  return {
    id: row.id,
    objectId: row.object_id ?? null,
    objectName: object?.name || `Object #${row.object_id ?? row.id}`,
    employeeId: row.employee_id ?? null,
    employeeName: normalizeDisplayName(employee) || `Employee #${row.employee_id ?? row.id}`,
    employeeUsername: employee?.username || undefined,
    employeePhone: employee?.phone_number || undefined,
    employeeStatus: employee?.status || undefined,
    title: row.title,
    note: row.note || null,
    dueDate: row.due_date || null,
    status,
    createdById: row.created_by_id ?? null,
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
    const next = map.get(row.task_list_id) || []
    next.push(mapTaskItemRow(row))
    map.set(row.task_list_id, next)
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
    statusMessage: 'Invalid task status.'
  })
}

export async function buildObjectTaskOverview(buildingId?: number) : Promise<ObjectTaskOverview> {
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
  const taskRecords = sortTasks(taskLists.map(row => buildTaskRecord(row, itemsByTaskId.get(row.id) || [], objectById, customerById)))

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

async function deleteTaskList(taskListId: number) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()

  await $fetch(`${url}/rest/v1/object_task_lists`, {
    method: 'DELETE',
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query: {
      id: `eq.${taskListId}`
    }
  })
}

export async function createObjectTaskList(input: CreateObjectTaskListInput) {
  const objectId = parsePositiveInteger(input.objectId, 'objectId')
  const employeeId = parsePositiveInteger(input.employeeId, 'employeeId')
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null
  const dueDate = parseDueDate(input.dueDate)
  const itemTitles = Array.isArray(input.items)
    ? input.items.map(item => typeof item === 'string' ? item.trim() : '').filter(Boolean)
    : []

  if (!title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'title is required.'
    })
  }

  if (!itemTitles.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one todo item is required.'
    })
  }

  const [objects, customers] = await Promise.all([
    fetchObjects({ objectIds: [objectId] }),
    fetchCustomers({ customerIds: [employeeId] })
  ])

  const object = objects[0]
  const employee = customers[0]

  if (!object) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Object not found.'
    })
  }

  if (!employee) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Employee not found.'
    })
  }

  if (!isAssignableEmployee(employee, object.name)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Employee is not assigned to the selected object.'
    })
  }

  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)
  const now = new Date().toISOString()

  const [createdList] = await $fetch<ObjectTaskListDbRow[]>(`${url}/rest/v1/object_task_lists`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    body: {
      object_id: objectId,
      employee_id: employeeId,
      title,
      note,
      due_date: dueDate,
      status: 'open',
      created_by_id: input.creator?.id ?? null,
      created_by_name: input.creator?.name ?? null,
      created_by_role: input.creator?.role ?? null,
      updated_at: now
    }
  })

  if (!createdList) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create task list.'
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
      body: itemTitles.map((itemTitle, index) => ({
        task_list_id: createdList.id,
        title: itemTitle,
        sort_order: index,
        is_done: false,
        completed_at: null,
        updated_at: now
      }))
    })
  } catch (error: unknown) {
    await deleteTaskList(createdList.id).catch(() => undefined)
    throw error
  }

  const objectById = new Map([[object.id, object]])
  const customerById = new Map([[employee.id, employee]])
  return buildTaskRecord(createdList, createdItems.map(mapTaskItemRow), objectById, customerById)
}

export async function listEmployeeObjectTasks(employeeId: number, status?: ObjectTaskStatus) {
  const normalizedEmployeeId = parsePositiveInteger(employeeId, 'employeeId')
  const [taskLists, customers] = await Promise.all([
    fetchTaskLists({ employeeIds: [normalizedEmployeeId], status }),
    fetchCustomers({ customerIds: [normalizedEmployeeId] })
  ])
  const taskItems = await fetchTaskItems(taskLists.map(task => task.id))
  const objectIds = Array.from(new Set(taskLists
    .map(task => task.object_id)
    .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0)))
  const objects = objectIds.length ? await fetchObjects({ objectIds }) : []

  const objectById = new Map(objects.map(object => [object.id, object]))
  const customerById = new Map(customers.map(customer => [customer.id, customer]))
  const itemsByTaskId = buildItemsMap(taskItems)

  return sortTasks(taskLists.map(row => buildTaskRecord(row, itemsByTaskId.get(row.id) || [], objectById, customerById)))
}

async function fetchTaskListById(taskId: number) {
  const rows = await fetchTaskLists({ listIds: [taskId] })
  return rows[0] || null
}

async function fetchTaskItem(taskId: number, itemId: number) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const rows = await fetchRowsOrEmpty<ObjectTaskItemDbRow>(() => $fetch<ObjectTaskItemDbRow[]>(`${url}/rest/v1/object_task_items`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query: {
      select: 'id,task_list_id,title,is_done,completed_at,sort_order,created_at,updated_at',
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
      statusMessage: 'Task list not found.'
    })
  }

  if (taskList.employee_id !== employeeId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Task item access denied.'
    })
  }

  const existingItem = await fetchTaskItem(taskId, itemId)
  if (!existingItem) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Task item not found.'
    })
  }

  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)
  const now = new Date().toISOString()

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
      updated_at: now
    }
  })

  if (!updatedItem) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update task item.'
    })
  }

  const allItems = await fetchTaskItems([taskId])
  const mappedItems = allItems.map(mapTaskItemRow)
  const nextStatus = deriveTaskStatus(mappedItems)

  const [updatedTaskList] = await $fetch<ObjectTaskListDbRow[]>(`${url}/rest/v1/object_task_lists`, {
    method: 'PATCH',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    query: {
      id: `eq.${taskId}`
    },
    body: {
      status: nextStatus,
      updated_at: now
    }
  })

  const [objects, customers] = await Promise.all([
    typeof taskList.object_id === 'number' ? fetchObjects({ objectIds: [taskList.object_id] }) : Promise.resolve([]),
    fetchCustomers({ customerIds: [employeeId] })
  ])

  const objectById = new Map(objects.map(object => [object.id, object]))
  const customerById = new Map(customers.map(customer => [customer.id, customer]))

  return buildTaskRecord(updatedTaskList || taskList, mappedItems, objectById, customerById)
}

