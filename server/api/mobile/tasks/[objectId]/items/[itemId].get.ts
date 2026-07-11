import { setResponseStatus } from 'h3'
import { requireMobileAccess } from '../../../../../utils/mobile-access'

// This endpoint exists only to prevent the SPA fallback when someone calls
// /api/mobile/tasks/:objectId/items/:itemId without specifying taskId.
// The correct path for item operations is:
//   /api/mobile/tasks/:taskId/items/:itemId
// where taskId comes from the task list payload.
export default eventHandler(async (event) => {
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')

  const access = await requireMobileAccess(event)

  const rawObjectId = getRouterParam(event, 'objectId')
  const objectId = Number(rawObjectId)
  const rawItemId = getRouterParam(event, 'itemId')
  const itemId = Number(rawItemId)

  if (!rawObjectId || !Number.isInteger(objectId) || objectId <= 0) {
    setResponseStatus(event, 400, 'Invalid object id.')
    return {
      error: 'invalid_object_id',
      message: 'Invalid object id.'
    }
  }

  if (!rawItemId || !Number.isInteger(itemId) || itemId <= 0) {
    setResponseStatus(event, 400, 'Invalid item id.')
    return {
      error: 'invalid_item_id',
      message: 'Invalid item id.'
    }
  }

  if (!access.objectIds.includes(objectId)) {
    setResponseStatus(event, 403, 'Object access denied.')
    return {
      error: 'object_access_denied',
      message: 'Object access denied.'
    }
  }

  setResponseStatus(event, 400, 'Use /api/mobile/tasks/:taskId/items/:itemId (taskId, not objectId).')
  return {
    error: 'invalid_path',
    message: 'Use /api/mobile/tasks/:taskId/items/:itemId (taskId, not objectId).',
    hint: 'Pass the taskId from the task list instead of objectId.'
  }
})
