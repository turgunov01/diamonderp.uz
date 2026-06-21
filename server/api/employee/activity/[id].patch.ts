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
      statusMessage: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ Р°РєС‚РёРІРЅРѕСЃС‚Рё.'
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
      statusMessage: 'РџРѕР»Рµ date РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РІ С„РѕСЂРјР°С‚Рµ YYYY-MM-DD.'
    })
  }

  return value.trim()
}

function parseMinutes(value: unknown, fieldName: string) {
  const amount = typeof value === 'number' ? value : Number(value)

  if (!Number.isInteger(amount) || amount < 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `РџРѕР»Рµ ${fieldName} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ С†РµР»С‹Рј С‡РёСЃР»РѕРј РЅРµ РјРµРЅСЊС€Рµ 0.`
    })
  }

  return amount
}

function parseUpdateBody(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw createError({
      statusCode: 400,
      statusMessage: 'РўРµР»Рѕ Р·Р°РїСЂРѕСЃР° РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РєРѕСЂСЂРµРєС‚РЅС‹Рј JSON-РѕР±СЉРµРєС‚РѕРј.'
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
        statusMessage: 'РџРѕР»Рµ status РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ on_time, late РёР»Рё absent.'
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
      statusMessage: 'РќСѓР¶РЅРѕ РїРµСЂРµРґР°С‚СЊ С…РѕС‚СЏ Р±С‹ РѕРґРЅРѕ РїРѕР»Рµ РґР»СЏ РѕР±РЅРѕРІР»РµРЅРёСЏ.'
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
    employeeName: customer?.username?.trim() || row.employee_name?.trim() || `РЎРѕС‚СЂСѓРґРЅРёРє #${row.employee_id ?? row.id}`,
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
      statusMessage: 'Р—Р°РїРёСЃСЊ Р°РєС‚РёРІРЅРѕСЃС‚Рё РЅРµ РЅР°Р№РґРµРЅР°.'
    })
  }

  const customer = await fetchCustomer(updatedRow.employee_id)
  return mapDbRowToRecord(updatedRow, customer)
})
