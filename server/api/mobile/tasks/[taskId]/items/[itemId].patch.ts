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
  const photoFiles: { filename?: string, type?: string, data: Uint8Array }[] = []

  if (contentType.includes('multipart/form-data')) {
    const form = await readMultipartFormData(event)
    if (!form?.length) {
      throw createError({ statusCode: 400, statusMessage: 'Empty form data.' })
    }

    for (const raw of form) {
      const part = raw as { name?: string, filename?: string, type?: string, data: Uint8Array }
      if (!part.name) continue
      if (part.filename) {
        if (['photoFile', 'photo', 'image', 'proof', 'file'].includes(part.name)) {
          photoFiles.push(part)
        }
        continue
      }
      if (part.name === 'done') {
        done = String(new TextDecoder().decode(part.data)).trim() === 'true'
      }
    }
  } else {
    const body = await readBody<{ done?: boolean, photos?: string[] | string, photo?: string }>(event)
    done = body?.done

    const photoInputs: string[] = []
    if (Array.isArray(body?.photos)) {
      photoInputs.push(...body.photos)
    } else if (typeof body?.photos === 'string') {
      photoInputs.push(body.photos)
    }
    if (typeof body?.photo === 'string') {
      photoInputs.push(body.photo)
    }

    const toBuffer = (value: string) => {
      const match = value.match(/^data:(.+);base64,(.+)$/)
      if (match) {
        return { type: match[1] || 'image/jpeg', data: Buffer.from(match[2] || '', 'base64'), filename: 'mobile-photo' }
      }
      return { type: 'image/jpeg', data: Buffer.from(value, 'base64'), filename: 'mobile-photo' }
    }

    for (const raw of photoInputs) {
      if (raw && raw.trim()) {
        const parsed = toBuffer(raw.trim())
        photoFiles.push(parsed)
      }
    }
  }

  if (typeof done !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'done must be a boolean.' })
  }

  const task = await updateObjectTaskItemCompletion({
    taskId,
    itemId,
    employeeId: access.customer.id,
    done,
    photoFiles
  })

  return {
    role: access.role,
    frontend: access.frontend,
    task
  }
})


