import { requireMobileAccess } from '../../../utils/mobile-access'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)
  const activeOnly = String(getQuery(event).activeOnly || '').toLowerCase() === 'true'
  const items = activeOnly
    ? access.objects.filter(object => object.isActive)
    : access.objects

  return {
    role: access.role,
    frontend: access.frontend,
    items
  }
})
