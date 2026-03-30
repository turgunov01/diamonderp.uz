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
import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../../utils/supabase'

interface MobileSignBody {
  dispatchId: number
  templateId: number
  signatureImage: string
  signatureJson?: unknown
  consentChecked?: boolean
  userAgent?: string
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

function parseBody(body: unknown): MobileSignBody {
  if (!body || typeof body !== 'object') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request body must be an object.'
    })
  }

  const input = body as Record<string, unknown>
  const signatureImage = typeof input.signatureImage === 'string' ? input.signatureImage.trim() : ''
  if (!signatureImage) {
    throw createError({
      statusCode: 400,
      statusMessage: 'signatureImage is required.'
    })
  }

  return {
    dispatchId: parseNumberField(input.dispatchId, 'dispatchId'),
    templateId: parseNumberField(input.templateId, 'templateId'),
    signatureImage,
    signatureJson: input.signatureJson,
    consentChecked: Boolean(input.consentChecked),
    userAgent: typeof input.userAgent === 'string' ? input.userAgent : undefined
  }
}

function toBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/)
  if (match) {
    const contentType = match[1]
    const base64 = match[2]
    return {
      contentType: contentType || 'image/jpeg',
      buffer: Buffer.from(base64 || '', 'base64')
    }
  }

  return {
    contentType: 'image/jpeg',
    buffer: Buffer.from(dataUrl, 'base64')
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

  const payload = parseBody(await readBody(event))
  const { url, serviceRoleKey, documentSignatureBucket } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)

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
      template_id: `eq.${payload.templateId}`,
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

  if (!dispatch.object_id || !access.objectIds.includes(dispatch.object_id)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Dispatch object access denied.'
    })
  }

  const currentPhone = normalizePhone(access.user.phone)
  const assignedToCurrentUser = (dispatch.recipient_ids || []).includes(access.customer.id)
    || (dispatch.recipient_phones || []).some(phone => normalizePhone(phone) === currentPhone)

  if (!assignedToCurrentUser) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Dispatch is not assigned to the current user.'
    })
  }

  const existingSignedRows = await $fetch<SignedDocumentDbRow[]>(`${url}/rest/v1/signed_documents`, {
    headers,
    query: {
      select: 'id,object_id,dispatch_id,template_id,employee_name,phone_number,signed_at,signed_via,file_url,signature_path',
      dispatch_id: `eq.${payload.dispatchId}`,
      template_id: `eq.${payload.templateId}`,
      phone_number: `eq.${access.user.phone}`,
      limit: '1'
    }
  })

  if (existingSignedRows[0]) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This document is already signed by the current user.'
    })
  }

  const { buffer, contentType } = toBuffer(payload.signatureImage)
  const safeName = sanitizePathSegment(access.user.name || 'employee')
  const stamp = Date.now()
  const signaturePath = `${safeName}/${payload.templateId}-${payload.dispatchId}-${stamp}.jpg`

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
      template_id: payload.templateId,
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
