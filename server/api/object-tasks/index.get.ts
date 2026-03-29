import { buildObjectTaskOverview, requireTaskManagerSession } from '../../utils/object-tasks'

export default eventHandler(async (event) => {
  requireTaskManagerSession(event)

  const rawBuildingId = getQuery(event).buildingId
  const buildingId = typeof rawBuildingId === 'string' ? Number(rawBuildingId) : NaN

  return await buildObjectTaskOverview(Number.isInteger(buildingId) && buildingId > 0 ? buildingId : undefined)
})

