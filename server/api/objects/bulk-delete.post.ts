import { deleteObjectsByIds, parseObjectIds } from '../../utils/object-deletion'

interface BulkDeleteBody {
  ids?: unknown
}

export default eventHandler(async (event) => {
  const body = await readBody<BulkDeleteBody>(event)
  const ids = parseObjectIds(body?.ids)
  const deleted = await deleteObjectsByIds(ids)

  if (!deleted.length) {
    throw createError({ statusCode: 404, message: 'Объекты не найдены.' })
  }

  return {
    deleted,
    count: deleted.length
  }
})
