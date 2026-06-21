import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import {
  getDataApiErrorData,
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
    throw createError({ statusCode: 400, statusMessage: 'РўРµР»Рѕ Р·Р°РїСЂРѕСЃР° РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РєРѕСЂСЂРµРєС‚РЅС‹Рј РѕР±СЉРµРєС‚РѕРј.' })
  }

  const input = body as Partial<SendDocumentBody>
  const templateId = Number(input.templateId)

  if (!Number.isInteger(templateId) || templateId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ templateId РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РїРѕР»РѕР¶РёС‚РµР»СЊРЅС‹Рј С†РµР»С‹Рј С‡РёСЃР»РѕРј.' })
  }

  if (!Array.isArray(input.recipientIds) || !input.recipientIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ recipientIds РґРѕР»Р¶РЅРѕ СЃРѕРґРµСЂР¶Р°С‚СЊ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ id РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.' })
  }

  const recipientIds = input.recipientIds
    .map(id => Number(id))
    .filter(id => Number.isInteger(id) && id > 0)

  if (!recipientIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'РџРѕР»Рµ recipientIds РґРѕР»Р¶РЅРѕ СЃРѕРґРµСЂР¶Р°С‚СЊ РєРѕСЂСЂРµРєС‚РЅС‹Рµ РїРѕР»РѕР¶РёС‚РµР»СЊРЅС‹Рµ С†РµР»С‹Рµ С‡РёСЃР»Р°.' })
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
        statusMessage: 'РўР°Р±Р»РёС†Р° "document_templates" РѕС‚СЃСѓС‚СЃС‚РІСѓРµС‚. РЎРЅР°С‡Р°Р»Р° РІС‹РїРѕР»РЅРёС‚Рµ db/postgres/documents.sql.'
      })
    }

    throw error
  }

  const template = templateRows[0]
  if (!template) {
    throw createError({ statusCode: 404, statusMessage: 'РЁР°Р±Р»РѕРЅ РЅРµ РЅР°Р№РґРµРЅ.' })
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
    throw createError({ statusCode: 404, statusMessage: 'РћР±СЉРµРєС‚ РЅРµ РЅР°Р№РґРµРЅ.' })
  }

  const customers = await $fetch<CustomerLiteRow[]>(`${url}/rest/v1/customers`, {
    headers,
    query: {
      select: 'id,username,phone_number,building_id,object_pinned,object_positions',
      id: `in.${encodePostgrestIn(payload.recipientIds)}`,
      ...(currentObject.building_id
        ? { or: `(building_id.eq.${currentObject.building_id},building_id.is.null)` }
        : {}),
      order: 'id.asc'
    }
  })

  const selectedCustomers = customers

  if (!selectedCustomers.length) {
    throw createError({ statusCode: 404, statusMessage: 'РџРѕР»СѓС‡Р°С‚РµР»Рё РґР»СЏ СЌС‚РѕРіРѕ РѕР±СЉРµРєС‚Р° РЅРµ РЅР°Р№РґРµРЅС‹.' })
  }

  const foundIds = new Set(selectedCustomers.map(customer => customer.id))
  const missingIds = payload.recipientIds.filter(id => !foundIds.has(id))
  if (missingIds.length) {
    throw createError({
      statusCode: 404,
      statusMessage: `РќРµ СѓРґР°Р»РѕСЃСЊ РЅР°Р№С‚Рё РІСЃРµС… РїРѕР»СѓС‡Р°С‚РµР»РµР№: ${missingIds.join(', ')}.`
    })
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
    throw createError({ statusCode: 500, statusMessage: 'Postgres РЅРµ РІРµСЂРЅСѓР» Р·Р°РїРёСЃСЊ РѕС‚РїСЂР°РІРєРё.' })
  }

  return {
    ...mapDispatchDbRowToRecord(dispatch),
    templateName: template.name
  }
})
