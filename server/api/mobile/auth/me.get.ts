import { requireMobileAccess } from '../../../utils/mobile-access'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  return {
    user: access.user,
    role: access.role,
    frontend: access.frontend,
    source: access.source,
    access: {
      buildingId: access.buildingId ?? null,
      objectIds: access.objectIds,
      objectNames: access.objectNames
    },
    objects: access.objects
  }
})
