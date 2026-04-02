import { isFrontlineMobileAccess, requireMobileAccess } from '../../../../utils/mobile-access'
import { listEmployeeObjectTasksByObject, parseOptionalObjectTaskStatus } from '../../../../utils/object-tasks'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  if (!isFrontlineMobileAccess(access)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only employee accounts can access mobile tasks.'
    })
  }

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

  const status = parseOptionalObjectTaskStatus(getQuery(event).status)
  const items = await listEmployeeObjectTasksByObject(access.customer.id, objectId, status)

  return {
    role: access.role,
    frontend: access.frontend,
    objectId,
    items
  }
})
