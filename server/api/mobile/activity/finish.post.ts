import { finishEmployeeWork } from '../../../utils/employee-activity'
import { isFrontlineMobileAccess, requireMobileAccess } from '../../../utils/mobile-access'
import { readBody } from 'h3'

interface FinishEmployeeWorkBody {
  finishedAt?: string
}

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  if (!isFrontlineMobileAccess(access)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only employee accounts can record work completion.'
    })
  }

  const body = await readBody<FinishEmployeeWorkBody>(event).catch(() => ({} as FinishEmployeeWorkBody))
  const result = await finishEmployeeWork({
    employeeId: access.customer.id,
    finishedAt: body.finishedAt,
    employeeName: access.customer.username,
    workShift: access.customer.work_shift ?? null,
    objectPinned: access.customer.object_pinned ?? null
  })

  return {
    role: access.role,
    frontend: access.frontend,
    finishedAt: result.finishedAt,
    activity: result.activity
  }
})

