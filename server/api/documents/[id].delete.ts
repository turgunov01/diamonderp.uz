import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import { getDataApiErrorData, parseObjectIdInput } from './documents'

interface DeletedTemplateRow {
  id: number
}

export default eventHandler(async (event) => {
  const rawId = getRouterParam(event, 'id')
  const templateId = Number(rawId)
  const objectId = parseObjectIdInput(getQuery(event).objectId, 'objectId query param is required.')

  if (!rawId || !Number.isInteger(templateId) || templateId <= 0) {
    throw createError({ statusCode: 400, message: 'Некорректный id шаблона.' })
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = {
    ...getDataApiServerHeaders(serviceRoleKey),
    Prefer: 'return=representation'
  }

  try {
    const rows = await $fetch<DeletedTemplateRow[]>(`${url}/rest/v1/document_templates`, {
      method: 'DELETE',
      headers,
      query: {
        id: `eq.${templateId}`,
        object_id: `eq.${objectId}`
      }
    })

    const deleted = rows?.[0]
    if (!deleted) {
      throw createError({ statusCode: 404, message: 'Шаблон не найден.' })
    }

    return { success: true, id: templateId }
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
})
