import { listEmployeeObjectTasks, parseOptionalObjectTaskStatus } from '../../../utils/object-tasks'
import { isFrontlineMobileAccess, requireMobileAccess } from '../../../utils/mobile-access'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  if (!isFrontlineMobileAccess(access)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only employee accounts can access mobile tasks.'
    })
  }

  const query = getQuery(event)
  const status = parseOptionalObjectTaskStatus(query.status)
  const items = await listEmployeeObjectTasks(access.customer.id, status)

  return {
    role: access.role,
    frontend: access.frontend,
    items
  }
})


