import { requireMobileAccess } from '../../../utils/mobile-access'
import { resolveMobileShiftInfo } from '../../../utils/mobile-shift'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)
  const shift = access.customer
    ? resolveMobileShiftInfo(access.customer?.work_shift)
    : null

  return {
    role: access.role,
    frontend: access.frontend,
    source: access.source,
    shift
  }
})
