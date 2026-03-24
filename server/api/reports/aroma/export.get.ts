import ExcelJS from 'exceljs'
import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../../utils/supabase'

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
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)
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
    limit: '200'
  }
  if (filterByObject) refillQuery.object_id = `eq.${objectId}`

  const [devices, refills] = await Promise.all([
    $fetch<AromaDeviceRow[]>(`${url}/rest/v1/aroma_devices`, { headers, query: deviceQuery }),
    $fetch<AromaRefillRow[]>(`${url}/rest/v1/aroma_refills`, { headers, query: refillQuery })
  ])

  const workbook = new ExcelJS.Workbook()
  workbook.created = new Date()
  const deviceSheet = workbook.addWorksheet('Диффузоры')
  deviceSheet.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Объект', key: 'object', width: 10 },
    { header: 'Название', key: 'name', width: 24 },
    { header: 'Локация', key: 'location', width: 18 },
    { header: 'Замена (дн.)', key: 'refillEveryDays', width: 14 },
    { header: 'Объем (мл)', key: 'volume', width: 12 },
    { header: 'Цена за заправку', key: 'pricePerRefill', width: 16 },
    { header: 'Последняя заправка', key: 'lastRefill', width: 18 },
    { header: 'Активен', key: 'active', width: 10 }
  ]

  devices.forEach((d) => {
    deviceSheet.addRow({
      id: d.id,
      object: d.object_id ?? '—',
      name: d.name,
      location: d.location || '—',
      refillEveryDays: d.refill_every_days,
      volume: d.volume_ml,
      pricePerRefill: Number(d.price_per_refill || 0),
      lastRefill: new Date(d.last_refill).toLocaleDateString('ru-RU'),
      active: d.active ? 'да' : 'нет'
    })
  })

  const refillSheet = workbook.addWorksheet('Заправки')
  refillSheet.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Устройство', key: 'device', width: 12 },
    { header: 'Объект', key: 'object', width: 10 },
    { header: 'Объем (мл)', key: 'amount', width: 12 },
    { header: 'Стоимость', key: 'price', width: 12 },
    { header: 'Дата заправки', key: 'date', width: 18 }
  ]

  refills.forEach((r) => {
    refillSheet.addRow({
      id: r.id,
      device: r.device_id,
      object: r.object_id ?? '—',
      amount: r.amount_ml,
      price: Number(r.price || 0),
      date: new Date(r.refilled_at).toLocaleString('ru-RU')
    })
  })

  const buffer = await workbook.xlsx.writeBuffer()
  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', 'attachment; filename=\"aroma-report.xlsx\"')
  return buffer
})
