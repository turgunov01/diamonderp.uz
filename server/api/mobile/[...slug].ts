import { getRouterParams, setResponseStatus } from 'h3'
import { requireMobileAccess } from '../../utils/mobile-access'
import { getObjectScopedTaskById } from '../../utils/object-tasks'
import reviewTaskHandler from './tasks/[taskId]/review.post'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event) as Record<string, string | undefined>
  const slug = params.slug ? params.slug.split('/') : []

  // Compatibility handler for deployments where nested method routes might be missing.
  // Supports POST/PATCH /api/mobile/tasks/:taskId/review via the catch-all route.
  if ((event.method === 'POST' || event.method === 'PATCH') && slug.length === 3 && slug[0] === 'tasks' && slug[2] === 'review') {
    params.taskId = slug[1]
    return await reviewTaskHandler(event)
  }

  // Fallback handler for GET /api/mobile/tasks/:objectId/:taskId
  if (event.method === 'GET' && slug.length === 3 && slug[0] === 'tasks') {
    const objectId = Number(slug[1])
    const taskId = Number(slug[2])

    try {
      const access = await requireMobileAccess(event)
      if (!Number.isInteger(objectId) || objectId <= 0) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid object id.' })
      }
      if (!Number.isInteger(taskId) || taskId <= 0) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid task id.' })
      }
      if (!access.objectIds.includes(objectId)) {
        throw createError({ statusCode: 403, statusMessage: 'Object access denied.' })
      }

      const task = await getObjectScopedTaskById(taskId)
      if (!task || task.objectId !== objectId) {
        throw createError({ statusCode: 404, statusMessage: 'Task not found.' })
      }

      return {
        role: access.role,
        frontend: access.frontend,
        task
      }
    } catch (error) {
      throw error
    }
  }

  setResponseStatus(event, 404)
  return {
    statusCode: 404,
    statusMessage: 'Mobile API route not found.'
  }
})
