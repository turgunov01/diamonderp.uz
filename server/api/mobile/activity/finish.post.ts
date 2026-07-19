import { finishEmployeeWork } from '../../../utils/employee-activity'
import { recordAuthLocationEvent } from '../../../utils/auth-locations'
import { recordEmployeeLocationPoints } from '../../../utils/employee-locations'
import { isFrontlineMobileAccess, requireMobileAccess } from '../../../utils/mobile-access'
import { readBody } from 'h3'

interface FinishEmployeeWorkBody {
  finishedAt?: string
  location?: unknown
}

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  if (!isFrontlineMobileAccess(access)) {
    throw createError({
      statusCode: 403,
      message: 'Only employee accounts can record work completion.'
    })
  }

  const body = await readBody<FinishEmployeeWorkBody>(event).catch(() => ({} as FinishEmployeeWorkBody))
  const result = await finishEmployeeWork({
    employeeId: access.customer.id,
    finishedAt: body.finishedAt,
    employeeName: access.customer.username,
    workShift: access.customer.work_shift ?? null,
    scheduleType: access.scheduleType,
    objectPinned: access.customer.object_pinned ?? null,
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
    role: access.role,
    frontend: access.frontend,
    finishedAt: result.finishedAt,
    activity: result.activity
  }
})
