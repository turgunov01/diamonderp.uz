import { requireMobileAccess } from '../../../../../utils/mobile-access'
import { updateObjectTaskItemCompletion } from '../../../../../utils/object-tasks'

interface UpdateTaskItemBody {
  done?: boolean
}

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  if (access.source !== 'customer' || !access.customer) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only employee accounts can update mobile tasks.'
    })
  }

  const taskId = Number(getRouterParam(event, 'taskId'))
  const itemId = Number(getRouterParam(event, 'itemId'))
  const body = await readBody<UpdateTaskItemBody>(event)

  if (typeof body?.done !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'done must be a boolean.'
    })
  }

  const task = await updateObjectTaskItemCompletion({
    taskId,
    itemId,
    employeeId: access.customer.id,
    done: body.done
  })

  return {
    role: access.role,
    frontend: access.frontend,
    task
  }
})

