import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import {
  getDataApiErrorData,
  mapDispatchDbRowToRecord,
  parseObjectIdInput,
  type DocumentDispatchDbRow,
  type DocumentTemplateDbRow
} from './documents'
import { resolveDispatchRecipients, type CustomerRecipientRow } from './recipients'

interface SendDocumentBody {
  objectId: number
  templateId: number
  recipientIds: number[]
  title?: string
}

type CustomerLiteRow = CustomerRecipientRow

interface ObjectLiteRow {
  id: number
  building_id?: number | null
  name: string
}

function parseSendBody(body: unknown): SendDocumentBody {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, message: 'Тело запроса должно быть корректным объектом.' })
  }

  const input = body as Partial<SendDocumentBody>
  const templateId = Number(input.templateId)

  if (!Number.isInteger(templateId) || templateId <= 0) {
    throw createError({ statusCode: 400, message: 'Поле templateId должно быть положительным целым числом.' })
  }

  // `recipientIds` теперь необязательное: если его не передать, документ
  // получают все сотрудники объекта. Если передать — это лишь дополнение,
  // которое объединяется с сотрудниками объекта (никто не выпадает).
  const recipientIds = Array.isArray(input.recipientIds)
    ? input.recipientIds
        .map(id => Number(id))
        .filter(id => Number.isInteger(id) && id > 0)
    : []

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
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

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
    const data = getDataApiErrorData(error)

    if (data?.code === '42P01') {
      throw createError({
        statusCode: 500,
        message: 'Таблица "document_templates" отсутствует. Сначала выполните db/postgres/documents.sql.'
      })
    }

    throw error
  }

  const template = templateRows[0]
  if (!template) {
    throw createError({ statusCode: 404, message: 'Шаблон не найден.' })
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
    throw createError({ statusCode: 404, message: 'Объект не найден.' })
  }

  // Берём всех сотрудников здания (плюс legacy-записи без building_id), а затем
  // в JS отбираем закреплённых за объектом. Явно выбранные получатели
  // добавляются поверх и никогда не отбрасываются.
  const buildingCustomers = await $fetch<CustomerLiteRow[]>(`${url}/rest/v1/customers`, {
    headers,
    query: {
      select: 'id,username,phone_number,building_id,object_pinned,object_positions',
      ...(currentObject.building_id
        ? { or: `(building_id.eq.${currentObject.building_id},building_id.is.null)` }
        : {}),
      order: 'id.asc'
    }
  })

  // Если ERP явно выбрал сотрудника не из этого здания — подгружаем его отдельно,
  // чтобы отправка не падала и не теряла получателей.
  const knownIds = new Set(buildingCustomers.map(customer => Number(customer.id)))
  const missingExplicitIds = payload.recipientIds.filter(id => !knownIds.has(id))
  let extraCustomers: CustomerLiteRow[] = []
  if (missingExplicitIds.length) {
    extraCustomers = await $fetch<CustomerLiteRow[]>(`${url}/rest/v1/customers`, {
      headers,
      query: {
        select: 'id,username,phone_number,building_id,object_pinned,object_positions',
        id: `in.${encodePostgrestIn(missingExplicitIds)}`,
        order: 'id.asc'
      }
    })
  }

  const selectedCustomers = resolveDispatchRecipients(
    [...buildingCustomers, ...extraCustomers],
    currentObject.name,
    payload.recipientIds
  )

  if (!selectedCustomers.length) {
    throw createError({ statusCode: 404, message: 'Для этого объекта не найдено ни одного сотрудника.' })
  }

  const recipientIds = selectedCustomers.map(customer => Number(customer.id))
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
    throw createError({ statusCode: 500, message: 'Postgres не вернул запись отправки.' })
  }

  return {
    ...mapDispatchDbRowToRecord(dispatch),
    templateName: template.name
  }
})
