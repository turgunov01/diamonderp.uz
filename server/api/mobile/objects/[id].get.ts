import { findAccessibleObject, requireMobileAccess } from '../../../utils/mobile-access'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)
  const rawId = getRouterParam(event, 'id')
  const objectId = Number(rawId)

  if (!rawId || !Number.isInteger(objectId) || objectId <= 0) {
    throw createError({
      statusCode: 400,
      message: 'Invalid object id.'
    })
  }

  const objectRecord = findAccessibleObject(access, objectId)
  if (!objectRecord) {
    throw createError({
      statusCode: 404,
      message: 'Object not found.'
    })
  }

  return objectRecord
})
