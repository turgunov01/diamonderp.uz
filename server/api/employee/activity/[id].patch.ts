import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import type { EmployeeActivityLocation, EmployeeActivityRecord, EmployeeActivityStatus } from '../../../utils/employee-activity'
import type { H3Event } from 'h3'

interface EmployeeActivityDbRow {
  id: number
  employee_id: number | null
  employee_name: string | null
  activity_date: string
  status: EmployeeActivityStatus
  work_minutes: number | null
  late_minutes: number | null
  started_at?: string | null
  finished_at?: string | null
  started_location?: EmployeeActivityLocation | null
  finished_location?: EmployeeActivityLocation | null
}

interface ActivityCustomerRow {
  id: number
  username: string
}

interface UpdateEmployeeActivityBody {
  date?: string
  status?: EmployeeActivityStatus
  workMinutes?: number
  lateMinutes?: number
}

function parseActivityId(event: H3Event) {
  const rawId = getRouterParam(event, 'id')
  const activityId = Number(rawId)

  if (!rawId || !Number.isInteger(activityId) || activityId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Некорректный идентификатор активности.'
    })
  }

  return activityId
}

function isStatus(value: unknown): value is EmployeeActivityStatus {
  return value === 'on_time' || value === 'late' || value === 'absent'
}

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Поле date должно быть в формате YYYY-MM-DD.'
    })
  }

  return value.trim()
}

function parseMinutes(value: unknown, fieldName: string) {
  const amount = typeof value === 'number' ? value : Number(value)

  if (!Number.isInteger(amount) || amount < 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `Поле ${fieldName} должно быть целым числом не меньше 0.`
    })
  }

  return amount
}

function parseUpdateBody(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Тело запроса должно быть корректным JSON-объектом.'
    })
  }

  const input = body as Record<string, unknown>
  const nextBody: UpdateEmployeeActivityBody = {}

  if (input.date !== undefined) {
    nextBody.date = parseDate(input.date)
  }

  if (input.status !== undefined) {
    if (!isStatus(input.status)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Поле status должно быть on_time, late или absent.'
      })
    }

    nextBody.status = input.status
  }

  if (input.workMinutes !== undefined) {
    nextBody.workMinutes = parseMinutes(input.workMinutes, 'workMinutes')
  }

  if (input.lateMinutes !== undefined) {
    nextBody.lateMinutes = parseMinutes(input.lateMinutes, 'lateMinutes')
  }

  if (!Object.keys(nextBody).length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Нужно передать хотя бы одно поле для обновления.'
    })
  }

  return nextBody
}

function buildPatchBody(body: UpdateEmployeeActivityBody) {
  const nextStatus = body.status
  let workMinutes = body.workMinutes
  let lateMinutes = body.lateMinutes

  if (nextStatus === 'on_time') {
    lateMinutes = 0
  }

  if (nextStatus === 'absent') {
    workMinutes = 0
    lateMinutes = 0
  }

  return {
    ...(body.date !== undefined ? { activity_date: body.date } : {}),
    ...(nextStatus !== undefined ? { status: nextStatus } : {}),
    ...(workMinutes !== undefined ? { work_minutes: workMinutes } : {}),
    ...(lateMinutes !== undefined ? { late_minutes: lateMinutes } : {})
  }
}

async function fetchCustomer(employeeId: number | null) {
  if (!employeeId) {
    return undefined
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const rows = await $fetch<ActivityCustomerRow[]>(`${url}/rest/v1/customers`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query: {
      select: 'id,username',
      id: `eq.${employeeId}`
    }
  })

  return rows[0]
}

function mapDbRowToRecord(row: EmployeeActivityDbRow, customer?: ActivityCustomerRow): EmployeeActivityRecord {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: customer?.username?.trim() || row.employee_name?.trim() || `Сотрудник #${row.employee_id ?? row.id}`,
    date: row.activity_date,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    startedLocation: row.started_location ?? null,
    finishedLocation: row.finished_location ?? null,
    status: row.status,
    workMinutes: row.work_minutes ?? 0,
    lateMinutes: row.late_minutes ?? 0
  }
}

export default eventHandler(async (event) => {
  const activityId = parseActivityId(event)
  const updateBody = parseUpdateBody(await readBody(event))
  const { url, serviceRoleKey } = getDataApiServerConfig()

  const rows = await $fetch<EmployeeActivityDbRow[]>(`${url}/rest/v1/employee_activity`, {
    method: 'PATCH',
    headers: {
      ...getDataApiServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    query: {
      id: `eq.${activityId}`
    },
    body: buildPatchBody(updateBody)
  })

  const updatedRow = rows[0]
  if (!updatedRow) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Запись активности не найдена.'
    })
  }

  const customer = await fetchCustomer(updatedRow.employee_id)
  return mapDbRowToRecord(updatedRow, customer)
})
