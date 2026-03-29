import type { LoginRequestBody } from '~~/shared/types/auth'
import { authenticateLogin } from '../../../utils/auth'
import { recordEmployeeActivity } from '../../../utils/employee-activity'
import { resolveMobileAccessFromPayload } from '../../../utils/mobile-access'

export default eventHandler(async (event) => {
  const result = await authenticateLogin(await readBody<Partial<LoginRequestBody>>(event))
  const access = await resolveMobileAccessFromPayload(result.payload)
  const activity = result.source === 'customer'
    ? await recordEmployeeActivity({ employeeId: result.user.id })
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
    objects: access.objects,
    activity
  }
})
