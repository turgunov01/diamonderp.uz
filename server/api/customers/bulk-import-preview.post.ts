import ExcelJS from 'exceljs'
import { Readable } from 'node:stream'
import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import type { WorkShift } from './customers'

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

interface ExistingCustomerLiteRow {
  id: number
  username: string
  phone_number: string
}

export interface BulkImportPreviewItem {
  row: number
  buildingId: number
  fullName: string
  phoneNumber: string
  username: string
  issues: string[]
  age?: number | null
  workShift?: WorkShift | null
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

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function parseRequiredBuildingId(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Р’С‹Р±РµСЂРёС‚Рµ Р·РґР°РЅРёРµ РїРµСЂРµРґ РёРјРїРѕСЂС‚РѕРј.'
    })
  }

  return parsed
}

function sanitizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '')
}

function transliterateToLatin(value: string) {
  const map: Record<string, string> = {
    'Р°': 'a', 'Р±': 'b', 'РІ': 'v', 'Рі': 'g', 'Т“': 'g', 'Рґ': 'd', 'Рµ': 'e', 'С‘': 'e', 'Р¶': 'zh', 'Р·': 'z', 'Рё': 'i', 'Р№': 'y',
    'Рє': 'k', 'Т›': 'q', 'Р»': 'l', 'Рј': 'm', 'РЅ': 'n', 'ТЈ': 'ng', 'Рѕ': 'o', 'У©': 'o', 'Рї': 'p', 'СЂ': 'r', 'СЃ': 's', 'С‚': 't',
    'Сѓ': 'u', 'Т±': 'u', 'ТЇ': 'u', 'С„': 'f', 'С…': 'h', 'Ті': 'h', 'С†': 'ts', 'С‡': 'ch', 'С€': 'sh', 'С‰': 'sch', 'С‹': 'y', 'СЌ': 'e',
    'СЋ': 'yu', 'СЏ': 'ya', 'СЊ': '', 'СЉ': '', 'Сћ': 'o', 'УЇ': 'o'
  }

  return value
    .toLowerCase()
    .split('')
    .map(char => map[char] ?? char)
    .join('')
}

function generateUsernameFromFullName(fullName: string) {
  const normalized = transliterateToLatin(fullName)
    .replace(/[^a-z0-9\s.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  if (!normalized) {
    return ''
  }

  const parts = normalized.split(' ')
  const rawUsername = parts.length >= 2
    ? `${parts[0]}.${parts.slice(1).join('.')}`
    : normalized.replace(/\s+/g, '.')

  return sanitizeUsername(rawUsername)
}

function reserveUniqueUsername(base: string, existing: Set<string>, seen: Set<string>) {
  let candidate = base
  let counter = 2

  while (existing.has(candidate) || seen.has(candidate)) {
    candidate = sanitizeUsername(`${base}.${counter}`)
    counter++
  }

  return candidate
}

function isWorkShift(value: unknown): value is WorkShift {
  return value === 'day' || value === 'night'
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
      statusMessage: 'РџРѕРґРґРµСЂР¶РёРІР°СЋС‚СЃСЏ С‚РѕР»СЊРєРѕ С„Р°Р№Р»С‹ .xlsx РёР»Рё .csv.'
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
      statusMessage: 'РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕС‡РёС‚Р°С‚СЊ С„Р°Р№Р». РЈР±РµРґРёС‚РµСЃСЊ, С‡С‚Рѕ СЌС‚Рѕ РІР°Р»РёРґРЅС‹Р№ .xlsx РёР»Рё .csv.'
    })
  }

  if (!worksheet) {
    return [] as Record<string, unknown>[]
  }

  return worksheetToJson(worksheet)
}

function normalizeColumnKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace(/[()]+/g, '')
}

function pickValue(row: Record<string, unknown>, keys: string[]) {
  const entries = Object.entries(row)
  const normalized = new Map(entries.map(([key, value]) => [normalizeColumnKey(key), value]))

  for (const key of keys) {
    const value = normalized.get(key)
    if (value === undefined || value === null) {
      continue
    }
    const asString = String(value).trim()
    if (!asString.length) {
      continue
    }
    return value
  }

  return undefined
}

