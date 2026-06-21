import {
  encodeStoragePath,
  ensureStorageBucket,
  mapSignedDbRowToRecord,
  sanitizePathSegment,
  uploadStorageObject,
  type DocumentDispatchDbRow,
  type SignedDocumentDbRow
} from '../../documents/documents'
import { normalizePhone } from '../../../utils/auth'
import { isFrontlineMobileAccess, requireMobileAccess } from '../../../utils/mobile-access'
import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import { getHeader, readBody, readMultipartFormData } from 'h3'
import type { H3Event } from 'h3'

interface MobileSignBody {
  dispatchId: number
  templateId?: number | null
  signatureImage: string
  signatureFileBuffer?: Buffer
  signatureFileType?: string
  signatureJson?: unknown
  consentChecked?: boolean
  userAgent?: string
  rawPhone?: string
}

function parseNumberField(value: unknown, fieldName: string) {
  const num = Number(value)
  if (!Number.isInteger(num) || num <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `${fieldName} is required.`
    })
  }

  return num
}

function parseJsonBody(body: unknown): MobileSignBody {
  if (!body || typeof body !== 'object') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request body must be an object.'
    })
  }

  const input = body as Record<string, unknown>
  const signatureImage = [
    input.signatureImage,
    input.signature,
    input.photo,
    input.image
  ].find(value => typeof value === 'string' && value.trim().length) as string | undefined
  if (!signatureImage) {
    throw createError({
      statusCode: 400,
      statusMessage: 'signatureImage (or signature/photo/image) is required.'
    })
  }

  const dispatchId = parseNumberField(input.dispatchId ?? input.documentId, 'documentId')
  const templateId = input.templateId !== undefined ? parseNumberField(input.templateId, 'templateId') : undefined

  return {
    dispatchId,
    templateId,
    signatureImage: signatureImage.trim(),
    signatureJson: input.signatureJson,
    consentChecked: Boolean(input.consentChecked),
    userAgent: typeof input.userAgent === 'string' ? input.userAgent : undefined,
    rawPhone: typeof input.phone === 'string' ? input.phone.trim() : undefined
  }
}

async function parseMultipartBody(event: H3Event): Promise<MobileSignBody> {
  const parts = await readMultipartFormData(event)
  if (!parts) {
    throw createError({ statusCode: 400, statusMessage: 'Malformed multipart data.' })
  }

  const fields: Record<string, string> = {}
  let fileBuffer: Buffer | undefined
  let fileType: string | undefined

  for (const part of parts) {
    if (part.name && part.data && (part.type === 'file' || part.filename)) {
      if (!fileBuffer) {
        fileBuffer = part.data
        const partWithMime = part as { mimetype?: unknown }
        const mimeType = typeof partWithMime.mimetype === 'string' ? partWithMime.mimetype : undefined
        fileType = (part.type && part.type !== 'file') ? part.type : (mimeType || 'application/octet-stream')
      }
      continue
    }

    if (part.name && part.data) {
      fields[part.name] = part.data.toString('utf8')
    }
  }

  const signatureImage = [
    fields.signatureImage,
    fields.signature,
    fields.photo,
    fields.image
  ].find(value => typeof value === 'string' && value.trim().length) as string | undefined

  if (!fileBuffer && !signatureImage) {
    throw createError({
      statusCode: 400,
      statusMessage: 'signatureImage (file or base64) is required.'
    })
  }

  const dispatchId = parseNumberField(fields.dispatchId ?? fields.documentId, 'documentId')
  const templateId = fields.templateId !== undefined && fields.templateId !== ''
    ? parseNumberField(fields.templateId, 'templateId')
    : undefined

  let signatureJson: unknown = fields.signatureJson
  if (typeof fields.signatureJson === 'string') {
    try {
      signatureJson = JSON.parse(fields.signatureJson)
    } catch {
      // leave as raw string
    }
  }

  return {
    dispatchId,
    templateId,
    signatureImage: signatureImage?.trim() || '',
    signatureFileBuffer: fileBuffer,
    signatureFileType: fileType,
    signatureJson,
    consentChecked: fields.consentChecked === 'true' || fields.consentChecked === '1',
    userAgent: fields.userAgent,
    rawPhone: fields.phone?.trim()
  }
}

async function parsePayload(event: H3Event): Promise<MobileSignBody> {
  const contentType = (getHeader(event, 'content-type') || '').toLowerCase()
  if (contentType.includes('multipart/form-data')) {
    return await parseMultipartBody(event)
  }

  const body = await readBody(event)
  return parseJsonBody(body)
}

