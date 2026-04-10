import { listEmployeeObjectTasks, listReviewerObjectTasks, parseOptionalObjectTaskReviewStatus, parseOptionalObjectTaskStatus } from '../../../utils/object-tasks'
import { isFrontlineMobileAccess, requireMobileAccess } from '../../../utils/mobile-access'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  const query = getQuery(event)

  if (access.role === 'manager' && access.customer) {
    const reviewStatus = parseOptionalObjectTaskReviewStatus(query.reviewStatus) ?? 'pending'
    const items = await listReviewerObjectTasks(access.customer.id, access.objectIds, reviewStatus)

    return {
      role: access.role,
      frontend: access.frontend,
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
  const items = await listEmployeeObjectTasks(access.customer.id, status)

  return {
    role: access.role,
    frontend: access.frontend,
    items
  }
})
