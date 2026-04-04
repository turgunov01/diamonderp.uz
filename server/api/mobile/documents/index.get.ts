import { normalizePhone } from '../../../utils/auth'
import {
  isFrontlineMobileAccess,
  parseRequestedObjectId,
  requireMobileAccess,
  resolveScopedObjectIds
} from '../../../utils/mobile-access'
import { buildEqOrInFilter, encodeIn } from '../../../utils/postgrest'
import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../../utils/supabase'
import {
  getSupabaseErrorData,
  mapDispatchDbRowToRecord,
  mapSignedDbRowToRecord,
  mapTemplateDbRowToRecord,
  type DispatchRecipient,
  type DocumentDispatchDbRow,
  type DocumentTemplateDbRow,
  type SignedDocumentDbRow
} from '../../documents/documents'

interface RecipientLiteRow {
  id: number
  username: string
  phone_number: string
}

function isMissingTableError(error: unknown) {
  const data = getSupabaseErrorData(error)
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

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)
  const frontlineAccess = isFrontlineMobileAccess(access)
  const requestedObjectId = parseRequestedObjectId(getQuery(event).objectId)
  const objectIds = resolveScopedObjectIds(access, requestedObjectId)

  if (!objectIds.length) {
    return {
      role: access.role,
      frontend: access.frontend,
      objectIds: [],
      templates: [],
      dispatches: [],
      signed: []
    }
  }

  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)
  const objectFilter = buildEqOrInFilter(objectIds)

  const customerId = access.customer?.id
  const rawPhone = (access.user.phone || '').trim()
  const currentPhone = normalizePhone(access.user.phone)
  const objectFilterForOr = objectIds.length === 1
    ? `object_id.eq.${objectIds[0]}`
    : `object_id.in.${encodeIn(objectIds)}`

  const dispatchQuery: Record<string, string> = {
    select: 'id,object_id,template_id,title,recipient_ids,recipient_phones,recipient_count,signed_count,status,sent_at',
    order: 'id.desc'
  }

  if (frontlineAccess) {
    const orFilters: string[] = []
    if (objectIds.length) {
      orFilters.push(objectFilterForOr)
    }
    if (typeof customerId === 'number') {
      orFilters.push(`recipient_ids.cs.{${customerId}}`)
    }
    if (currentPhone) {
      orFilters.push(`recipient_phones.cs.{${currentPhone}}`)
    }
    if (rawPhone) {
      orFilters.push(`recipient_phones.cs.{${rawPhone}}`)
    }
    if (orFilters.length) {
      dispatchQuery.or = `(${orFilters.join(',')})`
    }
  } else {
    dispatchQuery.object_id = objectFilter
  }

  const signedQuery: Record<string, string> = {
    select: 'id,object_id,dispatch_id,template_id,employee_name,phone_number,signed_at,signed_via,file_url,signature_path',
    order: 'signed_at.desc'
  }

  if (frontlineAccess) {
    const orFilters: string[] = []
    if (objectIds.length) {
      orFilters.push(objectFilterForOr)
    }
    if (currentPhone) {
      orFilters.push(`phone_number.eq.${currentPhone}`)
    }
    if (rawPhone) {
      orFilters.push(`phone_number.eq.${rawPhone}`)
    }
    if (orFilters.length) {
      signedQuery.or = `(${orFilters.join(',')})`
    }
  } else {
    signedQuery.object_id = objectFilter
  }

  const [dispatchRows, signedRows] = await Promise.all([
    fetchRowsOrEmpty<DocumentDispatchDbRow>(() => $fetch<DocumentDispatchDbRow[]>(`${url}/rest/v1/document_dispatches`, {
      headers,
      query: dispatchQuery
    })),
    fetchRowsOrEmpty<SignedDocumentDbRow>(() => $fetch<SignedDocumentDbRow[]>(`${url}/rest/v1/signed_documents`, {
      headers,
      query: signedQuery
    }))
  ])

  const templateIdsFromRows = new Set<number>()
  dispatchRows.forEach(row => {
    if (Number.isInteger(row.template_id) && (row.template_id ?? 0) > 0) {
      templateIdsFromRows.add(row.template_id as number)
    }
  })
  signedRows.forEach(row => {
    if (Number.isInteger(row.template_id) && (row.template_id ?? 0) > 0) {
      templateIdsFromRows.add(row.template_id as number)
    }
  })

  const templateQuery: Record<string, string> = {
    select: 'id,object_id,name,description,contract_type,html,css,storage_path,created_at,updated_at',
    order: 'id.desc'
  }

  if (frontlineAccess) {
    const orFilters: string[] = []
    if (objectIds.length) {
      orFilters.push(objectFilterForOr)
    }
    if (templateIdsFromRows.size) {
      orFilters.push(`id.in.${encodeIn(Array.from(templateIdsFromRows))}`)
    }
    if (orFilters.length) {
      templateQuery.or = `(${orFilters.join(',')})`
    }
  } else {
    templateQuery.object_id = objectFilter
  }

  const templateRows = await fetchRowsOrEmpty<DocumentTemplateDbRow>(() => $fetch<DocumentTemplateDbRow[]>(`${url}/rest/v1/document_templates`, {
    headers,
    query: templateQuery
  }))

  const visibleDispatchRows = frontlineAccess
    ? dispatchRows.filter((row) => {
      const recipientIds = Array.isArray(row.recipient_ids) ? row.recipient_ids : []
      const recipientPhones = Array.isArray(row.recipient_phones) ? row.recipient_phones : []
      return (typeof customerId === 'number' && recipientIds.includes(customerId))
        || recipientPhones.some(phone => normalizePhone(phone) === currentPhone)
    })
    : dispatchRows

  const visibleSignedRows = frontlineAccess
    ? signedRows.filter(row => normalizePhone(row.phone_number) === currentPhone)
    : signedRows

  const templateIds = new Set<number>()
  for (const row of visibleDispatchRows) {
    if (Number.isInteger(row.template_id) && (row.template_id ?? 0) > 0) {
      templateIds.add(row.template_id as number)
    }
  }
  for (const row of visibleSignedRows) {
    if (Number.isInteger(row.template_id) && (row.template_id ?? 0) > 0) {
      templateIds.add(row.template_id as number)
    }
  }

  const visibleTemplateRows = frontlineAccess
    ? templateRows.filter(row => templateIds.has(row.id))
    : templateRows

  const allRecipientIds = Array.from(new Set(visibleDispatchRows.flatMap(row => row.recipient_ids || [])))
  let recipientMap = new Map<number, DispatchRecipient>()
  if (allRecipientIds.length) {
    const recipients = await fetchRowsOrEmpty<RecipientLiteRow>(() => $fetch<RecipientLiteRow[]>(`${url}/rest/v1/customers`, {
      headers,
      query: {
        select: 'id,username,phone_number',
        id: `in.${encodeIn(allRecipientIds)}`
      }
    }))

    recipientMap = new Map(recipients.map(recipient => [recipient.id, {
      id: recipient.id,
      username: recipient.username,
      phoneNumber: recipient.phone_number
    }]))
  }

  const templates = visibleTemplateRows.map(mapTemplateDbRowToRecord)
  const templateNameById = new Map(templates.map(template => [template.id, template.name]))
  const signedByDispatchId = new Set(
    visibleSignedRows
      .map(row => row.dispatch_id)
      .filter((dispatchId): dispatchId is number => typeof dispatchId === 'number' && Number.isInteger(dispatchId) && dispatchId > 0)
  )

  const dispatches = visibleDispatchRows
    .map(mapDispatchDbRowToRecord)
    .map(dispatch => ({
      ...dispatch,
      templateName: dispatch.templateId ? templateNameById.get(dispatch.templateId) : undefined,
      recipients: dispatch.recipientIds
        .map(id => recipientMap.get(id))
        .filter(Boolean) as DispatchRecipient[],
      assignedToCurrentUser: frontlineAccess,
      signedByCurrentUser: signedByDispatchId.has(dispatch.id)
    }))

  const signed = visibleSignedRows
    .map(mapSignedDbRowToRecord)
    .map(item => ({
      ...item,
      templateName: item.templateId ? templateNameById.get(item.templateId) : undefined
    }))

  return {
    role: access.role,
    frontend: access.frontend,
    objectIds,
    templates,
    dispatches,
    signed
  }
})
