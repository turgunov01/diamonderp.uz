import { listScopedObjectTasks, parseOptionalObjectTaskStatus } from '../../../utils/object-tasks'
import { requireMobileAccess } from '../../../utils/mobile-access'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  const query = getQuery(event)

  const status = parseOptionalObjectTaskStatus(query.status)
  const items = await listScopedObjectTasks(access.objectIds, status)

  return {
    role: access.role,
    frontend: access.frontend,
    items
  }
})
