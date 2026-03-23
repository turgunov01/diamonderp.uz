import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import { getSupabaseErrorData, parseObjectIdInput } from './documents'

interface DeletedTemplateRow {
  id: number
}

export default eventHandler(async (event) => {
  const rawId = getRouterParam(event, 'id')
  const templateId = Number(rawId)
  const objectId = parseObjectIdInput(getQuery(event).objectId, 'objectId query param is required.')

  if (!rawId || !Number.isInteger(templateId) || templateId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный id шаблона.' })
  }

  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = {
    ...getSupabaseServerHeaders(serviceRoleKey),
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
      throw createError({ statusCode: 404, statusMessage: 'Шаблон не найден.' })
    }

    return { success: true, id: templateId }
  } catch (error: unknown) {
    const data = getSupabaseErrorData(error)
    if (data?.code === '42P01') {
      throw createError({
        statusCode: 500,
        statusMessage: 'Таблица "document_templates" отсутствует. Сначала выполните db/supabase/documents.sql.'
      })
    }
    throw error
  }
})
