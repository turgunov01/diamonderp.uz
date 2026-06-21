import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const body = await readBody<{
    from?: string
    to?: string
    objectId?: number | null
  }>(event)

  const fromDate = body.from ? new Date(body.from) : null
  const toDate = body.to ? new Date(body.to) : null
  if (fromDate) fromDate.setHours(0, 0, 0, 0)
  if (toDate) toDate.setHours(23, 59, 59, 999)

  const deviceQuery: Record<string, string> = {
    select: 'id,name,location',
    order: 'id.asc'
  }
  if (body.objectId) {
    deviceQuery.object_id = `eq.${body.objectId}`
  }

  const devices = await $fetch<any[]>(`${url}/rest/v1/aroma_devices`, {
    headers,
    query: deviceQuery
  })
  const deviceMap = new Map<number, { name: string; location: string | null }>()
  devices.forEach((d) => deviceMap.set(d.id, { name: d.name, location: d.location }))

  const refillQuery: Record<string, string> = {
    select: 'id,device_id,amount_ml,price,refilled_at',
    order: 'refilled_at.desc'
  }
  if (body.objectId) refillQuery.object_id = `eq.${body.objectId}`
  if (fromDate) refillQuery.refilled_at = `gte.${fromDate.toISOString()}`
  // The REST adapter keeps one value per filter key here; keep the upper bound client-side.

  const refillsRaw = await $fetch<any[]>(`${url}/rest/v1/aroma_refills`, {
    headers,
    query: refillQuery
  })

  const refills = refillsRaw.filter((r) => {
    const d = new Date(r.refilled_at)
    if (fromDate && d < fromDate) return false
    if (toDate && d > toDate) return false
    return true
  })

  const rows: string[] = []
  rows.push('Device,Location,Date,Amount (ml),Price')
  let total = 0
  for (const r of refills) {
    const meta = deviceMap.get(r.device_id) || { name: `#${r.device_id}`, location: '' }
    const price = Number(r.price || 0)
    total += price
    const date = new Date(r.refilled_at).toLocaleDateString('ru-RU')
    rows.push(`"${meta.name}","${meta.location || ''}",${date},${r.amount_ml},${price}`)
  }
  rows.push('')
  rows.push(`Total,, , ,${total}`)

  const csv = rows.join('\n')

  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="aroma-report.csv"`)

  return csv
})
