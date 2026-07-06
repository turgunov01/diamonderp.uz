import { deleteBuildingsByIds, parseBuildingId } from '../../utils/building-deletion'

export default eventHandler(async (event) => {
  const id = parseBuildingId(getRouterParam(event, 'id'))
  const keepEmployees = getQuery(event).keepEmployees === 'true'
  const [deleted] = await deleteBuildingsByIds([id], { deleteCustomers: !keepEmployees })

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Здание не найдено.' })
  }

  return deleted
})
