import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import {
  getDataApiErrorData,
  mapDispatchDbRowToRecord,
  mapSignedDbRowToRecord,
  mapTemplateDbRowToRecord,
  parseObjectIdInput,
  type DocumentDispatchDbRow,
  type DocumentDispatchRecord,
  type DocumentTemplateDbRow,
  type DocumentTemplateRecord,
  type SignedDocumentDbRow,
  type SignedDocumentRecord,
  type DispatchRecipient
} from './documents'

interface DocumentsResponse {
  templates: DocumentTemplateRecord[]
  sent: DocumentDispatchRecord[]
  signed: SignedDocumentRecord[]
}

interface RecipientLiteRow {
  id: number
  username: string
  phone_number: string
}

function isMissingTableError(error: unknown) {
  const data = getDataApiErrorData(error)
  return data?.code === '42P01'
}

async function fetchRowsOrEmpty<T>(request: () => Promise<T[]>) {
  try {
    return await request()
  } catch (error: unknown) {
    if (isMissingTableError(error)) {
      return []
    }
    throw error
  }
}

function encodeIn(values: number[]) {
  return `(${values.join(',')})`
}

export default eventHandler(async (event): Promise<DocumentsResponse> => {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)
  const objectId = parseObjectIdInput(getQuery(event).objectId, 'objectId query param is required.')

  const [templateRows, dispatchRows, signedRows] = await Promise.all([
    fetchRowsOrEmpty<DocumentTemplateDbRow>(() => $fetch<DocumentTemplateDbRow[]>(`${url}/rest/v1/document_templates`, {
      headers,
      query: {
        select: 'id,object_id,name,description,contract_type,html,css,storage_path,created_at,updated_at',
        object_id: `eq.${objectId}`,
        order: 'id.desc'
      }
    })),
    fetchRowsOrEmpty<DocumentDispatchDbRow>(() => $fetch<DocumentDispatchDbRow[]>(`${url}/rest/v1/document_dispatches`, {
      headers,
      query: {
        select: 'id,object_id,template_id,title,recipient_ids,recipient_phones,recipient_count,signed_count,status,sent_at',
        object_id: `eq.${objectId}`,
        order: 'id.desc'
      }
    })),
    fetchRowsOrEmpty<SignedDocumentDbRow>(() => $fetch<SignedDocumentDbRow[]>(`${url}/rest/v1/signed_documents`, {
      headers,
      query: {
        select: 'id,object_id,dispatch_id,template_id,employee_name,phone_number,signed_at,signed_via,file_url,signature_path',
        object_id: `eq.${objectId}`,
        order: 'signed_at.desc'
      }
    }))
  ])

  const allRecipientIds = Array.from(new Set(dispatchRows.flatMap(row => row.recipient_ids || [])))
  let recipientMap = new Map<number, DispatchRecipient>()
  if (allRecipientIds.length) {
    const recipients = await fetchRowsOrEmpty<RecipientLiteRow>(() => $fetch<RecipientLiteRow[]>(`${url}/rest/v1/customers`, {
      headers,
      query: {
        select: 'id,username,phone_number',
        id: `in.${encodeIn(allRecipientIds)}`
      }
    }))

    recipientMap = new Map(recipients.map(r => [r.id, {
      id: r.id,
      username: r.username,
      phoneNumber: r.phone_number
    } satisfies DispatchRecipient]))
  }

  const templates = templateRows.map(mapTemplateDbRowToRecord)
  const templateNameById = new Map(templates.map(template => [template.id, template.name]))

  const sent = dispatchRows
    .map(mapDispatchDbRowToRecord)
    .map(dispatch => ({
      ...dispatch,
      templateName: dispatch.templateId ? templateNameById.get(dispatch.templateId) : undefined,
      recipients: dispatch.recipientIds
        .map(id => recipientMap.get(id))
        .filter(Boolean) as DispatchRecipient[]
    }))

  const signed = signedRows
    .map(mapSignedDbRowToRecord)
    .map(item => ({
      ...item,
      templateName: item.templateId ? templateNameById.get(item.templateId) : undefined
    }))

  return {
    templates,
    sent,
    signed
  }
})
