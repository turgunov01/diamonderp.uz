import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'

export interface PinUserToZoneBody {
  userId: number
  zoneName: string
}

export default eventHandler(async (event) => {
  const { userId, zoneName } = await readBody<PinUserToZoneBody>(event)

  if (!userId || !zoneName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'РџРѕР»СЏ userId Рё zoneName РѕР±СЏР·Р°С‚РµР»СЊРЅС‹.'
    })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()

  try {
    const result = await $fetch(
      `${url}/rest/v1/customers?id=eq.${userId}`,
      {
        method: 'PATCH',
        headers: getDataApiServerHeaders(serviceRoleKey),
        body: {
          object_pinned: zoneName
        }
      }
    )

    return {
      success: true,
      message: `User ${userId} pinned to zone ${zoneName}`
    }
  } catch (error) {
    console.error('Error pinning user to zone:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РєСЂРµРїРёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ Р·Р° Р·РѕРЅРѕР№.'
    })
  }
})
