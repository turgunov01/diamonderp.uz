import { buildObjectTaskOverview, requireTaskManagerSession } from '../../utils/object-tasks'

export default eventHandler(async (event) => {
  requireTaskManagerSession(event)

  const query = getQuery(event)

  const rawBuildingId = query.buildingId
  const buildingId = typeof rawBuildingId === 'string' ? Number(rawBuildingId) : NaN

  const rawView = query.view
  const view = typeof rawView === 'string' && (rawView === 'raw' || rawView === 'grouped')
    ? rawView
    : undefined

  return await buildObjectTaskOverview(
    Number.isInteger(buildingId) && buildingId > 0 ? buildingId : undefined,
    { view }
  )
})

