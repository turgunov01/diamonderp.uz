import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
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

interface SupabaseErrorData {
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
    throw createError({ statusCode: 400, statusMessage: `Поле ${fieldName} обязательно.` })
  }

  return value.trim()
}

function getOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getSupabaseErrorData(error: unknown): SupabaseErrorData | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  if (!('data' in error) || !error.data || typeof error.data !== 'object') {
    return undefined
  }

  return error.data as SupabaseErrorData
}

function parseAge(value: unknown) {
  const age = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(age) || age < 18) {
    throw createError({ statusCode: 400, statusMessage: 'Возраст должен быть целым числом не меньше 18.' })
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
      statusMessage: 'Поле buildingId должно быть положительным целым числом.'
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
      statusMessage: `Поле ${fieldName} должно быть целым числом не меньше 0.`
    })
  }

  return amount
}

function parseObjectPositions(value: unknown) {
  if (!isNonEmptyString(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Поле objectPositions обязательно.'
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
      statusMessage: 'Поле objectPositions должно быть непустым массивом строк.'
    })
  }

  return objectPositions
}

function parseJsonBody(body: unknown): CreateCustomerBody {
  if (!body || typeof body !== 'object') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Тело запроса должно быть корректным JSON-объектом.'
    })
  }

  const input = body as Partial<CreateCustomerBody>
  const fullName = getRequiredString((input as Record<string, unknown>).fullName ?? (input as Record<string, unknown>).full_name, 'fullName')
  const username = getOptionalString(input.username) || generateUsername(fullName)

  if (!input.avatar || typeof input.avatar !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Поле avatar.src обязательно.' })
  }

  const avatarSrc = getRequiredString(input.avatar.src, 'avatar.src')
  const password = getOptionalString(input.password) || DEFAULT_PASSWORD
  const phoneNumber = getRequiredString(input.phoneNumber, 'phoneNumber')
  const passportFile = getRequiredString(input.passportFile, 'passportFile')
  const age = parseAge(input.age)

  if (!isWorkShift(input.workShift)) {
    throw createError({ statusCode: 400, statusMessage: 'Поле workShift должно быть \'day\' или \'night\'.' })
  }

  const objectPinned = getOptionalString(input.objectPinned)
  const buildingId = parseOptionalBuildingId(input.buildingId)
  const baseSalary = parseOptionalMoney(input.baseSalary, 'baseSalary')
  const positionBonus = parseOptionalMoney(input.positionBonus, 'positionBonus')
  const salaryTypeValue = (input as Record<string, unknown>).salaryType ?? (input as Record<string, unknown>).salary_type
  let salaryType: SalaryType | undefined
  if (salaryTypeValue !== undefined) {
    if (!isSalaryType(salaryTypeValue)) {
      throw createError({ statusCode: 400, statusMessage: 'Поле salaryType должно быть fixed или hourly.' })
    }
    salaryType = salaryTypeValue
  }

  const hourlyRate = parseOptionalMoney(
    (input as Record<string, unknown>).hourlyRate ?? (input as Record<string, unknown>).hourly_rate,
    'hourlyRate'
  )
  const role = getOptionalString((input as any).role) || 'customer'

  if (!isAuthRole(role)) {
    throw createError({ statusCode: 400, statusMessage: 'Поле role содержит недопустимую роль.' })
  }

  if (!Array.isArray(input.objectPositions) || !input.objectPositions.length || input.objectPositions.some(position => !isNonEmptyString(position))) {
    throw createError({ statusCode: 400, statusMessage: 'Поле objectPositions должно быть непустым массивом строк.' })
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
        ...getSupabaseServerHeaders(options.serviceRoleKey),
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

    const data = getSupabaseErrorData(error)
    if (data?.message?.toLowerCase().includes('already exists')) {
      return
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Не удалось подготовить бакет хранилища "${options.bucket}".`
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
        ...getSupabaseServerHeaders(options.serviceRoleKey),
        'Content-Type': options.contentType,
        'x-upsert': 'true'
      },
      body: options.data
    })
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: `Не удалось загрузить файл в бакет "${options.bucket}".`
    })
  }
}

function transliterateToLatin(value: string) {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n', ң: 'ng', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ұ: 'u', ү: 'u', ф: 'f', х: 'h', ҳ: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e',
    ю: 'yu', я: 'ya', ь: '', ъ: '', ў: 'o', ӯ: 'o', йо: 'yo'
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
    throw createError({ statusCode: 400, statusMessage: 'Не удалось сгенерировать никнейм из ФИО.' })
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
      statusMessage: 'Пароль не может совпадать с ФИО или никнеймом.'
    })
  }
}

async function parseMultipartBody(event: H3Event): Promise<CreateCustomerBody> {
  const form = await readMultipartFormData(event)
  if (!form || !form.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Данные multipart/form-data пусты.'
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
      throw createError({ statusCode: 400, statusMessage: 'Поле salaryType должно быть fixed или hourly.' })
    }
    salaryType = salaryTypeRaw
  }
  const hourlyRate = parseOptionalMoney(fields.get('hourlyRate') || fields.get('hourly_rate'), 'hourlyRate')
  const role = getOptionalString(fields.get('role')) || 'customer'
  ensurePasswordSafe(password, fullName, username)

  if (!isWorkShift(workShiftRaw)) {
    throw createError({ statusCode: 400, statusMessage: 'Поле workShift должно быть \'day\' или \'night\'.' })
  }

  if (!avatarFile) {
    throw createError({ statusCode: 400, statusMessage: 'Поле avatarFile обязательно.' })
  }
  if (!avatarFile.type?.startsWith('image/')) {
    throw createError({ statusCode: 400, statusMessage: 'Файл avatarFile должен быть изображением.' })
  }

  if (passportFrontFile && !passportBackFile) {
    throw createError({ statusCode: 400, statusMessage: 'Поле passportBackFile обязательно.' })
  }
  if (passportBackFile && !passportFrontFile) {
    throw createError({ statusCode: 400, statusMessage: 'Поле passportFrontFile обязательно.' })
  }
  if (!legacyPassportFile && !(passportFrontFile && passportBackFile)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Поле passportFile или оба passportFrontFile/passportBackFile обязательны.'
    })
  }

  const { url, serviceRoleKey, avatarBucket, passportBucket } = getSupabaseServerConfig()
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
    passportFrontPath: passportFrontPath ?? null,
    passportBackPath: passportBackPath ?? null,
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
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  ensurePasswordSafe(parsedBody.password, parsedBody.fullName, parsedBody.username)

  try {
    const rows = await $fetch<CustomerDbRow[]>(`${url}/rest/v1/customers`, {
      method: 'POST',
      headers: {
        ...getSupabaseServerHeaders(serviceRoleKey),
        Prefer: 'return=representation'
      },
      body: mapCreateBodyToDbInsert(parsedBody)
    })

    const createdRow = rows[0]
    if (!createdRow) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Supabase не вернул созданного клиента.'
      })
    }

    setResponseStatus(event, 201)
    return mapCustomerDbRowToRecord(createdRow)
  } catch (error: unknown) {
    const data = getSupabaseErrorData(error)

    if (data?.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Клиент с таким именем пользователя уже существует.'
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
