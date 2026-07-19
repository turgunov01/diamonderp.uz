import { requireMobileAccess } from '../../../../utils/mobile-access'
import { getReviewerTaskById, reviewObjectTaskList } from '../../../../utils/object-tasks'

type ReviewTaskBody = {
  decision?: 'approved' | 'rejected'
  comment?: string | null
  photos?: string[] | string
  photo?: string
}

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  if (access.role !== 'manager' || !access.customer) {
    throw createError({
      statusCode: 403,
      message: 'Only manager accounts can review tasks.'
    })
  }

  const taskId = Number(getRouterParam(event, 'taskId'))
  if (!Number.isInteger(taskId) || taskId <= 0) {
    throw createError({
      statusCode: 400,
      message: 'Invalid task id.'
    })
  }

  const task = await getReviewerTaskById(access.customer.id, taskId)

  if (typeof task.objectId === 'number' && task.objectId > 0 && !access.objectIds.includes(task.objectId)) {
    throw createError({
      statusCode: 403,
      message: 'Object access denied.'
    })
  }

  const contentType = getHeader(event, 'content-type') || ''
  let decision: ReviewTaskBody['decision']
  let comment: string | null | undefined
  const photoFiles: { filename?: string, type?: string, data: Uint8Array }[] = []

  if (contentType.includes('multipart/form-data')) {
    const form = await readMultipartFormData(event)
    if (!form?.length) {
      throw createError({ statusCode: 400, message: 'Empty form data.' })
    }

    const allowedFileFields = new Set([
      'photoFile',
      'photoFiles',
      'photo',
      'photos',
      'image',
      'proof',
      'file',
      'files',
      'reviewPhoto',
      'reviewPhotoFile',
      'reviewPhotoFiles'
    ])

    for (const raw of form) {
      const part = raw as { name?: string, filename?: string, type?: string, data: Uint8Array }
      if (!part.name) continue

      if (part.filename) {
        if (allowedFileFields.has(part.name)) {
          photoFiles.push(part)
        }
        continue
      }

      const value = String(new TextDecoder().decode(part.data)).trim()
      if (part.name === 'decision') {
        decision = value as ReviewTaskBody['decision']
      } else if (part.name === 'comment') {
        comment = value
      }
    }
  } else {
    const body = await readBody<ReviewTaskBody>(event)
    decision = body?.decision
    comment = body?.comment ?? null

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
        return { type: match[1] || 'image/jpeg', data: Buffer.from(match[2] || '', 'base64'), filename: 'review-photo' }
      }
      return { type: 'image/jpeg', data: Buffer.from(value, 'base64'), filename: 'review-photo' }
    }

    for (const raw of photoInputs) {
      if (raw && raw.trim()) {
        const parsed = toBuffer(raw.trim())
        photoFiles.push(parsed)
      }
    }
  }

  const updated = await reviewObjectTaskList({
    taskId,
    reviewerId: access.customer.id,
    decision: decision as 'approved' | 'rejected',
    comment: comment ?? null,
    photoFiles
  })

  return {
    role: access.role,
    frontend: access.frontend,
    task: updated
  }
})
