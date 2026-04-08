import { isFrontlineMobileAccess, requireMobileAccess } from '../../../utils/mobile-access'
import { listEmployeeObjectTasksByObject, listReviewerObjectTasksByObject, parseOptionalObjectTaskReviewStatus, parseOptionalObjectTaskStatus } from '../../../utils/object-tasks'

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

  if (access.role === 'manager' && access.customer) {
    const reviewStatus = parseOptionalObjectTaskReviewStatus(query.reviewStatus) ?? 'pending'
    const items = await listReviewerObjectTasksByObject(access.customer.id, objectId, reviewStatus)

    return {
      role: access.role,
      frontend: access.frontend,
      objectId,
      items
    }
  }

  if (!isFrontlineMobileAccess(access)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only employee accounts can access mobile tasks.'
    })
  }

  const status = parseOptionalObjectTaskStatus(query.status)
  const items = await listEmployeeObjectTasksByObject(access.customer.id, objectId, status)

  return {
    role: access.role,
    frontend: access.frontend,
    objectId,
    items
  }
})
