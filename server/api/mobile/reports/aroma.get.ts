import { parseRequestedObjectId, requireMobileAccess, resolveScopedObjectIds } from '../../../utils/mobile-access'
import { buildEqOrInFilter } from '../../../utils/postgrest'
import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'

type AromaDeviceRow = {
  id: number
  object_id: number | null
  name: string
  location: string | null
  refill_every_days: number
  volume_ml: number
  price_per_refill: number
  last_refill: string
  active: boolean
}

type AromaRefillRow = {
  id: number
  device_id: number
  object_id: number | null
  amount_ml: number
  price: number
  refilled_at: string
}

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)
  const requestedObjectId = parseRequestedObjectId(getQuery(event).objectId)
  const objectIds = resolveScopedObjectIds(access, requestedObjectId)

  if (!objectIds.length) {
    return { devices: [], refills: [] }
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)
  const objectFilter = buildEqOrInFilter(objectIds)

  const [devicesRows, refillsRows] = await Promise.all([
    $fetch<AromaDeviceRow[]>(`${url}/rest/v1/aroma_devices`, {
      headers,
      query: {
        select: 'id,object_id,name,location,refill_every_days,volume_ml,price_per_refill,last_refill,active',
        object_id: objectFilter,
        order: 'id.asc'
      }
    }),
    $fetch<AromaRefillRow[]>(`${url}/rest/v1/aroma_refills`, {
      headers,
      query: {
        select: 'id,device_id,object_id,amount_ml,price,refilled_at',
        object_id: objectFilter,
        order: 'refilled_at.desc',
        limit: '100'
      }
    })
  ])

  return {
    role: access.role,
    frontend: access.frontend,
    objectIds,
    devices: devicesRows.map((device) => ({
      id: device.id,
      objectId: device.object_id,
      name: device.name,
      location: device.location || '-',
      refillEveryDays: device.refill_every_days,
      volumeMl: device.volume_ml,
      pricePerRefill: Number(device.price_per_refill || 0),
      lastRefill: device.last_refill,
      active: device.active
    })),
    refills: refillsRows.map((refill) => ({
      id: refill.id,
      deviceId: refill.device_id,
      objectId: refill.object_id,
      amountMl: refill.amount_ml,
      price: Number(refill.price || 0),
      refilledAt: refill.refilled_at
    }))
  }
})
