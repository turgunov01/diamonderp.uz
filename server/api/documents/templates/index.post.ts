import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import {
  ensureStorageBucket,
  getDataApiErrorData,
  mapTemplateDbRowToRecord,
  parseObjectIdInput,
  sanitizePathSegment,
  uploadStorageObject,
  type DocumentTemplateDbRow
} from '../documents'
import type { H3Event } from 'h3'

interface CreateTemplateBody {
  name: string
  objectId: number
  description?: string
  contractType?: string
  html?: string
  css?: string
  projectData?: unknown
  uploadFile?: {
    filename: string
    contentType?: string
    data: Uint8Array
  }
}

function parseJsonCreateTemplateBody(body: unknown): Required<Pick<CreateTemplateBody, 'name' | 'objectId'>> & Omit<CreateTemplateBody, 'name' | 'objectId'> {
  if (!body || typeof body !== 'object') {
    throw createError({
      statusCode: 400,
      message: 'Тело запроса должно быть корректным объектом.'
    })
  }

  const input = body as CreateTemplateBody
  const name = typeof input.name === 'string' ? input.name.trim() : ''

  if (!name) {
    throw createError({
      statusCode: 400,
      message: 'Название шаблона обязательно.'
    })
  }

  return {
    name,
    objectId: parseObjectIdInput(input.objectId),
    description: typeof input.description === 'string' ? input.description.trim() : undefined,
    contractType: typeof input.contractType === 'string' && input.contractType.trim().length
      ? input.contractType.trim()
      : 'gph',
    html: typeof input.html === 'string' ? input.html : '',
    css: typeof input.css === 'string' ? input.css : '',
    projectData: input.projectData
  }
}

async function parseMultipartCreateTemplateBody(event: H3Event): Promise<CreateTemplateBody> {
  const form = await readMultipartFormData(event)
  if (!form?.length) {
    throw createError({ statusCode: 400, message: 'Пустая форма.' })
  }

  const fields = new Map<string, string>()
  let uploadFile: { filename: string, contentType?: string, data: Uint8Array } | undefined
  for (const part of form) {
    if (!part.name) continue
    if (part.filename) {
      uploadFile = {
        filename: part.filename,
        contentType: part.type,
        data: part.data
      }
      continue
    }
    fields.set(part.name, new TextDecoder().decode(part.data))
  }

  return {
    ...parseJsonCreateTemplateBody(Object.fromEntries(fields)),
    uploadFile
  }
}

async function parseCreateTemplateBody(event: H3Event): Promise<CreateTemplateBody> {
  const contentType = getHeader(event, 'content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    return parseMultipartCreateTemplateBody(event)
  }
  return parseJsonCreateTemplateBody(await readBody(event))
}

export default eventHandler(async (event) => {
  const payload = await parseCreateTemplateBody(event)
  const { url, serviceRoleKey, documentTemplateBucket, documentTemplateUploadBucket } = getDataApiServerConfig()

  await ensureStorageBucket({
    url,
    serviceRoleKey,
    bucket: documentTemplateBucket,
    isPublic: false,
    missingErrorMessage: `Unable to initialize storage bucket "${documentTemplateBucket}".`
  })

  if (payload.uploadFile) {
    await ensureStorageBucket({
      url,
      serviceRoleKey,
      bucket: documentTemplateUploadBucket,
      isPublic: false,
      missingErrorMessage: `Unable to initialize storage bucket "${documentTemplateUploadBucket}".`
    })
  }

  const timestamp = Date.now()
  const safeName = sanitizePathSegment(payload.name)
  const uniqueId = crypto.randomUUID()
  const storagePath = `${safeName}/${timestamp}-${uniqueId}.json`

  let originalFilePath: string | undefined
  if (payload.uploadFile) {
    const uploadPath = `${safeName}/${timestamp}-${sanitizePathSegment(payload.uploadFile.filename)}`
    await uploadStorageObject({
      url,
      serviceRoleKey,
      bucket: documentTemplateUploadBucket,
      path: uploadPath,
      data: payload.uploadFile.data,
      contentType: payload.uploadFile.contentType || 'application/octet-stream',
      uploadErrorMessage: 'Не удалось загрузить оригинальный файл шаблона.'
    })
    originalFilePath = `${documentTemplateUploadBucket}/${uploadPath}`

    if (!payload.html?.trim()) {
      payload.html = `<p>Загружен файл ${payload.uploadFile.filename}. Откройте его в редакторе и отредактируйте.</p>`
    }
  }

  const serializedProject = JSON.stringify({
    objectId: payload.objectId,
    name: payload.name,
    description: payload.description,
    contractType: payload.contractType,
    html: payload.html,
    css: payload.css,
    projectData: {
      ...(payload.projectData || {}),
      originalFilePath
    },
    updatedAt: new Date().toISOString()
  })

  await uploadStorageObject({
    url,
    serviceRoleKey,
    bucket: documentTemplateBucket,
    path: storagePath,
    data: serializedProject,
    contentType: 'application/json; charset=utf-8',
    uploadErrorMessage: 'Failed to upload template project to local storage.'
  })

  try {
    const rows = await $fetch<DocumentTemplateDbRow[]>(`${url}/rest/v1/document_templates`, {
      method: 'POST',
      headers: {
        ...getDataApiServerHeaders(serviceRoleKey),
        Prefer: 'return=representation'
      },
      body: {
        object_id: payload.objectId,
        name: payload.name,
        description: payload.description || null,
        contract_type: payload.contractType,
        html: payload.html,
        css: payload.css,
        storage_path: storagePath
      }
    })

    const createdRow = rows[0]
    if (!createdRow) {
      throw createError({
        statusCode: 500,
        message: 'Postgres не вернул созданную запись шаблона.'
      })
    }

    setResponseStatus(event, 201)
    return {
      ...mapTemplateDbRowToRecord(createdRow),
      projectData: payload.projectData
    }
  } catch (error: unknown) {
    const data = getDataApiErrorData(error)

    if (data?.code === '42P01') {
      throw createError({
        statusCode: 500,
        message: 'Таблица "document_templates" отсутствует. Сначала выполните db/postgres/documents.sql.'
      })
    }

    if (data?.message) {
      throw createError({
        statusCode: 400,
        message: data.message
      })
    }

    throw error
  }
})
