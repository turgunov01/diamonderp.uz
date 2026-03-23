import ExcelJS from 'exceljs'
import { Readable } from 'node:stream'
import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import {
  mapCreateBodyToDbInsert,
  type CreateCustomerBody,
  type CustomerDbRow,
  type WorkShift
} from './customers'

interface ImportRowError {
  row: number
  message: string
}

interface MultipartPart {
  name?: string
  filename?: string
  type?: string
  data: Uint8Array
}

interface SourceRow {
  buildingId?: number | string
  username?: string
  password?: string
  phoneNumber?: string
  age?: number | string
  workShift?: WorkShift | string
  objectPinned?: string
  objectPositions?: string | string[]
  baseSalary?: number | string
  positionBonus?: number | string
  avatarUrl?: string
  passportFile?: string
}

interface ExistingCustomerLiteRow {
  id: number
  username: string
  phone_number: string
}

function normalizePhone(raw: unknown) {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return ''
  }

  const trimmed = String(raw).trim()
  const digits = trimmed.replace(/\D/g, '')

  if (digits.length < 9) {
    return ''
  }

  return `+${digits}`
}

function parseWorkShift(value: unknown): WorkShift | null {
  if (value === 'day' || value === 'night') {
    return value
  }

  return null
}

function parseObjectPositions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim())
      .filter(Boolean)
  }

  if (typeof value !== 'string') {
    return []
  }

  const trimmed = value.trim()
  if (!trimmed.length) {
    return []
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed
          .map(item => String(item).trim())
          .filter(Boolean)
      }
    } catch {
      // Ignore invalid json and fallback to comma parser.
    }
  }

  return trimmed
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function parseNonNegativeInt(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

function parseOptionalBuildingId(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function toStringOrNumber(value: unknown): string | number | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    return value
  }

  return undefined
}

function toRowObject(raw: Record<string, unknown>): SourceRow {
  return {
    username: typeof raw.username === 'string' ? raw.username : undefined,
    buildingId: toStringOrNumber(raw.buildingId ?? raw.building_id),
    password: typeof raw.password === 'string' ? raw.password : undefined,
    phoneNumber: typeof raw.phoneNumber === 'string'
      ? raw.phoneNumber
      : (typeof raw.phoneNumber === 'number'
          ? String(raw.phoneNumber)
          : (typeof raw.phone_number === 'string'
              ? raw.phone_number
              : (typeof raw.phone_number === 'number' ? String(raw.phone_number) : undefined))),
    age: toStringOrNumber(raw.age),
    workShift: typeof raw.workShift === 'string'
      ? raw.workShift
      : (typeof raw.work_shift === 'string' ? raw.work_shift : undefined),
    objectPinned: typeof raw.objectPinned === 'string'
      ? raw.objectPinned
      : (typeof raw.object_pinned === 'string' ? raw.object_pinned : undefined),
    objectPositions: typeof raw.objectPositions === 'string'
      ? raw.objectPositions
      : (typeof raw.object_positions === 'string' || Array.isArray(raw.object_positions)
          ? raw.object_positions as string | string[]
          : undefined),
    baseSalary: toStringOrNumber(raw.baseSalary ?? raw.base_salary),
    positionBonus: toStringOrNumber(raw.positionBonus ?? raw.position_bonus),
    avatarUrl: typeof raw.avatarUrl === 'string'
      ? raw.avatarUrl
      : (typeof raw.avatar_url === 'string' ? raw.avatar_url : undefined),
    passportFile: typeof raw.passportFile === 'string'
      ? raw.passportFile
      : (typeof raw.passport_file === 'string' ? raw.passport_file : undefined)
  }
}

function sanitizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '')
}

function normalizeCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return ''
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.join(', ')
    }

    if ('result' in value && (value as { result?: unknown }).result !== undefined) {
      return (value as { result?: unknown }).result
    }

    if ('text' in value && typeof (value as { text: unknown }).text === 'string') {
      return (value as { text: string }).text
    }

    return String(value)
  }

  return value
}

