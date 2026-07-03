import { deleteObjectsByIds, parseObjectId } from '../../utils/object-deletion'

export default eventHandler(async (event) => {
  const id = parseObjectId(getRouterParam(event, 'id'))
  const [deleted] = await deleteObjectsByIds([id])

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Объект не найден.' })
  }

  return deleted
})
