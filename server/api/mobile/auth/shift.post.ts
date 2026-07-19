import { finishEmployeeWork } from '../../../utils/employee-activity'
import { recordAuthLocationEvent } from '../../../utils/auth-locations'
import { recordEmployeeLocationPoints } from '../../../utils/employee-locations'
import { requireMobileAccess } from '../../../utils/mobile-access'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  if (!access.customer) {
    throw createError({
      statusCode: 401,
      message: 'No customer found for this access.'
    })
  }

  if (!access.user?.id) {
    throw createError({
      statusCode: 401,
      message: 'No user ID found.'
    })
  }

  const body = await readBody<{
    finishedAt?: string
    location?: unknown
  }>(event)

  const result = await finishEmployeeWork({
    employeeId: access.user.id,
    finishedAt: body.finishedAt,
    employeeName: access.customer.username,
    workShift: access.customer.work_shift as 'day' | 'night' | undefined,
    scheduleType: access.scheduleType,
    objectPinned: access.customer.object_pinned,
    location: body.location
  })

  await recordAuthLocationEvent({
    event,
    source: access.payload.sub.startsWith('erp:') ? 'erp' : 'customer',
    userId: access.user.id,
    role: access.user.role,
    eventType: 'logout',
    location: body.location
  })

  if (body.location) {
    await recordEmployeeLocationPoints({
      points: [{
        employeeId: access.customer.id,
        employeeName: access.customer.username,
        activityId: result.activity.id,
        buildingId: access.customer.building_id ?? null,
        recordedAt: result.finishedAt,
        location: body.location
      }]
    }).catch(() => undefined)
  }

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
