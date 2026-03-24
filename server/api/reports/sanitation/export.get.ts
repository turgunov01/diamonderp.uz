import ExcelJS from 'exceljs'
import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../../utils/supabase'

type SanitationEventRow = {
  id: number
  object_id: number | null
  type: 'disinfection' | 'deratization'
  performed_at: string
  team: string
  executors: string[] | null
  notes: string | null
}

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)
  const objectIdRaw = getQuery(event).objectId
  const objectId = objectIdRaw ? Number(objectIdRaw) : NaN

  const query: Record<string, string> = {
    select: 'id,object_id,type,performed_at,team,executors,notes',
    order: 'performed_at.desc'
  }
  if (Number.isInteger(objectId) && objectId > 0) {
    query.object_id = `eq.${objectId}`
  }

  const events = await $fetch<SanitationEventRow[]>(`${url}/rest/v1/sanitation_events`, { headers, query })

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Санобработка')
  sheet.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Объект', key: 'object', width: 10 },
    { header: 'Тип', key: 'type', width: 16 },
    { header: 'Дата', key: 'date', width: 18 },
    { header: 'Бригада', key: 'team', width: 18 },
    { header: 'Исполнители', key: 'executors', width: 26 },
    { header: 'Заметки', key: 'notes', width: 32 }
  ]

  events.forEach((e) => {
    sheet.addRow({
      id: e.id,
      object: e.object_id ?? '—',
      type: e.type === 'disinfection' ? 'Дезинфекция' : 'Дератизация',
      date: new Date(e.performed_at).toLocaleDateString('ru-RU'),
      team: e.team,
      executors: Array.isArray(e.executors) ? e.executors.join(', ') : '—',
      notes: e.notes || ''
    })
  })

  const buffer = await workbook.xlsx.writeBuffer()
  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', 'attachment; filename=\"sanitation-report.xlsx\"')
  return buffer
})
