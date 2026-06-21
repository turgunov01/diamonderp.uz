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
      statusMessage: 'РќР°Р·РІР°РЅРёРµ Р·РѕРЅС‹ РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ.'
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
      statusMessage: 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ Р·РѕРЅСѓ.'
    })
  }
})
