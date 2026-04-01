import { isFrontlineMobileAccess, requireMobileAccess } from '../../../../../utils/mobile-access'
import { updateObjectTaskItemCompletion } from '../../../../../utils/object-tasks'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  if (!isFrontlineMobileAccess(access)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only employee accounts can update mobile tasks.'
    })
  }

  const taskId = Number(getRouterParam(event, 'taskId'))
  const itemId = Number(getRouterParam(event, 'itemId'))
  const contentType = getHeader(event, 'content-type') || ''
  let done: boolean | undefined
  let photoFile: { filename?: string, type?: string, data: Uint8Array } | undefined

  if (contentType.includes('multipart/form-data')) {
    const form = await readMultipartFormData(event)
    if (!form?.length) {
      throw createError({ statusCode: 400, statusMessage: 'Empty form data.' })
    }

    for (const raw of form) {
      const part = raw as { name?: string, filename?: string, type?: string, data: Uint8Array }
      if (!part.name) continue
      if (part.filename) {
        if (part.name === 'photoFile') {
          photoFile = part
        }
        continue
      }
      if (part.name === 'done') {
        done = String(new TextDecoder().decode(part.data)).trim() === 'true'
      }
    }
  } else {
    const body = await readBody<{ done?: boolean }>(event)
    done = body?.done
  }

  if (typeof done !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'done must be a boolean.' })
  }

  const task = await updateObjectTaskItemCompletion({
    taskId,
    itemId,
    employeeId: access.customer.id,
    done,
    photoFile
  })

  return {
    role: access.role,
    frontend: access.frontend,
    task
  }
})


