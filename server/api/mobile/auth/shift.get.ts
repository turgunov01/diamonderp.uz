import { requireMobileAccess } from '../../../utils/mobile-access'
import { resolveMobileShiftInfo } from '../../../utils/mobile-shift'
import { listEmployeeActivities } from '../../../utils/employee-activity'
import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../../utils/supabase'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)
  const shift = access.customer
    ? resolveMobileShiftInfo(access.scheduleType ?? access.customer?.work_shift)
    : null

  // Check if shift has already been started today
  let shiftStarted = false
  if (access.user?.id && shift?.isActiveNow) {
    const today = new Date().toISOString().split('T')[0]
    const activities = await listEmployeeActivities({
      from: today,
      to: today,
      employeeIds: [access.user.id]
    })
    shiftStarted = activities.length > 0
  }

  return {
    role: access.role,
    frontend: access.frontend,
    source: access.source,
    shift,
    shiftStarted
  }
})
