import type { LoginRequestBody } from '~~/shared/types/auth'
import { authenticateLogin } from '../../../utils/auth'
import { recordEmployeeActivity } from '../../../utils/employee-activity'
import { isFrontlineMobileAccess, resolveMobileAccessFromPayload } from '../../../utils/mobile-access'
import { resolveMobileShiftInfo } from '../../../utils/mobile-shift'

export default eventHandler(async (event) => {
  const TOKEN_MAX_AGE = 60 * 60 * 24 // 24h, matches signAuthToken default
  const isProd = process.env.NODE_ENV === 'production'
  const result = await authenticateLogin(await readBody<Partial<LoginRequestBody>>(event))
  const access = await resolveMobileAccessFromPayload(result.payload)
  const mustChangePassword = Boolean(access.customer ? (access.customer.must_change_password ?? true) : false)
  const activity = isFrontlineMobileAccess(access)
    ? await recordEmployeeActivity({ employeeId: access.user.id })
    : null
  const shift = access.customer
    ? resolveMobileShiftInfo(access.customer?.work_shift)
    : null

  // Also drop the token into a cookie so tools like Postman / browsers keep the session.
  setCookie(event, 'diamond-erp-token', result.token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_MAX_AGE
  })

  return {
    user: access.user,
    token: result.token,
    role: access.role,
    frontend: access.frontend,
    source: access.source,
    mustChangePassword,
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
