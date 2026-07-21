import { requireMobileAccess } from '../../../utils/mobile-access'
import { resolveMobileShiftInfo } from '../../../utils/mobile-shift'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)
  const mustChangePassword = Boolean(
    access.customer
      ? (access.customer.must_change_password ?? true)
      : access.erpUser
        ? (access.erpUser.must_change_password ?? true)
        : false
  )
  const shift = access.customer
    ? resolveMobileShiftInfo(access.scheduleType ?? access.customer?.work_shift)
    : null

  return {
    user: access.user,
    role: access.role,
    frontend: access.frontend,
    source: access.source,
    mustChangePassword,
    access: {
      buildingId: access.buildingId ?? null,
      objectIds: access.objectIds,
      objectNames: access.objectNames,
      scheduleType: access.scheduleType ?? null
    },
    shift,
    objects: access.objects
  }
})
