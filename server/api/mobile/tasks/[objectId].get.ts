import { requireMobileAccess } from '../../../utils/mobile-access'
import { listScopedObjectTasksByObject, parseOptionalObjectTaskStatus } from '../../../utils/object-tasks'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  const rawObjectId = getRouterParam(event, 'objectId')
  const objectId = Number(rawObjectId)

  if (!rawObjectId || !Number.isInteger(objectId) || objectId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid object id.'
    })
  }

  if (!access.objectIds.includes(objectId)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Object access denied.'
    })
  }

  const query = getQuery(event)

  const status = parseOptionalObjectTaskStatus(query.status)
  const items = await listScopedObjectTasksByObject(objectId, status)

  return {
    role: access.role,
    frontend: access.frontend,
    objectId,
    items
  }
})
