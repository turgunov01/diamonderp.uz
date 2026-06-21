import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import { getDataApiErrorData } from '../documents/documents'

type ObjectRow = {
  id: number
  building_id?: number | null
  name: string
  description?: string | null
  address?: string | null
  code?: string | null
  is_active?: boolean
}

function parseObjectId(idRaw: string | undefined) {
  const id = Number(idRaw)
  if (!idRaw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ id РѕР±СЉРµРєС‚Р°.' })
  }

  return id
}

export default eventHandler(async (event) => {
  const id = parseObjectId(getRouterParam(event, 'id'))
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  try {
    const rows = await $fetch<ObjectRow[]>(`${url}/rest/v1/objects`, {
      method: 'DELETE',
      headers: {
        ...headers,
        Prefer: 'return=representation'
      },
      query: { id: `eq.${id}` }
    })

    const deleted = rows[0]
    if (!deleted) {
      throw createError({ statusCode: 404, statusMessage: 'РћР±СЉРµРєС‚ РЅРµ РЅР°Р№РґРµРЅ.' })
    }

    return deleted
  } catch (error: unknown) {
    const data = getDataApiErrorData(error)

    // Common case: foreign key constraint violation when object is referenced by other tables.
    // Postgres error code: 23503 (foreign_key_violation)
    if (data?.code === '23503') {
      throw createError({
        statusCode: 409,
        statusMessage: 'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ РѕР±СЉРµРєС‚: РµСЃС‚СЊ СЃРІСЏР·Р°РЅРЅС‹Рµ Р·Р°РїРёСЃРё (РґРѕРєСѓРјРµРЅС‚С‹/СЃРѕС‚СЂСѓРґРЅРёРєРё/РѕС‚С‡С‘С‚С‹). РЎРЅР°С‡Р°Р»Р° СѓРґР°Р»РёС‚Рµ РёР»Рё РѕС‚РІСЏР¶РёС‚Рµ Р·Р°РІРёСЃРёРјРѕСЃС‚Рё.'
      })
    }

    throw error
  }
})

