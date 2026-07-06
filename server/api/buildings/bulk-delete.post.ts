import { deleteBuildingsByIds, parseBuildingIds } from '../../utils/building-deletion'

interface BulkDeleteBody {
  ids?: unknown
  keepEmployees?: unknown
}

export default eventHandler(async (event) => {
  const body = await readBody<BulkDeleteBody>(event)
  const ids = parseBuildingIds(body?.ids)
  const keepEmployees = body?.keepEmployees === true
  const deleted = await deleteBuildingsByIds(ids, { deleteCustomers: !keepEmployees })

  if (!deleted.length) {
    throw createError({ statusCode: 404, statusMessage: 'Здания не найдены.' })
  }

  return {
    deleted,
    count: deleted.length
  }
})
