import { isFrontlineMobileAccess, requireMobileAccess } from '../../../../../utils/mobile-access'

// This endpoint exists only to prevent the SPA fallback when someone calls
// /api/mobile/tasks/:objectId/items/:itemId without specifying taskId.
// The correct path for item operations is:
//   /api/mobile/tasks/:taskId/items/:itemId
// where taskId comes from the task list payload.
export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)

  if (!isFrontlineMobileAccess(access)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only employee accounts can access mobile tasks.'
    })
  }

  const rawObjectId = getRouterParam(event, 'objectId')
  const objectId = Number(rawObjectId)
  const rawItemId = getRouterParam(event, 'itemId')
  const itemId = Number(rawItemId)

  if (!rawObjectId || !Number.isInteger(objectId) || objectId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid object id.' })
  }

  if (!rawItemId || !Number.isInteger(itemId) || itemId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid item id.' })
  }

  if (!access.objectIds.includes(objectId)) {
    throw createError({ statusCode: 403, statusMessage: 'Object access denied.' })
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'Use /api/mobile/tasks/:taskId/items/:itemId (taskId, not objectId).'
  })
})
