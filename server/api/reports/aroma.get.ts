import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'

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
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const objectIdRaw = getQuery(event).objectId
  const objectId = objectIdRaw ? Number(objectIdRaw) : NaN
  const filterByObject = Number.isInteger(objectId) && objectId > 0

  const deviceQuery: Record<string, string> = {
    select: 'id,object_id,name,location,refill_every_days,volume_ml,price_per_refill,last_refill,active',
    order: 'id.asc'
  }
  if (filterByObject) deviceQuery.object_id = `eq.${objectId}`

  const refillQuery: Record<string, string> = {
    select: 'id,device_id,object_id,amount_ml,price,refilled_at',
    order: 'refilled_at.desc',
    limit: '50'
  }
  if (filterByObject) refillQuery.object_id = `eq.${objectId}`

  const [devicesRows, refillsRows] = await Promise.all([
    $fetch<AromaDeviceRow[]>(`${url}/rest/v1/aroma_devices`, { headers, query: deviceQuery }),
    $fetch<AromaRefillRow[]>(`${url}/rest/v1/aroma_refills`, { headers, query: refillQuery })
  ])

  const devices = devicesRows.map((d) => ({
    id: d.id,
    objectId: d.object_id,
    name: d.name,
    location: d.location || '—',
    refillEveryDays: d.refill_every_days,
    volumeMl: d.volume_ml,
    pricePerRefill: Number(d.price_per_refill || 0),
    lastRefill: d.last_refill,
    active: d.active
  }))

  const refills = refillsRows.map((r) => ({
    id: r.id,
    deviceId: r.device_id,
    objectId: r.object_id,
    amountMl: r.amount_ml,
    price: Number(r.price || 0),
    refilledAt: r.refilled_at
  }))

  return { devices, refills }
})
