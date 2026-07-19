import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import { normalizeWorkScheduleType, type WorkScheduleType } from '~~/shared/utils/work-schedules'

interface Body {
  name: string
  buildingId?: number
  description?: string
  address?: string
  code?: string
  scheduleType?: WorkScheduleType
  schedule_type?: WorkScheduleType
}

interface ObjectRow {
  id: number
  building_id: number
  name: string
  description?: string | null
  address?: string | null
  code?: string | null
  schedule_type?: WorkScheduleType | string | null
}

function isMissingScheduleTypeColumn(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const payload = error as { data?: { code?: string, message?: string }, code?: string, message?: string }
  const code = payload.data?.code || payload.code
  const message = payload.data?.message || payload.message

  if (code !== 'PGRST204' && code !== '42703') {
    return false
  }

  return typeof message === 'string' && message.includes('schedule_type')
}

export default eventHandler(async (event) => {
  const body = await readBody<Body>(event)
  if (!body?.name?.trim()) {
    throw createError({ statusCode: 400, message: 'Название обязательно.' })
  }
  if (!body?.buildingId || body.buildingId <= 0) {
    throw createError({ statusCode: 400, message: 'buildingId обязателен.' })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const insertBody = {
    building_id: body.buildingId,
    name: body.name.trim(),
    description: body.description?.trim() || null,
    address: body.address?.trim() || null,
    code: body.code?.trim() || null,
    schedule_type: normalizeWorkScheduleType(body.scheduleType ?? body.schedule_type)
  }

  let rows: ObjectRow[]

  try {
    rows = await $fetch<ObjectRow[]>(`${url}/rest/v1/objects`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'return=representation'
      },
      body: insertBody
    })
  } catch (error) {
    if (!isMissingScheduleTypeColumn(error)) {
      throw error
    }

    const legacyInsertBody: Record<string, unknown> = { ...insertBody }
    delete legacyInsertBody.schedule_type
    rows = await $fetch<ObjectRow[]>(`${url}/rest/v1/objects`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'return=representation'
      },
      body: legacyInsertBody
    })
  }

  const [created] = rows

  if (!created) {
    throw createError({ statusCode: 500, message: 'Не удалось создать объект.' })
  }

  setResponseStatus(event, 201)
  return created
})
