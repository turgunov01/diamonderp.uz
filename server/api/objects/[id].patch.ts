import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import { normalizeWorkScheduleType, type WorkScheduleType } from '~~/shared/utils/work-schedules'

interface UpdateObjectBody {
  isActive?: boolean
  name?: string
  description?: string | null
  address?: string | null
  code?: string | null
  scheduleType?: WorkScheduleType
  schedule_type?: WorkScheduleType
}

type ObjectPatchRow = Record<string, unknown>

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
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const idRaw = getRouterParam(event, 'id')
  const id = Number(idRaw)
  if (!idRaw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ id РѕР±СЉРµРєС‚Р°.' })
  }

  const body = await readBody<UpdateObjectBody>(event)
  const patchBody: Record<string, unknown> = {}

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ isActive РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ true/false.' })
    }
    patchBody.is_active = body.isActive
  }

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'РќР°Р·РІР°РЅРёРµ РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ.' })
    }
    patchBody.name = body.name.trim()
  }

  if (body.description !== undefined) {
    patchBody.description = typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : null
  }

  if (body.address !== undefined) {
    patchBody.address = typeof body.address === 'string' && body.address.trim()
      ? body.address.trim()
      : null
  }

  if (body.code !== undefined) {
    patchBody.code = typeof body.code === 'string' && body.code.trim()
      ? body.code.trim()
      : null
  }

  const scheduleType = body.scheduleType ?? body.schedule_type
  if (scheduleType !== undefined) {
    patchBody.schedule_type = normalizeWorkScheduleType(scheduleType)
  }

  if (!Object.keys(patchBody).length) {
    throw createError({ statusCode: 400, statusMessage: 'РќСѓР¶РЅРѕ РїРµСЂРµРґР°С‚СЊ С…РѕС‚СЏ Р±С‹ РѕРґРЅРѕ РїРѕР»Рµ РґР»СЏ РѕР±РЅРѕРІР»РµРЅРёСЏ.' })
  }

  let rows: ObjectPatchRow[]

  try {
    rows = await $fetch<ObjectPatchRow[]>(`${url}/rest/v1/objects`, {
      method: 'PATCH',
      headers: {
        ...headers,
        Prefer: 'return=representation'
      },
      query: { id: `eq.${id}` },
      body: patchBody
    })
  } catch (error) {
    if (!isMissingScheduleTypeColumn(error) || patchBody.schedule_type === undefined) {
      throw error
    }

    const legacyPatchBody: Record<string, unknown> = { ...patchBody }
    delete legacyPatchBody.schedule_type
    rows = await $fetch<ObjectPatchRow[]>(`${url}/rest/v1/objects`, {
      method: 'PATCH',
      headers: {
        ...headers,
        Prefer: 'return=representation'
      },
      query: { id: `eq.${id}` },
      body: legacyPatchBody
    })
  }

  const row = rows[0]
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'РћР±СЉРµРєС‚ РЅРµ РЅР°Р№РґРµРЅ.' })
  }

  return row
})
