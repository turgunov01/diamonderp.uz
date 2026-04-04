import { getRouterParams, setResponseStatus } from 'h3'
import { requireMobileAccess, isFrontlineMobileAccess } from '../../utils/mobile-access'
import { getEmployeeTaskById } from '../../utils/object-tasks'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event) as { slug?: string }
  const slug = params.slug ? params.slug.split('/') : []

  // Fallback handler for GET /api/mobile/tasks/:objectId/:taskId
  if (event.method === 'GET' && slug.length === 3 && slug[0] === 'tasks') {
    const objectId = Number(slug[1])
    const taskId = Number(slug[2])

    try {
      const access = await requireMobileAccess(event)
      if (!isFrontlineMobileAccess(access)) {
        throw createError({ statusCode: 403, statusMessage: 'Only employee accounts can access mobile tasks.' })
      }
      if (!Number.isInteger(objectId) || objectId <= 0) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid object id.' })
      }
      if (!Number.isInteger(taskId) || taskId <= 0) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid task id.' })
      }
      if (!access.objectIds.includes(objectId)) {
        throw createError({ statusCode: 403, statusMessage: 'Object access denied.' })
      }

      const task = await getEmployeeTaskById(access.customer?.id ?? 0, taskId)
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
