import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import {
  mapCreateBodyToDbInsert,
  mapCustomerDbRowToRecord,
  type CreateCustomerBody,
  type CustomerDbRow,
  type SalaryType,
  type WorkShift
} from './customers'
import type { H3Event } from 'h3'
import { isAuthRole } from '../../utils/auth'

interface MultipartPart {
  name?: string
  filename?: string
  type?: string
  data: Uint8Array
}

interface DataApiErrorData {
  code?: string
  message?: string
}

const DEFAULT_PASSWORD = '12345678'

function isWorkShift(value: unknown): value is WorkShift {
  return value === 'day' || value === 'night'
}

function isSalaryType(value: unknown): value is SalaryType {
  return value === 'fixed' || value === 'hourly'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function getRequiredString(value: unknown, fieldName: string) {
  if (!isNonEmptyString(value)) {
    throw createError({ statusCode: 400, statusMessage: `РџРѕР»Рµ ${fieldName} РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ.` })
  }

  return value.trim()
}

function getOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getDataApiErrorData(error: unknown): DataApiErrorData | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  if (!('data' in error) || !error.data || typeof error.data !== 'object') {
    return undefined
  }

  return error.data as DataApiErrorData
}

function parseAge(value: unknown) {
  const age = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(age) || age < 18) {
    throw createError({ statusCode: 400, statusMessage: 'Р’РѕР·СЂР°СЃС‚ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ С†РµР»С‹Рј С‡РёСЃР»РѕРј РЅРµ РјРµРЅСЊС€Рµ 18.' })
  }

  return age
}

function parseOptionalBuildingId(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const buildingId = typeof value === 'number' ? value : Number(value)

  if (!Number.isInteger(buildingId) || buildingId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'РџРѕР»Рµ buildingId РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РїРѕР»РѕР¶РёС‚РµР»СЊРЅС‹Рј С†РµР»С‹Рј С‡РёСЃР»РѕРј.'
    })
  }

  return buildingId
}

function parseOptionalMoney(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(amount) || amount < 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `РџРѕР»Рµ ${fieldName} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ С†РµР»С‹Рј С‡РёСЃР»РѕРј РЅРµ РјРµРЅСЊС€Рµ 0.`
    })
  }

  return amount
}

function parseObjectPositions(value: unknown) {
  if (!isNonEmptyString(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'РџРѕР»Рµ objectPositions РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ.'
    })
  }

  const trimmed = value.trim()

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed) && parsed.length && parsed.every(position => isNonEmptyString(position))) {
        return parsed.map(position => position.trim())
      }
    } catch {
      // If JSON parsing fails, fall back to comma-separated parsing.
    }
  }

  const objectPositions = trimmed
    .split(',')
    .map(position => position.trim())
    .filter(Boolean)

  if (!objectPositions.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'РџРѕР»Рµ objectPositions РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РЅРµРїСѓСЃС‚С‹Рј РјР°СЃСЃРёРІРѕРј СЃС‚СЂРѕРє.'
    })
  }

  return objectPositions
}

