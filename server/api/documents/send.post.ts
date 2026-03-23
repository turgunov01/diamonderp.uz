import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import {
  getSupabaseErrorData,
  mapDispatchDbRowToRecord,
  parseObjectIdInput,
  type DocumentDispatchDbRow,
  type DocumentStatus,
  type DocumentTemplateDbRow
} from './documents'

interface SendDocumentBody {
  objectId: number
  templateId: number
  recipientIds: number[]
  title?: string
}

interface CustomerLiteRow {
  id: number
  username: string
  phone_number: string
  building_id?: number | null
  object_pinned?: string | null
  object_positions?: string[] | null
}

interface ObjectLiteRow {
  id: number
  building_id?: number | null
  name: string
}

function parseSendBody(body: unknown): SendDocumentBody {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Тело запроса должно быть корректным объектом.' })
  }

  const input = body as Partial<SendDocumentBody>
  const templateId = Number(input.templateId)

  if (!Number.isInteger(templateId) || templateId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Поле templateId должно быть положительным целым числом.' })
  }

  if (!Array.isArray(input.recipientIds) || !input.recipientIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'Поле recipientIds должно содержать хотя бы один id пользователя.' })
  }

  const recipientIds = input.recipientIds
    .map(id => Number(id))
    .filter(id => Number.isInteger(id) && id > 0)

  if (!recipientIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'Поле recipientIds должно содержать корректные положительные целые числа.' })
  }

  return {
    objectId: parseObjectIdInput(input.objectId),
    templateId,
    recipientIds: Array.from(new Set(recipientIds)),
    title: typeof input.title === 'string' && input.title.trim().length ? input.title.trim() : undefined
  }
}

function encodePostgrestIn(values: number[]) {
  return `(${values.join(',')})`
}

export default eventHandler(async (event) => {
  const payload = parseSendBody(await readBody(event))
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)

  let templateRows: DocumentTemplateDbRow[]
  try {
    templateRows = await $fetch<DocumentTemplateDbRow[]>(`${url}/rest/v1/document_templates`, {
      headers,
      query: {
        select: 'id,object_id,name,description,contract_type,html,css,storage_path,created_at,updated_at',
        id: `eq.${payload.templateId}`,
        object_id: `eq.${payload.objectId}`,
        limit: 1
      }
    })
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

  const template = templateRows[0]
  if (!template) {
    throw createError({ statusCode: 404, statusMessage: 'Шаблон не найден.' })
  }

  const objectRows = await $fetch<ObjectLiteRow[]>(`${url}/rest/v1/objects`, {
    headers,
    query: {
      select: 'id,building_id,name',
      id: `eq.${payload.objectId}`,
      limit: 1
    }
  })

  const currentObject = objectRows[0]
  if (!currentObject) {
    throw createError({ statusCode: 404, statusMessage: 'Объект не найден.' })
  }

  const customers = await $fetch<CustomerLiteRow[]>(`${url}/rest/v1/customers`, {
    headers,
    query: {
      select: 'id,username,phone_number,building_id,object_pinned,object_positions',
      id: `in.${encodePostgrestIn(payload.recipientIds)}`,
      ...(currentObject.building_id ? { building_id: `eq.${currentObject.building_id}` } : {}),
      order: 'id.asc'
    }
  })

  const eligibleCustomers = customers.filter((customer) => {
    const pinned = (customer.object_pinned || '').trim()
    const positions = customer.object_positions || []

    return pinned === currentObject.name || positions.includes(currentObject.name)
  })

  // Если привязки по объекту не нашли, используем всех получателей в рамках текущего здания.
  const selectedCustomers = eligibleCustomers.length ? eligibleCustomers : customers

  if (!selectedCustomers.length) {
    throw createError({ statusCode: 404, statusMessage: 'Получатели для этого объекта не найдены.' })
  }

  const recipientIds = selectedCustomers.map(customer => customer.id)
  const recipientPhones = selectedCustomers.map(customer => customer.phone_number)
  const dispatchTitle = payload.title || `${template.name} - ${new Date().toLocaleDateString('ru-RU')}`

  const insertedDispatchRows = await $fetch<DocumentDispatchDbRow[]>(`${url}/rest/v1/document_dispatches`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    body: {
      object_id: payload.objectId,
      template_id: template.id,
      title: dispatchTitle,
      recipient_ids: recipientIds,
      recipient_phones: recipientPhones,
      recipient_count: recipientIds.length,
      signed_count: 0,
      status: 'sent',
      sent_at: new Date().toISOString()
    }
  })

  const dispatch = insertedDispatchRows[0]
  if (!dispatch) {
    throw createError({ statusCode: 500, statusMessage: 'Supabase не вернул запись отправки.' })
  }

  return {
    ...mapDispatchDbRowToRecord(dispatch),
    templateName: template.name
  }
})
