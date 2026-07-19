import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'

interface UpdateBuildingBody {
  name?: string
  logo?: string | null
  description?: string | null
}

interface BuildingRow {
  id: number
  name: string
  logo?: string | null
  description?: string | null
}

export default eventHandler(async (event) => {
  const idRaw = getRouterParam(event, 'id')
  const id = Number(idRaw)
  if (!idRaw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: 'Некорректный id здания.' })
  }

  const body = await readBody<UpdateBuildingBody>(event)
  const patchBody: Record<string, unknown> = {}

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw createError({ statusCode: 400, message: 'Название обязательно.' })
    }
    patchBody.name = body.name.trim()
  }

  if (body.logo !== undefined) {
    patchBody.logo = typeof body.logo === 'string' && body.logo.trim() ? body.logo.trim() : null
  }

  if (body.description !== undefined) {
    patchBody.description = typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : null
  }

  if (!Object.keys(patchBody).length) {
    throw createError({ statusCode: 400, message: 'Нужно передать хотя бы одно поле для обновления.' })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()

  const rows = await $fetch<BuildingRow[]>(`${url}/rest/v1/buildings`, {
    method: 'PATCH',
    headers: {
      ...getDataApiServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    query: { id: `eq.${id}` },
    body: patchBody
  })

  const [row] = rows
  if (!row) {
    throw createError({ statusCode: 404, message: 'Здание не найдено.' })
  }

  return row
})
