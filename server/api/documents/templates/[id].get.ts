import type { H3Event } from 'h3'
import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import {
  downloadStorageObject,
  ensureStorageBucket,
  getDataApiErrorData,
  mapTemplateDbRowToRecord,
  parseObjectIdInput,
  uploadStorageObject,
  type DocumentTemplateDbRow
} from '../documents'

function parseTemplateId(event: H3Event) {
  const rawId = getRouterParam(event, 'id')
  const templateId = Number(rawId)
  if (!rawId || !Number.isInteger(templateId) || templateId <= 0) {
    throw createError({ statusCode: 400, message: 'Некорректный id шаблона.' })
  }

  return templateId
}

export default eventHandler(async (event) => {
  const templateId = parseTemplateId(event)
  const objectId = parseObjectIdInput(getQuery(event).objectId, 'objectId query param is required.')
  const { url, serviceRoleKey, documentTemplateBucket } = getDataApiServerConfig()

  let rows: DocumentTemplateDbRow[]
  try {
    rows = await $fetch<DocumentTemplateDbRow[]>(`${url}/rest/v1/document_templates`, {
      headers: getDataApiServerHeaders(serviceRoleKey),
      query: {
        select: 'id,object_id,name,description,contract_type,html,css,storage_path,created_at,updated_at',
        id: `eq.${templateId}`,
        object_id: `eq.${objectId}`,
        limit: 1
      }
    })
  } catch (error: unknown) {
    const data = getDataApiErrorData(error)

    if (data?.code === '42P01') {
      throw createError({
        statusCode: 500,
        message: 'Таблица "document_templates" отсутствует. Сначала выполните db/postgres/documents.sql.'
      })
    }

    throw error
  }

  const row = rows[0]
  if (!row) {
    throw createError({ statusCode: 404, message: 'Шаблон не найден.' })
  }

  let projectRaw: string | null = null
  try {
    projectRaw = await downloadStorageObject({
      url,
      serviceRoleKey,
      bucket: documentTemplateBucket,
      path: row.storage_path,
      downloadErrorMessage: 'Template project file is missing in storage.'
    })
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number })?.statusCode
    if (statusCode !== 404) {
      throw error
    }

    await ensureStorageBucket({
      url,
      serviceRoleKey,
      bucket: documentTemplateBucket,
      isPublic: false,
      missingErrorMessage: `Unable to initialize storage bucket "${documentTemplateBucket}".`
    })

    const fallbackProject = JSON.stringify({
      objectId: row.object_id,
      name: row.name,
      description: row.description,
      contractType: row.contract_type,
      html: row.html,
      css: row.css,
      projectData: null,
      recoveredAt: new Date().toISOString()
    })

    await uploadStorageObject({
      url,
      serviceRoleKey,
      bucket: documentTemplateBucket,
      path: row.storage_path,
      data: fallbackProject,
      contentType: 'application/json; charset=utf-8',
      uploadErrorMessage: 'Failed to recreate missing template project in storage.'
    })

    projectRaw = fallbackProject
  }

  let parsedProject: unknown = null
  try {
    parsedProject = JSON.parse(projectRaw)
  } catch {
    parsedProject = null
  }

  return {
    ...mapTemplateDbRowToRecord(row),
    projectData: parsedProject
  }
})
