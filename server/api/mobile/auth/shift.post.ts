import { finishEmployeeWork } from '../../../utils/employee-activity'
import { requireMobileAccess } from '../../../utils/mobile-access'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  if (!access.customer) {
    throw createError({
      statusCode: 401,
      statusMessage: 'No customer found for this access.'
    })
  }

  if (!access.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'No user ID found.'
    })
  }

  const body = await readBody<{
    finishedAt?: string
  }>(event)

  const result = await finishEmployeeWork({
    employeeId: access.user.id,
    finishedAt: body.finishedAt,
    employeeName: access.customer.username,
    workShift: access.customer.work_shift as 'day' | 'night' | undefined,
    objectPinned: access.customer.object_pinned
  })

  return {
    success: true,
    finishedAt: result.finishedAt,
    activity: {
      id: result.activity.id,
      employeeId: result.activity.employeeId,
      employeeName: result.activity.employeeName,
      date: result.activity.date,
      status: result.activity.status,
      workMinutes: result.activity.workMinutes,
      lateMinutes: result.activity.lateMinutes
    }
  }
})
