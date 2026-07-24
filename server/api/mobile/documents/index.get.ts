import { normalizePhone } from '../../../utils/auth'
import {
  isFrontlineMobileAccess,
  parseRequestedObjectId,
  requireMobileAccess,
  resolveScopedObjectIds
} from '../../../utils/mobile-access'
import { buildEqOrInFilter, encodeIn } from '../../../utils/postgrest'
import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import { isDispatchRecipient } from '../../documents/dispatch-visibility'
import type { AuthRole } from '~~/shared/types/auth'
import { getRoleLabel } from '~~/shared/utils/access'
import {
  getDataApiErrorData,
  mapDispatchDbRowToRecord,
  mapSignedDbRowToRecord,
  mapTemplateDbRowToRecord,
  renderDocumentTemplateCss,
  renderDocumentTemplateHtml,
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

interface ObjectLiteRow {
  id: number
  name: string
}

function resolvePositionToken(role: AuthRole) {
  const label = getRoleLabel(role)
  return label === 'Пользователь' ? role : label
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

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)
  const frontlineAccess = isFrontlineMobileAccess(access)
  // Менеджеры/супервайзеры — тоже customer, но не frontline. Им, как и рядовым
  // сотрудникам, документ может прийти лично (они в recipient_ids), поэтому для
  // всех customer-ролей матчим и по объекту, и по получателю. ERP-роли
  // (admin/hr) остаются на чистой фильтрации по объекту.
  const isCustomerAccess = Boolean(access.customer)
  const requestedObjectId = parseRequestedObjectId(getQuery(event).objectId)
  const objectIds = frontlineAccess
    ? access.objectIds
    : resolveScopedObjectIds(access, requestedObjectId)

  if (!objectIds.length && !isCustomerAccess) {
    return {
      role: access.role,
      frontend: access.frontend,
      objectIds: [],
      templates: [],
      dispatches: [],
      signed: [],
      documents: []
    }
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const objectIdsForFilter = requestedObjectId ? [requestedObjectId] : objectIds
  const objectFilter = objectIdsForFilter.length ? buildEqOrInFilter(objectIdsForFilter) : undefined

  // `access.customer.id` is a bigint → arrives as a string; coerce so the
  // `typeof === 'number'` / `.includes()` recipient checks below actually work.
  const customerId = Number(access.customer?.id)
  const rawPhone = (access.user.phone || '').trim()
  const currentPhone = normalizePhone(access.user.phone)
  const objectFilterForOr = objectIdsForFilter.length === 1
    ? `object_id.eq.${objectIdsForFilter[0]}`
    : objectIdsForFilter.length > 1
      ? `object_id.in.${encodeIn(objectIdsForFilter)}`
      : undefined

  const dispatchQuery: Record<string, string> = {
    select: 'id,object_id,template_id,title,recipient_ids,recipient_phones,recipient_count,signed_count,status,sent_at',
    order: 'id.desc'
  }

  if (isCustomerAccess) {
    const orFilters: string[] = []
    if (objectFilterForOr) {
      orFilters.push(objectFilterForOr)
    }
    if (Number.isInteger(customerId)) {
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
    if (objectFilter) {
      dispatchQuery.object_id = objectFilter
    }
  }

  const signedQuery: Record<string, string> = {
    select: 'id,object_id,dispatch_id,template_id,employee_name,phone_number,signed_at,signed_via,file_url,signature_path',
    order: 'signed_at.desc'
  }

  if (isCustomerAccess) {
    const orFilters: string[] = []
    if (objectFilterForOr) {
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
    if (objectFilter) {
      signedQuery.object_id = objectFilter
    }
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

  // `template_id`/`dispatch_id`/`object_id` are bigint columns, which
  // node-postgres returns as strings. Coerce before doing any numeric/Set
  // comparison, otherwise `Number.isInteger('5')` is false and ids silently
  // drop out (documents never show as signed, templates go missing, etc.).
  const templateIdsFromRows = new Set<number>()
  const collectTemplateId = (value: unknown, target: Set<number>) => {
    const id = Number(value)
    if (Number.isInteger(id) && id > 0) {
      target.add(id)
    }
  }
  dispatchRows.forEach(row => collectTemplateId(row.template_id, templateIdsFromRows))
  signedRows.forEach(row => collectTemplateId(row.template_id, templateIdsFromRows))

  const templateQuery: Record<string, string> = {
    select: 'id,object_id,name,description,contract_type,html,css,storage_path,created_at,updated_at',
    order: 'id.desc'
  }

  if (isCustomerAccess) {
    const orFilters: string[] = []
    if (objectFilterForOr) {
      orFilters.push(objectFilterForOr)
    }
    if (templateIdsFromRows.size) {
      orFilters.push(`id.in.${encodeIn(Array.from(templateIdsFromRows))}`)
    }
    if (orFilters.length) {
      templateQuery.or = `(${orFilters.join(',')})`
    }
  } else {
    if (objectFilter) {
      templateQuery.object_id = objectFilter
    }
  }

  const shouldFetchTemplates = Object.prototype.hasOwnProperty.call(templateQuery, 'or')
    || Object.prototype.hasOwnProperty.call(templateQuery, 'object_id')
  let templateRows: DocumentTemplateDbRow[] = []
  if (shouldFetchTemplates) {
    templateRows = await fetchRowsOrEmpty<DocumentTemplateDbRow>(() => $fetch<DocumentTemplateDbRow[]>(`${url}/rest/v1/document_templates`, {
      headers,
      query: templateQuery
    }))
  }

  const visibleDispatchRows = frontlineAccess
    ? dispatchRows.filter(row => isDispatchRecipient(row.recipient_ids, row.recipient_phones, customerId, rawPhone))
    : dispatchRows

  const visibleSignedRows = frontlineAccess
    ? signedRows.filter(row => normalizePhone(row.phone_number) === currentPhone)
    : signedRows

  const templateIds = new Set<number>()
  for (const row of visibleDispatchRows) {
    collectTemplateId(row.template_id, templateIds)
  }
  for (const row of visibleSignedRows) {
    collectTemplateId(row.template_id, templateIds)
  }

  const visibleTemplateRows = frontlineAccess
    ? templateRows.filter(row => templateIds.has(Number(row.id)))
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

  const objectIdsFromTemplates = Array.from(new Set(
    visibleTemplateRows
      .map(row => Number(row.object_id))
      .filter((objectId): objectId is number => Number.isInteger(objectId) && objectId > 0)
  ))

  let objectNameById = new Map<number, string>()
  if (isCustomerAccess && objectIdsFromTemplates.length) {
    const objects = await $fetch<ObjectLiteRow[]>(`${url}/rest/v1/objects`, {
      headers,
      query: {
        select: 'id,name',
        id: `in.${encodeIn(objectIdsFromTemplates)}`
      }
    })

    objectNameById = new Map(objects.map(object => [object.id, object.name]))
  }

  const baseTemplateVariables = isCustomerAccess
    ? {
        employee_name: access.user.name,
        phone: access.user.phone || '',
        position: resolvePositionToken(access.user.role),
        date: new Date().toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent' }),
        amount: ''
      }
    : null

  const templates = visibleTemplateRows.map((row) => {
    const record = mapTemplateDbRowToRecord(row)

    if (!isCustomerAccess || !baseTemplateVariables) {
      return record
    }

    const objectName = record.objectId ? objectNameById.get(record.objectId) : undefined
    const variables = {
      ...baseTemplateVariables,
      object_name: objectName || ''
    }

    return {
      ...record,
      html: renderDocumentTemplateHtml(record.html, variables),
      css: renderDocumentTemplateCss(record.css, variables)
    }
  })
  const templateNameById = new Map(templates.map(template => [template.id, template.name]))
  // «Подписано мной» — только записи с моим телефоном. Для менеджера
  // visibleSignedRows включает и чужие подписи по объекту, поэтому фильтруем.
  const ownSignedDispatchIds = new Set(
    visibleSignedRows
      .filter(row => normalizePhone(row.phone_number) === currentPhone)
      .map(row => Number(row.dispatch_id))
      .filter((dispatchId): dispatchId is number => Number.isInteger(dispatchId) && dispatchId > 0)
  )

  const dispatches = visibleDispatchRows
    .map(mapDispatchDbRowToRecord)
    .map((dispatch) => {
      // Я получатель, если мой id есть в recipient_ids или мой телефон — в
      // recipient_phones. Для frontline это всегда true (список уже сужен),
      // для менеджера — только по документам, адресованным лично ему.
      const isRecipient = isDispatchRecipient(
        dispatch.recipientIds,
        dispatch.recipientPhones,
        customerId,
        rawPhone
      )

      return {
        ...dispatch,
        templateName: dispatch.templateId ? templateNameById.get(dispatch.templateId) : undefined,
        recipients: dispatch.recipientIds
          .map(id => recipientMap.get(id))
          .filter(Boolean) as DispatchRecipient[],
        assignedToCurrentUser: isCustomerAccess ? isRecipient : false,
        signedByCurrentUser: ownSignedDispatchIds.has(Number(dispatch.id))
      }
    })

  const signed = visibleSignedRows
    .map(mapSignedDbRowToRecord)
    .map(item => ({
      ...item,
      templateName: item.templateId ? templateNameById.get(item.templateId) : undefined
    }))

  const documents = signed.map(item => ({
    id: item.id,
    dispatchId: item.dispatchId,
    templateId: item.templateId,
    templateName: item.templateName,
    fileUrl: item.fileUrl,
    signedAt: item.signedAt,
    signedVia: item.signedVia,
    employeeName: item.employeeName,
    phoneNumber: item.phoneNumber
  }))

  return {
    role: access.role,
    frontend: access.frontend,
    objectIds,
    templates,
    dispatches,
    signed,
    documents
  }
})