export default eventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  if (!form?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Р”Р°РЅРЅС‹Рµ multipart/form-data РїСѓСЃС‚С‹.' })
  }

  const filePart = form.find(part => part.name === 'file' && part.filename) as MultipartPart | undefined
  const buildingField = form.find(part => part.name === 'buildingId' && !part.filename) as MultipartPart | undefined

  if (!filePart?.filename) {
    throw createError({ statusCode: 400, statusMessage: 'Р¤Р°Р№Р» РѕР±СЏР·Р°С‚РµР»РµРЅ РІ РїРѕР»Рµ "file".' })
  }

  const selectedBuildingId = parseRequiredBuildingId(
    buildingField ? new TextDecoder().decode(buildingField.data) : undefined
  )

  const rawRows = await parseSpreadsheet(filePart.data, filePart.filename)

  if (!rawRows.length) {
    throw createError({ statusCode: 400, statusMessage: 'РўР°Р±Р»РёС†Р° РїСѓСЃС‚Р°.' })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

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
  const items: BulkImportPreviewItem[] = []

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 2
    const issues: string[] = []

    const fullNameRaw = pickValue(rawRow, [
      'fullname',
      'full_name',
      'fio',
      'С„РёРѕ',
      'С„Р°РјРёР»РёСЏРёРјСЏРѕС‚С‡РµСЃС‚РІРѕ',
      'РёРјСЏС„Р°РјРёР»РёСЏ'
    ])
    const phoneRaw = pickValue(rawRow, [
      'phonenumber',
      'phone',
      'telephone',
      'tel',
      'С‚РµР»РµС„РѕРЅ',
      'РЅРѕРјРµСЂС‚РµР»РµС„РѕРЅР°',
      'РЅРѕРјРµСЂ'
    ])
    const usernameRaw = pickValue(rawRow, [
      'username',
      'login',
      'user',
      'Р»РѕРіРёРЅ',
      'РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ'
    ])
    const ageRaw = pickValue(rawRow, ['age', 'РІРѕР·СЂР°СЃС‚'])
    const workShiftRaw = pickValue(rawRow, ['workshift', 'shift', 'СЃРјРµРЅР°'])

    const fullName = normalizeWhitespace(String(fullNameRaw ?? usernameRaw ?? ''))
    const phoneInput = String(phoneRaw ?? '').trim()

    if (!fullName) {
      errors.push({ row: rowNumber, message: 'fullName (Р¤РРћ) РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ.' })
      return
    }

    if (!phoneInput) {
      errors.push({ row: rowNumber, message: 'phoneNumber (С‚РµР»РµС„РѕРЅ) РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ.' })
      return
    }

    const normalizedPhone = normalizePhone(phoneInput)
    const phoneNumber = normalizedPhone || phoneInput

    if (!normalizedPhone) {
      issues.push('РўРµР»РµС„РѕРЅ РІС‹РіР»СЏРґРёС‚ РЅРµРєРѕСЂСЂРµРєС‚РЅС‹Рј вЂ” РїСЂРѕРІРµСЂСЊС‚Рµ С„РѕСЂРјР°С‚.')
    } else {
      if (existingPhoneSet.has(normalizedPhone)) {
        issues.push(`РўРµР»РµС„РѕРЅ ${normalizedPhone} СѓР¶Рµ РµСЃС‚СЊ РІ Р±Р°Р·Рµ.`)
      }
      if (seenFilePhones.has(normalizedPhone)) {
        issues.push(`РўРµР»РµС„РѕРЅ ${normalizedPhone} РґСѓР±Р»РёСЂСѓРµС‚СЃСЏ РІ С„Р°Р№Р»Рµ.`)
      }
      seenFilePhones.add(normalizedPhone)
    }

    const usernameSource = typeof usernameRaw === 'string' || typeof usernameRaw === 'number'
      ? normalizeWhitespace(String(usernameRaw))
      : ''
    const providedUsername = sanitizeUsername(usernameSource)

    let baseUsername = ''

    if (providedUsername.length >= 3) {
      baseUsername = providedUsername
      if (existingUsernameSet.has(baseUsername)) {
        issues.push(`username "${baseUsername}" СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚ вЂ” Р±СѓРґРµС‚ РїСЂРµРґР»РѕР¶РµРЅ РґСЂСѓРіРѕР№.`)
      }
    } else {
      baseUsername = generateUsernameFromFullName(fullName)
      if (baseUsername.length < 3) {
        baseUsername = sanitizeUsername(`employee.${rowNumber}`)
      }

      if (existingUsernameSet.has(baseUsername)) {
        issues.push(`username "${baseUsername}" СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚ вЂ” Р±СѓРґРµС‚ РїСЂРµРґР»РѕР¶РµРЅ РґСЂСѓРіРѕР№.`)
      }
    }

    const username = reserveUniqueUsername(baseUsername, existingUsernameSet, seenFileUsernames)
    if (username !== baseUsername) {
      issues.push(`username РёР·РјРµРЅРµРЅ РЅР° "${username}".`)
    }

    seenFileUsernames.add(username)

    const ageParsed = typeof ageRaw === 'number' ? ageRaw : Number(ageRaw)
    const age = Number.isInteger(ageParsed) && ageParsed > 0 ? ageParsed : null
    if (age !== null && age < 18) {
      issues.push('Р’РѕР·СЂР°СЃС‚ РјРµРЅСЊС€Рµ 18 вЂ” РЅСѓР¶РЅРѕ РёСЃРїСЂР°РІРёС‚СЊ.')
    }

    const workShift = isWorkShift(workShiftRaw) ? workShiftRaw : null
    if (workShiftRaw !== undefined && workShift === null) {
      issues.push('РЎРјРµРЅР° РґРѕР»Р¶РЅР° Р±С‹С‚СЊ day РёР»Рё night вЂ” РЅСѓР¶РЅРѕ РёСЃРїСЂР°РІРёС‚СЊ.')
    }

    items.push({
      row: rowNumber,
      buildingId: selectedBuildingId,
      fullName,
      phoneNumber,
      username,
      issues,
      age,
      workShift
    })
  })

  return {
    items,
    added: items.length,
    skipped: rawRows.length - items.length,
    errors
  }
})
