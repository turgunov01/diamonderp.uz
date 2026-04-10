import { requireMobileAccess } from '../../../../utils/mobile-access'
import { getReviewerTaskById, reviewObjectTaskList } from '../../../../utils/object-tasks'

type ReviewTaskBody = {
  decision?: 'approved' | 'rejected'
  comment?: string | null
}

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  if (access.role !== 'manager' || !access.customer) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only manager accounts can review tasks.'
    })
  }

  const taskId = Number(getRouterParam(event, 'taskId'))
  if (!Number.isInteger(taskId) || taskId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid task id.'
    })
  }

  const task = await getReviewerTaskById(access.customer.id, taskId)

  if (typeof task.objectId === 'number' && task.objectId > 0 && !access.objectIds.includes(task.objectId)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Object access denied.'
    })
  }

  const body = await readBody<ReviewTaskBody>(event)

  const updated = await reviewObjectTaskList({
    taskId,
    reviewerId: access.customer.id,
    decision: body?.decision as 'approved' | 'rejected',
    comment: body?.comment ?? null
  })

  return {
    role: access.role,
    frontend: access.frontend,
    task: updated
  }
})
