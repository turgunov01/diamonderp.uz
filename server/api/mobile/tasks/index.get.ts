import { listEmployeeObjectTasks, parseOptionalObjectTaskStatus } from '../../../utils/object-tasks'
import { requireMobileAccess } from '../../../utils/mobile-access'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  if (access.source !== 'customer' || !access.customer) {
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

