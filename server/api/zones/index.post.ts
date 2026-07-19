import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'

export interface CreateZoneBody {
  name: string
  description?: string | null
}

export default eventHandler(async (event) => {
  const { name, description } = await readBody<CreateZoneBody>(event)

  if (!name || !name.trim()) {
    throw createError({
      statusCode: 400,
      message: 'Название зоны обязательно.'
    })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()

  try {
    const result = await $fetch(
      `${url}/rest/v1/objects`,
      {
        method: 'POST',
        headers: getDataApiServerHeaders(serviceRoleKey),
        body: {
          name: name.trim(),
          description: description?.trim() || null
        }
      }
    )

    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('Error creating zone:', error)
    throw createError({
      statusCode: 500,
      message: 'Не удалось создать зону.'
    })
  }
})
