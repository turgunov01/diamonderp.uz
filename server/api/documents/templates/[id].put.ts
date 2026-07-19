import type { H3Event } from 'h3'
import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import {
  getDataApiErrorData,
  mapTemplateDbRowToRecord,
  parseObjectIdInput,
  uploadStorageObject,
  type DocumentTemplateDbRow
} from '../documents'

interface UpdateTemplateBody {
  objectId?: number
  name?: string
  description?: string
  contractType?: string
  html?: string
  css?: string
  projectData?: unknown
}

function parseTemplateId(event: H3Event) {
  const rawId = getRouterParam(event, 'id')
  const templateId = Number(rawId)
  if (!rawId || !Number.isInteger(templateId) || templateId <= 0) {
    throw createError({ statusCode: 400, message: 'Некорректный id шаблона.' })
  }

  return templateId
}

function parseUpdateBody(body: unknown): UpdateTemplateBody {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, message: 'Тело запроса должно быть корректным объектом.' })
  }

  const input = body as UpdateTemplateBody

  return {
    objectId: input.objectId,
    name: typeof input.name === 'string' ? input.name.trim() : undefined,
    description: typeof input.description === 'string' ? input.description.trim() : undefined,
    contractType: typeof input.contractType === 'string' ? input.contractType.trim() : undefined,
    html: typeof input.html === 'string' ? input.html : undefined,
    css: typeof input.css === 'string' ? input.css : undefined,
    projectData: input.projectData
  }
}

export default eventHandler(async (event) => {
  const templateId = parseTemplateId(event)
  const payload = parseUpdateBody(await readBody(event))
  const objectId = parseObjectIdInput(payload.objectId)
  const { url, serviceRoleKey, documentTemplateBucket } = getDataApiServerConfig()

  const rows = await $fetch<DocumentTemplateDbRow[]>(`${url}/rest/v1/document_templates`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query: {
      select: 'id,object_id,name,description,contract_type,html,css,storage_path,created_at,updated_at',
      id: `eq.${templateId}`,
      object_id: `eq.${objectId}`,
      limit: 1
    }
  })

  const existing = rows[0]
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Шаблон не найден.' })
  }

  const nextName = payload.name || existing.name
  const nextDescription = payload.description !== undefined ? payload.description : (existing.description || undefined)
  const nextContractType = payload.contractType || existing.contract_type
  const nextHtml = payload.html !== undefined ? payload.html : existing.html
  const nextCss = payload.css !== undefined ? payload.css : existing.css

  const serializedProject = JSON.stringify({
    objectId,
    name: nextName,
    description: nextDescription,
    contractType: nextContractType,
    html: nextHtml,
    css: nextCss,
    projectData: payload.projectData,
    updatedAt: new Date().toISOString()
  })

  await uploadStorageObject({
    url,
    serviceRoleKey,
    bucket: documentTemplateBucket,
    path: existing.storage_path,
    data: serializedProject,
    contentType: 'application/json; charset=utf-8',
    uploadErrorMessage: 'Failed to update template project in storage.'
  })

  try {
    const updatedRows = await $fetch<DocumentTemplateDbRow[]>(`${url}/rest/v1/document_templates`, {
      method: 'PATCH',
      headers: {
        ...getDataApiServerHeaders(serviceRoleKey),
        Prefer: 'return=representation'
      },
      query: {
        id: `eq.${templateId}`,
        object_id: `eq.${objectId}`
      },
      body: {
        name: nextName,
        description: nextDescription || null,
        contract_type: nextContractType,
        html: nextHtml,
        css: nextCss,
        updated_at: new Date().toISOString()
      }
    })

    const updated = updatedRows[0]
    if (!updated) {
      throw createError({ statusCode: 500, message: 'Postgres не вернул обновленный шаблон.' })
    }

    return {
      ...mapTemplateDbRowToRecord(updated),
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
