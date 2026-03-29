import { requireMobileAccess } from '../../../utils/mobile-access'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  return {
    role: access.role,
    frontend: access.frontend,
    objectIds: access.objectIds,
    endpoints: {
      aroma: '/api/mobile/reports/aroma',
      marble: '/api/mobile/reports/marble',
      sanitation: '/api/mobile/reports/sanitation',
      waste: '/api/mobile/reports/waste'
    }
  }
})