function toBuffer(data: string | Buffer, contentTypeHint?: string) {
  if (Buffer.isBuffer(data)) {
    return {
      contentType: contentTypeHint || 'image/jpeg',
      buffer: data
    }
  }

  const match = data.match(/^data:(.+);base64,(.+)$/)
  if (match) {
    const contentType = match[1]
    const base64 = match[2]
    return {
      contentType: contentType || contentTypeHint || 'image/jpeg',
      buffer: Buffer.from(base64 || '', 'base64')
    }
  }

  return {
    contentType: contentTypeHint || 'image/jpeg',
    buffer: Buffer.from(data, 'base64')
  }
}

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)
  if (!isFrontlineMobileAccess(access) || !access.user.phone) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only employee accounts can sign mobile documents.'
    })
  }

  const payload = await parsePayload(event)
  const { url, serviceRoleKey, documentSignatureBucket } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  await ensureStorageBucket({
    url,
    serviceRoleKey,
    bucket: documentSignatureBucket,
    isPublic: false,
    missingErrorMessage: `Failed to prepare bucket ${documentSignatureBucket}.`
  })

  const dispatchRows = await $fetch<DocumentDispatchDbRow[]>(`${url}/rest/v1/document_dispatches`, {
    headers,
    query: {
      select: 'id,object_id,template_id,title,recipient_ids,recipient_phones,recipient_count,signed_count,status,sent_at',
      id: `eq.${payload.dispatchId}`,
      ...(payload.templateId ? { template_id: `eq.${payload.templateId}` } : {}),
      limit: '1'
    }
  })

  const dispatch = dispatchRows[0]
  if (!dispatch) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Document dispatch not found.'
    })
  }

  const resolvedTemplateId = payload.templateId ?? dispatch.template_id
  if (!Number.isInteger(resolvedTemplateId) || (resolvedTemplateId ?? 0) <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'templateId is missing for this dispatch.'
    })
  }

  const currentPhone = normalizePhone(access.user.phone)
  const assignedToCurrentUser = (dispatch.recipient_ids || []).includes(access.customer.id)
    || (dispatch.recipient_phones || []).some(phone => normalizePhone(phone) === currentPhone)

  if (!dispatch.object_id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Dispatch object is missing.'
    })
  }

  if (!assignedToCurrentUser) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Dispatch is not assigned to the current user.'
    })
  }

  const phoneFilters: Record<string, string> = {
    dispatch_id: `eq.${payload.dispatchId}`,
    template_id: `eq.${resolvedTemplateId}`,
    phone_number: `eq.${access.user.phone}`,
    limit: '1'
  }

  const existingSignedRows = await $fetch<SignedDocumentDbRow[]>(`${url}/rest/v1/signed_documents`, {
    headers,
    query: {
      select: 'id,object_id,dispatch_id,template_id,employee_name,phone_number,signed_at,signed_via,file_url,signature_path',
      ...phoneFilters
    }
  })

  if (existingSignedRows[0]) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This document is already signed by the current user.'
    })
  }

  if (!payload.signatureFileBuffer && !payload.signatureImage) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Signature payload is missing.'
    })
  }

  const { buffer, contentType } = toBuffer(
    payload.signatureFileBuffer ?? payload.signatureImage,
    payload.signatureFileType
  )
  const safeName = sanitizePathSegment(access.user.name || 'employee')
  const stamp = Date.now()
  const signaturePath = `${safeName}/${resolvedTemplateId}-${payload.dispatchId}-${stamp}.jpg`

  await uploadStorageObject({
    url,
    serviceRoleKey,
    bucket: documentSignatureBucket,
    path: signaturePath,
    data: buffer,
    contentType: contentType || 'image/jpeg',
    uploadErrorMessage: 'Failed to upload signature.'
  })

  const signatureUrl = `${url}/storage/v1/object/${documentSignatureBucket}/${encodeStoragePath(signaturePath)}`

  const insertedRows = await $fetch<SignedDocumentDbRow[]>(`${url}/rest/v1/signed_documents`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    body: {
      object_id: dispatch.object_id,
      dispatch_id: payload.dispatchId,
      template_id: resolvedTemplateId,
      employee_name: access.user.name,
      phone_number: access.user.phone,
      signed_via: 'mobile',
      file_url: signatureUrl,
      signature_path: signaturePath,
      signature_json: payload.signatureJson ?? null,
      consent_checked: payload.consentChecked ?? false,
      user_agent: payload.userAgent ?? null
    }
  })

  const signed = insertedRows[0]
  if (!signed) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to persist signed document.'
    })
  }

  const newSignedCount = (dispatch.signed_count || 0) + 1
  const newStatus = newSignedCount >= (dispatch.recipient_count || 0) ? 'signed' : 'partially_signed'

  await $fetch(`${url}/rest/v1/document_dispatches?id=eq.${dispatch.id}`, {
    method: 'PATCH',
    headers,
    body: {
      signed_count: newSignedCount,
      status: newStatus
    }
  })

  return {
    ...mapSignedDbRowToRecord(signed),
    dispatchStatus: newStatus,
    signedCount: newSignedCount
  }
})
