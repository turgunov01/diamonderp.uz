import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'

interface CreateBuildingBody {
  name: string
  logo?: string
  description?: string
}

interface BuildingRow {
  id: number
  name: string
  logo?: string | null
  description?: string | null
}

export default eventHandler(async (event) => {
  const body = await readBody<CreateBuildingBody>(event)

  if (!body?.name?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Название обязательно.'
    })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()

  const [created] = await $fetch<BuildingRow[]>(`${url}/rest/v1/buildings`, {
    method: 'POST',
    headers: {
      ...getDataApiServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    body: {
      name: body.name.trim(),
      logo: body.logo?.trim() || null,
      description: body.description?.trim() || null
    }
  })

  if (!created) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Не удалось создать здание.'
    })
  }

  setResponseStatus(event, 201)
  return created
})
