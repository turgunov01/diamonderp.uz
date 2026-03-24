import ExcelJS from 'exceljs'
import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import type { EmployeeAdvanceDbRow } from './advances'
import { mapCustomerDbRowToRecord, type CustomerDbRow } from './customers'

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const buildingIdRaw = getQuery(event).buildingId
  const buildingId = typeof buildingIdRaw === 'string' ? Number(buildingIdRaw) : NaN

  const query: Record<string, string> = {
    select: 'id,full_name,username,avatar,password,phone_number,passport_file,passport_front_path,passport_back_path,age,work_shift,object_pinned,object_positions,base_salary,position_bonus,salary_currency,status,must_change_password,activated_at,archived_at,deactivation_comment',
    order: 'id.asc',
    status: 'neq.archived'
  }
  if (Number.isInteger(buildingId) && buildingId > 0) {
    query.or = `(building_id.eq.${buildingId},building_id.is.null)`
  }

  const rows = await $fetch<CustomerDbRow[]>(`${url}/rest/v1/customers`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query
  })

  const customers = rows.map(mapCustomerDbRowToRecord)

  // Fetch advances for all customers in scope
  const advancesQuery: Record<string, string> = {
    select: 'customer_id,amount,status',
    status: 'eq.issued'
  }
  if (Number.isInteger(buildingId) && buildingId > 0) {
    advancesQuery.building_id = `eq.${buildingId}`
  }
  const advances = await $fetch<EmployeeAdvanceDbRow[]>(`${url}/rest/v1/employee_advances`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query: advancesQuery
  })

  const advanceByCustomer = advances.reduce<Record<number, number>>((acc, row) => {
    acc[row.customer_id] = (acc[row.customer_id] || 0) + (row.amount || 0)
    return acc
  }, {})

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Зарплаты')

  sheet.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'ФИО', key: 'fullName', width: 22 },
    { header: 'Логин', key: 'username', width: 18 },
    { header: 'Телефон', key: 'phoneNumber', width: 16 },
    { header: 'Смена', key: 'workShift', width: 10 },
    { header: 'Объект', key: 'objectPinned', width: 18 },
    { header: 'Позиции', key: 'objectPositions', width: 28 },
    { header: 'Базовая', key: 'baseSalary', width: 14 },
    { header: 'Надбавка', key: 'positionBonus', width: 12 },
    { header: 'Авансы (выдано)', key: 'advances', width: 14 },
    { header: 'Итого к выплате', key: 'netSalary', width: 16 },
    { header: 'Валюта', key: 'salaryCurrency', width: 8 },
    { header: 'Статус', key: 'status', width: 12 },
    { header: 'Паспорт (фронт)', key: 'passportFront', width: 30 },
    { header: 'Паспорт (тыл)', key: 'passportBack', width: 30 },
    { header: 'Архив/коммент', key: 'deactivationComment', width: 24 }
  ]

  const parsePassport = (value?: string | null) => {
    if (!value) return { front: '', back: '' }
    try {
      const parsed = JSON.parse(value)
      return { front: parsed.front || '', back: parsed.back || '' }
    } catch {
      return { front: value, back: '' }
    }
  }

  const buildPublicUrl = (path?: string | null) => {
    if (!path) return ''
    // if already absolute
    if (/^https?:\/\//i.test(path)) return path
    const base = url.replace(/\/+$/, '')
    return `${base}/storage/v1/object/public/${path.replace(/^\/+/, '')}`
  }

  customers.forEach(c => {
    const passport = parsePassport(c.passportFile)
    const advancesTotal = advanceByCustomer[c.id] || 0
    const netSalary = (c.baseSalary || 0) + (c.positionBonus || 0) - advancesTotal
    sheet.addRow({
      id: c.id,
      fullName: c.fullName || '',
      username: c.username,
      phoneNumber: c.phoneNumber,
      workShift: c.workShift === 'day' ? 'День' : 'Ночь',
      objectPinned: c.objectPinned,
      objectPositions: (c.objectPositions || []).join(', '),
      baseSalary: c.baseSalary,
      positionBonus: c.positionBonus,
      advances: advancesTotal,
      netSalary,
      salaryCurrency: c.salaryCurrency || 'UZS',
      status: c.status || '',
      passportFront: buildPublicUrl(c.passportFrontPath || passport.front),
      passportBack: buildPublicUrl(c.passportBackPath || passport.back),
      deactivationComment: c.deactivationComment || ''
    })
  })

  const buffer = await workbook.xlsx.writeBuffer()
  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', 'attachment; filename="salaries.xlsx"')
  return buffer
})
