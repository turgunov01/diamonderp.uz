import ExcelJS from 'exceljs'
import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import { listEmployeeActivities } from '../../utils/employee-activity'
import { listObjectSchedules, resolveWorkScheduleTypeFromObjects } from '../../utils/object-schedules'
import type { EmployeeAdvanceDbRow } from './advances'
import { mapCustomerDbRowToRecord, type CustomerDbRow } from './customers'
import { getWorkScheduleDefinition } from '~~/shared/utils/work-schedules'
import type { H3Event } from 'h3'

type SalaryFormulaCookie = {
  workHoursPerDay?: string
  minutesPerHour?: string
  penaltyMultiplier?: string
}

function parseDateFilter(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined
}

function getTashkentMonthRange(reference = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(reference)

  const year = Number(parts.find(part => part.type === 'year')?.value)
  const month = Number(parts.find(part => part.type === 'month')?.value)

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    const fallbackYear = reference.getFullYear()
    const fallbackMonth = reference.getMonth() + 1
    const lastDay = new Date(Date.UTC(fallbackYear, fallbackMonth, 0)).getUTCDate()

    return {
      from: `${fallbackYear}-${String(fallbackMonth).padStart(2, '0')}-01`,
      to: `${fallbackYear}-${String(fallbackMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    }
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()

  return {
    from: `${year}-${String(month).padStart(2, '0')}-01`,
    to: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  }
}

function parseYmd(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (!Number.isInteger(year) || year < 1970) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  if (!Number.isInteger(day) || day < 1 || day > 31) return null

  return { year, month, day }
}

function getInclusiveDays(from?: string, to?: string) {
  if (!from || !to) {
    return undefined
  }

  const fromParts = parseYmd(from)
  const toParts = parseYmd(to)
  if (!fromParts || !toParts) {
    return undefined
  }

  const fromUtc = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day)
  const toUtc = Date.UTC(toParts.year, toParts.month - 1, toParts.day)

  if (!Number.isFinite(fromUtc) || !Number.isFinite(toUtc) || toUtc < fromUtc) {
    return undefined
  }

  return Math.floor((toUtc - fromUtc) / 86400000) + 1
}

function getMonthDays(value: string) {
  const parts = parseYmd(value)
  if (!parts) {
    return undefined
  }

  return new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate()
}

function parsePositiveInt(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function normalizeFormulaValue(raw: unknown, fallback: number) {
  return parsePositiveInt(raw) ?? fallback
}

function readSalaryFormulaCookie(event: H3Event): SalaryFormulaCookie {
  const raw = getCookie(event, 'hr-salary-formula-config')
  if (!raw) {
    return {}
  }

  try {
    return JSON.parse(raw) as SalaryFormulaCookie
  } catch {
    try {
      return JSON.parse(decodeURIComponent(raw)) as SalaryFormulaCookie
    } catch {
      return {}
    }
  }
}

function formatWorkMinutes(totalMinutes: number) {
  const minutes = Number.isFinite(totalMinutes) ? Math.max(0, Math.floor(totalMinutes)) : 0
  const hoursPart = Math.floor(minutes / 60)
  const minutesPart = minutes % 60

  if (!minutesPart) {
    return `${hoursPart} С‡`
  }

  return `${hoursPart} С‡ ${minutesPart} РјРёРЅ`
}

export default eventHandler(async (event) => {
  const { url, serviceRoleKey, passportBucket } = getDataApiServerConfig()
  const queryParams = getQuery(event)
  const buildingIdRaw = queryParams.buildingId
  const buildingId = typeof buildingIdRaw === 'string' ? Number(buildingIdRaw) : NaN
  const from = parseDateFilter(queryParams.from)
  const to = parseDateFilter(queryParams.to)
  const defaultRange = getTashkentMonthRange()
  const rangeFrom = from ?? defaultRange.from
  const rangeTo = to ?? defaultRange.to

  const query: Record<string, string> = {
    select: 'id,building_id,full_name,username,avatar,password,phone_number,passport_file,passport_front_path,passport_back_path,age,work_shift,object_pinned,object_positions,salary_type,hourly_rate,base_salary,position_bonus,salary_currency,status,must_change_password,activated_at,archived_at,deactivation_comment',
    order: 'id.asc',
    status: 'neq.archived'
  }
  if (Number.isInteger(buildingId) && buildingId > 0) {
    query.or = `(building_id.eq.${buildingId},building_id.is.null)`
  }

  const rows = await $fetch<CustomerDbRow[]>(`${url}/rest/v1/customers`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query
  })

  const customers = rows.map(mapCustomerDbRowToRecord)

  const activities = await listEmployeeActivities({
    from: rangeFrom,
    to: rangeTo,
    buildingId: Number.isInteger(buildingId) && buildingId > 0 ? buildingId : undefined,
    employeeIds: customers.map(customer => customer.id)
  })

  const lateMinutesByEmployee = activities.reduce<Record<number, number>>((acc, row) => {
    if (!row.employeeId) return acc
    acc[row.employeeId] = (acc[row.employeeId] || 0) + (row.lateMinutes || 0)
    return acc
  }, {})

  const workMinutesByEmployee = activities.reduce<Record<number, number>>((acc, row) => {
    if (!row.employeeId) return acc
    acc[row.employeeId] = (acc[row.employeeId] || 0) + (row.workMinutes || 0)
    return acc
  }, {})

  // Fetch advances for all customers in scope
  const advancesQuery: Record<string, string> = {
    select: 'customer_id,amount,status',
    status: 'eq.issued'
  }
  if (Number.isInteger(buildingId) && buildingId > 0) {
    advancesQuery.building_id = `eq.${buildingId}`
  }
  const advances = await $fetch<EmployeeAdvanceDbRow[]>(`${url}/rest/v1/employee_advances`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query: advancesQuery
  })

  const advanceByCustomer = advances.reduce<Record<number, number>>((acc, row) => {
    acc[row.customer_id] = (acc[row.customer_id] || 0) + (row.amount || 0)
    return acc
  }, {})

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Р—Р°СЂРїР»Р°С‚С‹')

  const cookieConfig = readSalaryFormulaCookie(event)
  const effectiveSalaryMonthDays = getMonthDays(rangeFrom) ?? getInclusiveDays(rangeFrom, rangeTo) ?? 0
  const effectiveWorkHoursPerDay = normalizeFormulaValue(cookieConfig.workHoursPerDay, 12)
  const effectiveMinutesPerHour = normalizeFormulaValue(cookieConfig.minutesPerHour, 60)
  const effectivePenaltyMultiplier = normalizeFormulaValue(cookieConfig.penaltyMultiplier, 4)

  sheet.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Р¤РРћ', key: 'fullName', width: 22 },
    { header: 'Р›РѕРіРёРЅ', key: 'username', width: 18 },
    { header: 'РўРµР»РµС„РѕРЅ', key: 'phoneNumber', width: 16 },
    { header: 'РЎРјРµРЅР°', key: 'workShift', width: 10 },
    { header: 'РћР±СЉРµРєС‚', key: 'objectPinned', width: 18 },
    { header: 'РџРѕР·РёС†РёРё', key: 'objectPositions', width: 28 },
    { header: 'Р“СЂР°С„РёРє РѕР±СЉРµРєС‚Р°', key: 'schedule', width: 24 },
    { header: 'РўРёРї', key: 'salaryType', width: 12 },
    { header: 'РЎС‚Р°РІРєР°/С‡Р°СЃ', key: 'hourlyRate', width: 12 },
    { header: 'Р‘Р°Р·РѕРІР°СЏ', key: 'baseSalary', width: 14 },
    { header: 'РќР°РґР±Р°РІРєР°', key: 'positionBonus', width: 12 },
    { header: 'РћС‚СЂР°Р±РѕС‚Р°РЅРѕ', key: 'worked', width: 14 },
    { header: 'РћРїРѕР·РґР°РЅРёРµ (РјРёРЅ)', key: 'lateMinutes', width: 14 },
    { header: 'РЁС‚СЂР°С„', key: 'latePenalty', width: 12 },
    { header: 'РќР° РєР°СЂС‚Сѓ', key: 'cardPayout', width: 14 },
    { header: 'РќР°Р»РёС‡РЅС‹РјРё', key: 'cashPayout', width: 14 },
    { header: 'РќР°С‡РёСЃР»РµРЅРѕ', key: 'totalSalary', width: 14 },
    { header: 'РђРІР°РЅСЃС‹ (РІС‹РґР°РЅРѕ)', key: 'advances', width: 14 },
    { header: 'Рљ РІС‹РїР»Р°С‚Рµ', key: 'netSalary', width: 16 },
    { header: 'Р’Р°Р»СЋС‚Р°', key: 'salaryCurrency', width: 8 },
    { header: 'РЎС‚Р°С‚СѓСЃ', key: 'status', width: 12 },
    { header: 'РџР°СЃРїРѕСЂС‚ (С„СЂРѕРЅС‚)', key: 'passportFront', width: 30 },
    { header: 'РџР°СЃРїРѕСЂС‚ (С‚С‹Р»)', key: 'passportBack', width: 30 },
    { header: 'РђСЂС…РёРІ/РєРѕРјРјРµРЅС‚', key: 'deactivationComment', width: 24 }
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
    if (/^https?:\/\//i.test(path)) return path

    const base = url.replace(/\/+$/, '')
    const normalized = path.replace(/^\/+/, '')
    const withBucket = normalized.startsWith('storage/v1/object')
      ? normalized
      : normalized.startsWith(`${passportBucket}/`)
        ? normalized
        : `${passportBucket}/${normalized}`

    if (withBucket.startsWith('storage/v1/object')) {
      return `${base}/${withBucket}`
    }

    return `${base}/storage/v1/object/public/${withBucket}`
  }

  const computeLatePenalty = (baseSalary: number, lateMinutes: number, workHoursPerDay: number) => {
    if (!baseSalary || !lateMinutes || !effectiveSalaryMonthDays || !workHoursPerDay) {
      return 0
    }

    const perMinuteRate = baseSalary
      / effectiveSalaryMonthDays
      / workHoursPerDay
      / effectiveMinutesPerHour

    return Math.round(perMinuteRate * effectivePenaltyMultiplier * lateMinutes)
  }

  const computeHourlySalary = (hourlyRate: number, workMinutes: number) => {
    if (!hourlyRate || !workMinutes) {
      return 0
    }

    return Math.round((hourlyRate / 60) * workMinutes)
  }

  const objectSchedules = await listObjectSchedules(Number.isInteger(buildingId) && buildingId > 0 ? buildingId : undefined)

  customers.forEach((c) => {
    const passport = parsePassport(c.passportFile)
    const advancesTotal = advanceByCustomer[c.id] || 0
    const workMinutes = workMinutesByEmployee[c.id] || 0
    const lateMinutes = lateMinutesByEmployee[c.id] || 0
    const scheduleType = resolveWorkScheduleTypeFromObjects(c, objectSchedules)
    const schedule = getWorkScheduleDefinition(scheduleType)

    const salaryTypeLabel = schedule.salaryType === 'hourly' ? 'РџРѕС‡Р°СЃРѕРІР°СЏ' : 'РћРєР»Р°Рґ'
    const hourlySalary = schedule.salaryType === 'hourly'
      ? computeHourlySalary(c.hourlyRate || 0, workMinutes)
      : 0
    const cardGross = schedule.salaryType === 'hourly'
      ? hourlySalary
      : (c.baseSalary || 0)
    const latePenalty = schedule.salaryType === 'hourly'
      ? 0
      : computeLatePenalty(c.baseSalary || 0, lateMinutes, schedule.hoursPerDay || effectiveWorkHoursPerDay)
    const cardPayout = Math.max(cardGross - latePenalty, 0)
    const cashPayout = Math.max(c.positionBonus || 0, 0)
    const totalSalary = cardPayout + cashPayout
    const netSalary = totalSalary - advancesTotal
    sheet.addRow({
      id: c.id,
      fullName: c.fullName || '',
      username: c.username,
      phoneNumber: c.phoneNumber,
      workShift: c.workShift === 'day' ? 'Р”РµРЅСЊ' : 'РќРѕС‡СЊ',
      objectPinned: c.objectPinned,
      objectPositions: (c.objectPositions || []).join(', '),
      schedule: schedule.label,
      salaryType: salaryTypeLabel,
      hourlyRate: schedule.salaryType === 'hourly' ? c.hourlyRate : '',
      baseSalary: schedule.salaryType === 'hourly' ? '' : c.baseSalary,
      positionBonus: c.positionBonus,
      worked: formatWorkMinutes(workMinutes),
      lateMinutes,
      latePenalty,
      cardPayout,
      cashPayout,
      totalSalary,
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
