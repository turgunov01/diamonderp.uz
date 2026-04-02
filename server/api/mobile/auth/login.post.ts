import type { LoginRequestBody } from '~~/shared/types/auth'
import { authenticateLogin } from '../../../utils/auth'
import { recordEmployeeActivity } from '../../../utils/employee-activity'
import { isFrontlineMobileAccess, resolveMobileAccessFromPayload } from '../../../utils/mobile-access'
import { resolveMobileShiftInfo } from '../../../utils/mobile-shift'

export default eventHandler(async (event) => {
  const result = await authenticateLogin(await readBody<Partial<LoginRequestBody>>(event))
  const access = await resolveMobileAccessFromPayload(result.payload)
  const activity = isFrontlineMobileAccess(access)
    ? await recordEmployeeActivity({ employeeId: access.user.id })
    : null
  const shift = access.customer
    ? resolveMobileShiftInfo(access.customer?.work_shift)
    : null

  return {
    user: access.user,
    token: result.token,
    role: access.role,
    frontend: access.frontend,
    source: access.source,
    access: {
      buildingId: access.buildingId ?? null,
      objectIds: access.objectIds,
      objectNames: access.objectNames
    },
    shift,
    objects: access.objects,
    activity
  }
})
