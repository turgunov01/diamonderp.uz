import { listScopedObjectTasks, parseOptionalObjectTaskStatus } from '../../../utils/object-tasks'
import { requireMobileAccess } from '../../../utils/mobile-access'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  const query = getQuery(event)

  const status = parseOptionalObjectTaskStatus(query.status)
  const allItems = await listScopedObjectTasks(access.objectIds, status)

  // Managers only verify finished work: hide any task that is not 100% complete.
  const items = access.role === 'manager'
    ? allItems.filter(task => task.progressPercent >= 100)
    : allItems

  return {
    role: access.role,
    frontend: access.frontend,
    items
  }
})