function parseJsonBody(body: unknown): CreateCustomerBody {
  if (!body || typeof body !== 'object') {
    throw createError({
      statusCode: 400,
      statusMessage: 'РўРµР»Рѕ Р·Р°РїСЂРѕСЃР° РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РєРѕСЂСЂРµРєС‚РЅС‹Рј JSON-РѕР±СЉРµРєС‚РѕРј.'
    })
  }

  const input = body as Partial<CreateCustomerBody>
  const fullName = getRequiredString((input as Record<string, unknown>).fullName ?? (input as Record<string, unknown>).full_name, 'fullName')
  const username = getOptionalString(input.username) || generateUsername(fullName)

  if (!input.avatar || typeof input.avatar !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ avatar.src РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ.' })
  }

  const avatarSrc = getRequiredString(input.avatar.src, 'avatar.src')
  const password = getOptionalString(input.password) || DEFAULT_PASSWORD
  const phoneNumber = getRequiredString(input.phoneNumber, 'phoneNumber')
  const passportFile = getRequiredString(input.passportFile, 'passportFile')
  const age = parseAge(input.age)

  if (!isWorkShift(input.workShift)) {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ workShift РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ \'day\' РёР»Рё \'night\'.' })
  }

  const objectPinned = getOptionalString(input.objectPinned)
  const buildingId = parseOptionalBuildingId(input.buildingId)
  const baseSalary = parseOptionalMoney(input.baseSalary, 'baseSalary')
  const positionBonus = parseOptionalMoney(input.positionBonus, 'positionBonus')
  const salaryTypeValue = (input as Record<string, unknown>).salaryType ?? (input as Record<string, unknown>).salary_type
  let salaryType: SalaryType | undefined
  if (salaryTypeValue !== undefined) {
    if (!isSalaryType(salaryTypeValue)) {
      throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ salaryType РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ fixed РёР»Рё hourly.' })
    }
    salaryType = salaryTypeValue
  }

  const hourlyRate = parseOptionalMoney(
    (input as Record<string, unknown>).hourlyRate ?? (input as Record<string, unknown>).hourly_rate,
    'hourlyRate'
  )
  const role = (getOptionalString((input as any).role) || 'customer').toLowerCase()

  if (!isAuthRole(role) || role.length > 64) {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ role СЃРѕРґРµСЂР¶РёС‚ РЅРµРґРѕРїСѓСЃС‚РёРјСѓСЋ СЂРѕР»СЊ.' })
  }

  if (!Array.isArray(input.objectPositions) || !input.objectPositions.length || input.objectPositions.some(position => !isNonEmptyString(position))) {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ objectPositions РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РЅРµРїСѓСЃС‚С‹Рј РјР°СЃСЃРёРІРѕРј СЃС‚СЂРѕРє.' })
  }

  return {
    fullName,
    username,
    avatar: { src: avatarSrc },
    password,
    phoneNumber,
    passportFile,
    age,
    buildingId,
    role,
    workShift: input.workShift,
    objectPinned,
    objectPositions: input.objectPositions.map(position => position.trim()),
    baseSalary,
    positionBonus,
    salaryType,
    hourlyRate,
    salaryCurrency: 'UZS',
    status: 'pending',
    mustChangePassword: true
  }
}

function sanitizePathSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'customer'
}

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
}

function encodeStoragePath(path: string) {
  return path.split('/').map(part => encodeURIComponent(part)).join('/')
}

function buildPublicObjectUrl(baseUrl: string, bucket: string, path: string) {
  return `${baseUrl}/storage/v1/object/public/${bucket}/${encodeStoragePath(path)}`
}

function serializePassportFiles(files: { front: string, back: string }) {
  return JSON.stringify(files)
}

function getErrorStatusCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) {
    return undefined
  }

  return typeof error.statusCode === 'number' ? error.statusCode : undefined
}