function worksheetToJson(worksheet: ExcelJS.Worksheet) {
  if (!worksheet || worksheet.actualRowCount < 1) {
    return [] as Record<string, unknown>[]
  }

  const headerRow = worksheet.getRow(1)
  const headerValues = Array.isArray(headerRow.values)
    ? headerRow.values.slice(1)
    : []

  const headers = headerValues
    .map((cell: ExcelJS.CellValue, index: number) => {
      const header = String(normalizeCellValue(cell)).trim()
      return header.length ? header : `column_${index + 1}`
    })

  if (!headers.length) {
    return [] as Record<string, unknown>[]
  }

  const rows: Record<string, unknown>[] = []

  for (let rowIndex = 2; rowIndex <= worksheet.actualRowCount; rowIndex++) {
    const row = worksheet.getRow(rowIndex)
    if (!row.hasValues) {
      continue
    }

    const record: Record<string, unknown> = {}
    let hasData = false

    headers.forEach((header: string, cellIndex: number) => {
      const cellValue = normalizeCellValue(row.getCell(cellIndex + 1).value)
      record[header] = cellValue === undefined ? '' : cellValue
      if (cellValue !== '' && cellValue !== null && cellValue !== undefined) {
        hasData = true
      }
    })

    if (hasData) {
      rows.push(record)
    }
  }

  return rows
}

async function parseSpreadsheet(bytes: Uint8Array, fileName: string) {
  const extension = fileName.toLowerCase().split('.').pop()
  const workbook = new ExcelJS.Workbook()

  if (extension !== 'csv' && extension !== 'xlsx') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Поддерживаются только файлы .xlsx или .csv.'
    })
  }

  let worksheet: ExcelJS.Worksheet | undefined

  try {
    if (extension === 'csv') {
      const text = new TextDecoder().decode(bytes)
      worksheet = await workbook.csv.read(Readable.from([text]))
    } else {
      const workbookBuffer = Buffer.from(Uint8Array.from(bytes))
      await (workbook.xlsx.load as (buffer: unknown) => Promise<ExcelJS.Workbook>)(workbookBuffer)
      worksheet = workbook.worksheets[0]
    }
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'Не удалось прочитать файл. Убедитесь, что это валидный .xlsx или .csv.'
    })
  }

  if (!worksheet) {
    return [] as Record<string, unknown>[]
  }

  return worksheetToJson(worksheet)
}

