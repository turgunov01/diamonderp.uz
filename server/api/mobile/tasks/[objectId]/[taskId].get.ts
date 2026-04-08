import { isFrontlineMobileAccess, requireMobileAccess } from '../../../../utils/mobile-access'
import { getEmployeeTaskById, getReviewerTaskById } from '../../../../utils/object-tasks'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  const rawObjectId = getRouterParam(event, 'objectId')
  const objectId = Number(rawObjectId)
  const rawTaskId = getRouterParam(event, 'taskId')
  const taskId = Number(rawTaskId)

  if (!rawObjectId || !Number.isInteger(objectId) || objectId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid object id.'
    })
  }

  if (!rawTaskId || !Number.isInteger(taskId) || taskId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid task id.'
    })
  }

  if (!access.objectIds.includes(objectId)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Object access denied.'
    })
  }

  if (access.role === 'manager' && access.customer) {
    const task = await getReviewerTaskById(access.customer.id, taskId)

    if (task.objectId !== objectId) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found.'
      })
    }

    return {
      role: access.role,
      frontend: access.frontend,
      task
    }
  }

  if (!isFrontlineMobileAccess(access)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only employee accounts can access mobile tasks.'
    })
  }

  const task = await getEmployeeTaskById(access.customer.id, taskId)

  if (task.objectId !== objectId) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Task not found.'
    })
  }

  return {
    role: access.role,
    frontend: access.frontend,
    task
  }
})