async function ensureStorageBucket(options: {
  url: string
  serviceRoleKey: string
  bucket: string
  isPublic: boolean
}) {
  try {
    await $fetch(`${options.url}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        ...getDataApiServerHeaders(options.serviceRoleKey),
        'Content-Type': 'application/json'
      },
      body: {
        id: options.bucket,
        name: options.bucket,
        public: options.isPublic
      }
    })
  } catch (error: unknown) {
    const statusCode = getErrorStatusCode(error)
    if (statusCode === 400 || statusCode === 409) {
      return
    }

    const data = getDataApiErrorData(error)
    if (data?.message?.toLowerCase().includes('already exists')) {
      return
    }

    throw createError({
      statusCode: 500,
      statusMessage: `РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРіРѕС‚РѕРІРёС‚СЊ Р±Р°РєРµС‚ С…СЂР°РЅРёР»РёС‰Р° "${options.bucket}".`
    })
  }
}

async function uploadStorageObject(options: {
  url: string
  serviceRoleKey: string
  bucket: string
  path: string
  data: Uint8Array
  contentType: string
}) {
  try {
    await $fetch(`${options.url}/storage/v1/object/${options.bucket}/${encodeStoragePath(options.path)}`, {
      method: 'POST',
      headers: {
        ...getDataApiServerHeaders(options.serviceRoleKey),
        'Content-Type': options.contentType,
        'x-upsert': 'true'
      },
      body: options.data
    })
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: `РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ С„Р°Р№Р» РІ Р±Р°РєРµС‚ "${options.bucket}".`
    })
  }
}

function transliterateToLatin(value: string) {
  const map: Record<string, string> = {
    'Р°': 'a', 'Р±': 'b', 'РІ': 'v', 'Рі': 'g', 'Т“': 'g', 'Рґ': 'd', 'Рµ': 'e', 'С‘': 'e', 'Р¶': 'zh', 'Р·': 'z', 'Рё': 'i', 'Р№': 'y',
    'Рє': 'k', 'Т›': 'q', 'Р»': 'l', 'Рј': 'm', 'РЅ': 'n', 'ТЈ': 'ng', 'Рѕ': 'o', 'У©': 'o', 'Рї': 'p', 'СЂ': 'r', 'СЃ': 's', 'С‚': 't',
    'Сѓ': 'u', 'Т±': 'u', 'ТЇ': 'u', 'С„': 'f', 'С…': 'h', 'Ті': 'h', 'С†': 'ts', 'С‡': 'ch', 'С€': 'sh', 'С‰': 'sch', 'С‹': 'y', 'СЌ': 'e',
    'СЋ': 'yu', 'СЏ': 'ya', 'СЊ': '', 'СЉ': '', 'Сћ': 'o', 'УЇ': 'o', 'Р№Рѕ': 'yo'
  }

  return value
    .toLowerCase()
    .split('')
    .map(char => map[char] ?? char)
    .join('')
}

function generateUsername(fullName: string) {
  const transliterated = transliterateToLatin(fullName)
  const normalized = transliterated
    .replace(/[^a-z0-9\s.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  if (!normalized) {
    throw createError({ statusCode: 400, statusMessage: 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РЅРёРєРЅРµР№Рј РёР· Р¤РРћ.' })
  }

  const parts = normalized.split(' ')
  if (parts.length >= 2) {
    return `${parts[0]}.${parts.slice(1).join('.')}`
  }

  return normalized.replace(/\s+/g, '.')
}

function ensurePasswordSafe(password: string, fullName: string, username: string) {
  const normalizedPassword = password.toLowerCase()
  const normalizedName = transliterateToLatin(fullName).toLowerCase().replace(/\s+/g, '')
  const normalizedUsername = username.toLowerCase()

  if (normalizedPassword === normalizedName || normalizedPassword === normalizedUsername) {
    throw createError({
      statusCode: 400,
      statusMessage: 'РџР°СЂРѕР»СЊ РЅРµ РјРѕР¶РµС‚ СЃРѕРІРїР°РґР°С‚СЊ СЃ Р¤РРћ РёР»Рё РЅРёРєРЅРµР№РјРѕРј.'
    })
  }
}

async function parseMultipartBody(event: H3Event): Promise<CreateCustomerBody> {
  const form = await readMultipartFormData(event)
  if (!form || !form.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Р”Р°РЅРЅС‹Рµ multipart/form-data РїСѓСЃС‚С‹.'
    })
  }

  const fields = new Map<string, string>()
  const decoder = new TextDecoder()
  let avatarFile: MultipartPart | undefined
  let legacyPassportFile: MultipartPart | undefined
  let passportFrontFile: MultipartPart | undefined
  let passportBackFile: MultipartPart | undefined

  for (const rawPart of form) {
    const part = rawPart as MultipartPart
    if (!part.name) {
      continue
    }

    if (part.filename) {
      if (part.name === 'avatarFile') {
        avatarFile = part
      }
      if (part.name === 'passportFile') {
        legacyPassportFile = part
      }
      if (part.name === 'passportFrontFile') {
        passportFrontFile = part
      }
      if (part.name === 'passportBackFile') {
        passportBackFile = part
      }
      continue
    }

    fields.set(part.name, decoder.decode(part.data))
  }

  const fullName = getRequiredString(fields.get('fullName') || fields.get('full_name') || fields.get('fio'), 'fullName')
  const usernameRaw = getOptionalString(fields.get('username'))
  const username = usernameRaw || generateUsername(fullName)
  const password = getOptionalString(fields.get('password')) || DEFAULT_PASSWORD
  const phoneNumber = getRequiredString(fields.get('phoneNumber'), 'phoneNumber')
  const buildingId = parseOptionalBuildingId(fields.get('buildingId'))
  const objectPinned = getOptionalString(fields.get('objectPinned'))
  const age = parseAge(fields.get('age'))
  const workShiftRaw = getRequiredString(fields.get('workShift'), 'workShift')
  const objectPositions = parseObjectPositions(fields.get('objectPositions'))
  const baseSalary = parseOptionalMoney(fields.get('baseSalary'), 'baseSalary')
  const positionBonus = parseOptionalMoney(fields.get('positionBonus'), 'positionBonus')
  const salaryTypeRaw = getOptionalString(fields.get('salaryType') || fields.get('salary_type'))
  let salaryType: SalaryType | undefined
  if (salaryTypeRaw) {
    if (!isSalaryType(salaryTypeRaw)) {
      throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ salaryType РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ fixed РёР»Рё hourly.' })
    }
    salaryType = salaryTypeRaw
  }
  const hourlyRate = parseOptionalMoney(fields.get('hourlyRate') || fields.get('hourly_rate'), 'hourlyRate')
  const role = (getOptionalString(fields.get('role')) || 'customer').toLowerCase()
  ensurePasswordSafe(password, fullName, username)

  if (!isAuthRole(role) || role.length > 64) {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ role РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РЅРµРїСѓСЃС‚РѕР№ СЃС‚СЂРѕРєРѕР№.' })
  }

  if (!isWorkShift(workShiftRaw)) {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ workShift РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ \'day\' РёР»Рё \'night\'.' })
  }

  if (!avatarFile) {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ avatarFile РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ.' })
  }
  if (!avatarFile.type?.startsWith('image/')) {
    throw createError({ statusCode: 400, statusMessage: 'Р¤Р°Р№Р» avatarFile РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµРј.' })
  }

  if (passportFrontFile && !passportBackFile) {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ passportBackFile РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ.' })
  }
  if (passportBackFile && !passportFrontFile) {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ passportFrontFile РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ.' })
  }
  if (!legacyPassportFile && !(passportFrontFile && passportBackFile)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'РџРѕР»Рµ passportFile РёР»Рё РѕР±Р° passportFrontFile/passportBackFile РѕР±СЏР·Р°С‚РµР»СЊРЅС‹.'
    })
  }

  const { url, serviceRoleKey, avatarBucket, passportBucket } = getDataApiServerConfig()
  await ensureStorageBucket({
    url,
    serviceRoleKey,
    bucket: avatarBucket,
    isPublic: true
  })
  await ensureStorageBucket({
    url,
    serviceRoleKey,
    bucket: passportBucket,
    isPublic: false
  })

  const safeUsername = sanitizePathSegment(username)
  const uniqueId = `${Date.now()}-${crypto.randomUUID()}`
  const avatarName = sanitizeFileName(avatarFile.filename || 'avatar')
  const avatarPath = `${safeUsername}/avatars/${uniqueId}-${avatarName}`

  await uploadStorageObject({
    url,
    serviceRoleKey,
    bucket: avatarBucket,
    path: avatarPath,
    data: avatarFile.data,
    contentType: avatarFile.type || 'application/octet-stream'
  })

  let passportFile: string
  let passportFrontPath: string | null = null
  let passportBackPath: string | null = null

  if (passportFrontFile && passportBackFile) {
    const passportFrontName = sanitizeFileName(passportFrontFile.filename || 'passport-front')
    const passportBackName = sanitizeFileName(passportBackFile.filename || 'passport-back')
    passportFrontPath = `${safeUsername}/passports/${uniqueId}-front-${passportFrontName}`
    passportBackPath = `${safeUsername}/passports/${uniqueId}-back-${passportBackName}`

    await uploadStorageObject({
      url,
      serviceRoleKey,
      bucket: passportBucket,
      path: passportFrontPath,
      data: passportFrontFile.data,
      contentType: passportFrontFile.type || 'application/octet-stream'
    })
    await uploadStorageObject({
      url,
      serviceRoleKey,
      bucket: passportBucket,
      path: passportBackPath,
      data: passportBackFile.data,
      contentType: passportBackFile.type || 'application/octet-stream'
    })

    passportFile = serializePassportFiles({
      front: `${passportBucket}/${passportFrontPath}`,
      back: `${passportBucket}/${passportBackPath}`
    })
  } else {
    const passportName = sanitizeFileName(legacyPassportFile!.filename || 'passport')
    const passportPath = `${safeUsername}/passports/${uniqueId}-${passportName}`

    await uploadStorageObject({
      url,
      serviceRoleKey,
      bucket: passportBucket,
      path: passportPath,
      data: legacyPassportFile!.data,
      contentType: legacyPassportFile!.type || 'application/octet-stream'
    })

    passportFile = `${passportBucket}/${passportPath}`
  }

  return {
    fullName,
    username,
    avatar: {
      src: buildPublicObjectUrl(url, avatarBucket, avatarPath)
    },
    password,
    phoneNumber,
    role,
    passportFile,
    passportFrontPath: passportFrontPath ?? undefined,
    passportBackPath: passportBackPath ?? undefined,
    age,
    buildingId,
    workShift: workShiftRaw,
    objectPinned,
    objectPositions,
    baseSalary,
    positionBonus,
    salaryType,
    hourlyRate,
    salaryCurrency: 'UZS',
    status: 'pending',
    mustChangePassword: true
  }
}

async function parseCreateBody(event: H3Event): Promise<CreateCustomerBody> {
  const contentType = getHeader(event, 'content-type')
  if (contentType?.includes('multipart/form-data')) {
    return parseMultipartBody(event)
  }

  return parseJsonBody(await readBody(event))
}

export default eventHandler(async (event) => {
  const parsedBody = await parseCreateBody(event)
  const { url, serviceRoleKey } = getDataApiServerConfig()
  ensurePasswordSafe(parsedBody.password, parsedBody.fullName, parsedBody.username)

  try {
    const rows = await $fetch<CustomerDbRow[]>(`${url}/rest/v1/customers`, {
      method: 'POST',
      headers: {
        ...getDataApiServerHeaders(serviceRoleKey),
        Prefer: 'return=representation'
      },
      body: mapCreateBodyToDbInsert(parsedBody)
    })

    const createdRow = rows[0]
    if (!createdRow) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Postgres РЅРµ РІРµСЂРЅСѓР» СЃРѕР·РґР°РЅРЅРѕРіРѕ РєР»РёРµРЅС‚Р°.'
      })
    }

    setResponseStatus(event, 201)
    return mapCustomerDbRowToRecord(createdRow)
  } catch (error: unknown) {
    const data = getDataApiErrorData(error)

    if (data?.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'РљР»РёРµРЅС‚ СЃ С‚Р°РєРёРј РёРјРµРЅРµРј РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚.'
      })
    }

    if (data?.message) {
      throw createError({
        statusCode: 400,
        statusMessage: data.message
      })
    }

    throw error
  }
})
