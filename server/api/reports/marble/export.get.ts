import ExcelJS from 'exceljs'
import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../../utils/supabase'

type MarbleEventRow = {
  id: number
  object_id: number | null
  type: 'crystallization' | 'polishing'
  performed_at: string
  team: string
  executors: string[] | null
  area_m2: number
  notes: string | null
}

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)
  const objectIdRaw = getQuery(event).objectId
  const objectId = objectIdRaw ? Number(objectIdRaw) : NaN

  const query: Record<string, string> = {
    select: 'id,object_id,type,performed_at,team,executors,area_m2,notes',
    order: 'performed_at.desc'
  }
  if (Number.isInteger(objectId) && objectId > 0) {
    query.object_id = `eq.${objectId}`
  }

  const events = await $fetch<MarbleEventRow[]>(`${url}/rest/v1/marble_events`, { headers, query })

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Мрамор')
  sheet.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Объект', key: 'object', width: 10 },
    { header: 'Тип', key: 'type', width: 14 },
    { header: 'Дата работ', key: 'performedAt', width: 18 },
    { header: 'Бригада', key: 'team', width: 18 },
    { header: 'Исполнители', key: 'executors', width: 28 },
    { header: 'Площадь (м²)', key: 'area', width: 14 },
    { header: 'Заметки', key: 'notes', width: 32 }
  ]

  events.forEach((e) => {
    sheet.addRow({
      id: e.id,
      object: e.object_id ?? '—',
      type: e.type === 'crystallization' ? 'Кристаллизация' : 'Полировка',
      performedAt: new Date(e.performed_at).toLocaleDateString('ru-RU'),
      team: e.team,
      executors: Array.isArray(e.executors) ? e.executors.join(', ') : '—',
      area: e.area_m2,
      notes: e.notes || ''
    })
  })

  const buffer = await workbook.xlsx.writeBuffer()
  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', 'attachment; filename=\"marble-report.xlsx\"')
  return buffer
})
