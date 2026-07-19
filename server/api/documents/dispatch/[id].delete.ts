import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import { parseObjectIdInput } from '../documents'

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const idRaw = getRouterParam(event, 'id')
  const dispatchId = Number(idRaw)
  if (!idRaw || !Number.isInteger(dispatchId) || dispatchId <= 0) {
    throw createError({ statusCode: 400, message: 'Некорректный id отправки.' })
  }

  const objectId = parseObjectIdInput(getQuery(event).objectId, 'objectId query param is required.')

  // Remove related signed documents first (if any)
  await $fetch(`${url}/rest/v1/signed_documents`, {
    method: 'DELETE',
    headers,
    query: {
      dispatch_id: `eq.${dispatchId}`,
      object_id: `eq.${objectId}`
    }
  })

  const res = await $fetch.raw(`${url}/rest/v1/document_dispatches`, {
    method: 'DELETE',
    headers: {
      ...headers,
      Prefer: 'return=minimal,count=exact'
    },
    query: {
      id: `eq.${dispatchId}`,
      object_id: `eq.${objectId}`
    }
  })

  const count = Number(res.headers.get('content-range')?.split('/')?.[1] ?? '0')
  if (!count) {
    throw createError({ statusCode: 404, message: 'Отправка не найдена.' })
  }

  return { deleted: true }
})