export default eventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  if (!form?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Данные multipart/form-data пусты.' })
  }

  const filePart = form.find(part => part.name === 'file' && part.filename) as MultipartPart | undefined
  const buildingField = form.find(part => part.name === 'buildingId' && !part.filename)
  if (!filePart || !filePart.filename) {
    throw createError({ statusCode: 400, statusMessage: 'Файл обязателен в поле "file".' })
  }

  const selectedBuildingId = buildingField
    ? parseOptionalBuildingId(new TextDecoder().decode(buildingField.data))
    : null

  const rawRows = await parseSpreadsheet(filePart.data, filePart.filename)

  if (!rawRows.length) {
    throw createError({ statusCode: 400, statusMessage: 'Таблица пуста.' })
  }

  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)

  const existingCustomers = await $fetch<ExistingCustomerLiteRow[]>(`${url}/rest/v1/customers`, {
    headers,
    query: {
      select: 'id,username,phone_number'
    }
  })

  const existingPhoneSet = new Set(existingCustomers.map(customer => normalizePhone(customer.phone_number)))
  const existingUsernameSet = new Set(existingCustomers.map(customer => customer.username.trim().toLowerCase()))

  const seenFilePhones = new Set<string>()
  const seenFileUsernames = new Set<string>()

  const errors: ImportRowError[] = []
  const insertRows: ReturnType<typeof mapCreateBodyToDbInsert>[] = []

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 2
    const row = toRowObject(rawRow)

    const usernameSource = typeof row.username === 'string' ? row.username : ''
    const username = sanitizeUsername(usernameSource)
    if (!username || username.length < 3) {
      errors.push({ row: rowNumber, message: 'username is required and must be at least 3 chars.' })
      return
    }

    if (existingUsernameSet.has(username) || seenFileUsernames.has(username)) {
      errors.push({ row: rowNumber, message: `username "${username}" already exists.` })
      return
    }

    const password = typeof row.password === 'string' ? row.password.trim() : ''
    if (password.length < 6) {
      errors.push({ row: rowNumber, message: 'password is required and must be at least 6 chars.' })
      return
    }

    const phoneNumber = normalizePhone(row.phoneNumber)
    if (!phoneNumber) {
      errors.push({ row: rowNumber, message: 'phoneNumber is required and must be valid.' })
      return
    }

    if (existingPhoneSet.has(phoneNumber)) {
      errors.push({ row: rowNumber, message: `phone ${phoneNumber} already exists in database.` })
      return
    }

    if (seenFilePhones.has(phoneNumber)) {
      errors.push({ row: rowNumber, message: `phone ${phoneNumber} is duplicated in file.` })
      return
    }

    const age = parseNonNegativeInt(row.age, -1)
    if (!age || age < 18) {
      errors.push({ row: rowNumber, message: 'age must be integer and >= 18.' })
      return
    }

    const workShift = parseWorkShift(row.workShift)
    if (!workShift) {
      errors.push({ row: rowNumber, message: 'workShift must be "day" or "night".' })
      return
    }

    const objectPinned = typeof row.objectPinned === 'string' ? row.objectPinned.trim() : ''

    const objectPositions = parseObjectPositions(row.objectPositions)
    if (!objectPositions.length) {
      errors.push({ row: rowNumber, message: 'objectPositions must contain at least one item.' })
      return
    }

    const baseSalary = parseNonNegativeInt(row.baseSalary, 1000000)
    if (baseSalary === null) {
      errors.push({ row: rowNumber, message: 'baseSalary must be integer >= 0.' })
      return
    }

    const positionBonus = parseNonNegativeInt(row.positionBonus, 0)
    if (positionBonus === null) {
      errors.push({ row: rowNumber, message: 'positionBonus must be integer >= 0.' })
      return
    }

    const avatarSrc = typeof row.avatarUrl === 'string' && row.avatarUrl.trim().length
      ? row.avatarUrl.trim()
      : `https://i.pravatar.cc/128?u=${encodeURIComponent(username)}`

    const passportFile = typeof row.passportFile === 'string' && row.passportFile.trim().length
      ? row.passportFile.trim()
      : `bulk-import/${username}.pdf`

    const body: CreateCustomerBody = {
      buildingId: parseOptionalBuildingId(row.buildingId) ?? selectedBuildingId,
      username,
      avatar: { src: avatarSrc },
      password,
      phoneNumber,
      passportFile,
      age,
      workShift,
      objectPinned,
      objectPositions,
      baseSalary,
      positionBonus,
      salaryCurrency: 'UZS'
    }

    insertRows.push(mapCreateBodyToDbInsert(body))
    seenFilePhones.add(phoneNumber)
    seenFileUsernames.add(username)
  })

  if (!insertRows.length) {
    return {
      imported: 0,
      skipped: rawRows.length,
      errors
    }
  }

  let createdRows: CustomerDbRow[] = []

  try {
    createdRows = await $fetch<CustomerDbRow[]>(`${url}/rest/v1/customers`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'return=representation'
      },
      body: insertRows
    })
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'message' in error
      ? String((error as { message: string }).message)
      : 'Bulk import failed.'

    throw createError({
      statusCode: 400,
      statusMessage: message
    })
  }

  return {
    imported: createdRows.length,
    skipped: rawRows.length - createdRows.length,
    errors
  }
})
