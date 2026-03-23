import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import type { EmployeeActivityRecord, EmployeeActivityStatus } from '../../utils/employee-activity'

interface EmployeeActivityDbRow {
  id: number
  employee_id: number | null
  employee_name: string | null
  activity_date: string
  status: EmployeeActivityStatus
  work_minutes: number | null
  late_minutes: number | null
}

interface ActivityCustomerRow {
  id: number
  username: string
  object_pinned: string | null
}

interface CreateEmployeeActivityBody {
  employeeId?: number
  customerId?: number
  recordedAt?: string
}

function parseEmployeeId(body: CreateEmployeeActivityBody) {
  const rawEmployeeId = body.employeeId ?? body.customerId
  const employeeId = typeof rawEmployeeId === 'number' ? rawEmployeeId : Number(rawEmployeeId)

  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Поле employeeId должно быть положительным целым числом.'
    })
  }

  return employeeId
}

function parseRecordedAt(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return new Date()
  }

  if (typeof value !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Поле recordedAt должно быть строкой в ISO-формате.'
    })
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Поле recordedAt содержит некорректную дату.'
    })
  }

  return date
}

function formatDateInTashkent(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value)

  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Не удалось определить дату активности.'
    })
  }

  return `${year}-${month}-${day}`
}

function mapDbRowToRecord(row: EmployeeActivityDbRow, customer?: ActivityCustomerRow): EmployeeActivityRecord {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: customer?.username?.trim() || row.employee_name?.trim() || `Сотрудник #${row.employee_id ?? row.id}`,
    date: row.activity_date,
    status: row.status,
    workMinutes: row.work_minutes ?? 0,
    lateMinutes: row.late_minutes ?? 0
  }
}

async function fetchCustomer(employeeId: number) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const rows = await $fetch<ActivityCustomerRow[]>(`${url}/rest/v1/customers`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query: {
      select: 'id,username,object_pinned',
      id: `eq.${employeeId}`
    }
  })

  const customer = rows[0]

  if (!customer) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Сотрудник не найден.'
    })
  }

  if (!customer.object_pinned?.trim()) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Сотрудник отключен и не может зафиксировать активность.'
    })
  }

  return customer
}

async function fetchExistingActivity(employeeId: number, activityDate: string) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const rows = await $fetch<EmployeeActivityDbRow[]>(`${url}/rest/v1/employee_activity`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query: {
      select: 'id,employee_id,employee_name,activity_date,status,work_minutes,late_minutes',
      employee_id: `eq.${employeeId}`,
      activity_date: `eq.${activityDate}`,
      limit: '1'
    }
  })

  return rows[0]
}

async function createActivity(employeeId: number, employeeName: string, activityDate: string) {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const rows = await $fetch<EmployeeActivityDbRow[]>(`${url}/rest/v1/employee_activity`, {
    method: 'POST',
    headers: {
      ...getSupabaseServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    body: {
      employee_id: employeeId,
      employee_name: employeeName,
      activity_date: activityDate,
      status: 'on_time',
      work_minutes: 0,
      late_minutes: 0
    }
  })

  const createdActivity = rows[0]

  if (!createdActivity) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Не удалось создать запись активности.'
    })
  }

  return createdActivity
}

export default eventHandler(async (event) => {
  const body = await readBody<CreateEmployeeActivityBody>(event)
  const employeeId = parseEmployeeId(body || {})
  const recordedAt = parseRecordedAt(body?.recordedAt)
  const activityDate = formatDateInTashkent(recordedAt)
  const customer = await fetchCustomer(employeeId)

  const existingActivity = await fetchExistingActivity(employeeId, activityDate)

  if (existingActivity) {
    return {
      created: false,
      recordedAt: recordedAt.toISOString(),
      activity: mapDbRowToRecord(existingActivity, customer)
    }
  }

  let createdActivity: EmployeeActivityDbRow

  try {
    createdActivity = await createActivity(employeeId, customer.username, activityDate)
  } catch (error) {
    const duplicateActivity = await fetchExistingActivity(employeeId, activityDate)

    if (duplicateActivity) {
      return {
        created: false,
        recordedAt: recordedAt.toISOString(),
        activity: mapDbRowToRecord(duplicateActivity, customer)
      }
    }

    throw error
  }

  return {
    created: true,
    recordedAt: recordedAt.toISOString(),
    activity: mapDbRowToRecord(createdActivity, customer)
  }
})
