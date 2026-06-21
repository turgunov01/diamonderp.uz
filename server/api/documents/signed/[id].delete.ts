import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import { parseObjectIdInput } from '../documents'

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const idRaw = getRouterParam(event, 'id')
  const signedId = Number(idRaw)
  if (!idRaw || !Number.isInteger(signedId) || signedId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ id РїРѕРґРїРёСЃР°РЅРЅРѕРіРѕ РґРѕРєСѓРјРµРЅС‚Р°.' })
  }

  const objectId = parseObjectIdInput(getQuery(event).objectId, 'objectId query param is required.')

  const res = await $fetch.raw(`${url}/rest/v1/signed_documents`, {
    method: 'DELETE',
    headers: {
      ...headers,
      Prefer: 'return=minimal,count=exact'
    },
    query: {
      id: `eq.${signedId}`,
      object_id: `eq.${objectId}`
    }
  })

  const count = Number(res.headers.get('content-range')?.split('/')?.[1] ?? '0')
  if (!count) {
    throw createError({ statusCode: 404, statusMessage: 'РџРѕРґРїРёСЃР°РЅРЅС‹Р№ РґРѕРєСѓРјРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ.' })
  }

  return { deleted: true }
})
