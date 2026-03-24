import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import {
  ensureStorageBucket,
  getSupabaseErrorData,
  mapSignedDbRowToRecord,
  sanitizePathSegment,
  encodeStoragePath,
  uploadStorageObject,
  type DocumentDispatchDbRow,
  type SignedDocumentDbRow
} from './documents'

interface SignBody {
  dispatchId: number
  templateId: number
  employeeName: string
  phoneNumber: string
  signatureImage: string // base64 or data URL
  signatureJson?: unknown
  consentChecked?: boolean
  userAgent?: string
}

function parseNumberField(value: unknown, field: string) {
  const num = Number(value)
  if (!Number.isInteger(num) || num <= 0) {
    throw createError({ statusCode: 400, statusMessage: `${field} обязателен.` })
  }
  return num
}

function parseBody(body: unknown): SignBody {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Тело запроса должно быть объектом.' })
  }

  const input = body as Record<string, unknown>
  const employeeName = typeof input.employeeName === 'string' ? input.employeeName.trim() : ''
  const phoneNumber = typeof input.phoneNumber === 'string' ? input.phoneNumber.trim() : ''
  const signatureImage = typeof input.signatureImage === 'string' ? input.signatureImage.trim() : ''

  if (!employeeName) {
    throw createError({ statusCode: 400, statusMessage: 'employeeName обязателен.' })
  }
  if (!phoneNumber) {
    throw createError({ statusCode: 400, statusMessage: 'phoneNumber обязателен.' })
  }
  if (!signatureImage) {
    throw createError({ statusCode: 400, statusMessage: 'signatureImage обязателен.' })
  }

  return {
    dispatchId: parseNumberField(input.dispatchId, 'dispatchId'),
    templateId: parseNumberField(input.templateId, 'templateId'),
    employeeName,
    phoneNumber,
    signatureImage,
    signatureJson: input.signatureJson,
    consentChecked: Boolean(input.consentChecked),
    userAgent: typeof input.userAgent === 'string' ? input.userAgent : undefined
  }
}

function toBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/)
  if (match) {
    return {
      contentType: match[1],
      buffer: Buffer.from(match[2], 'base64')
    }
  }
  // plain base64 without data url
  return {
    contentType: 'image/jpeg',
    buffer: Buffer.from(dataUrl, 'base64')
  }
}

export default eventHandler(async (event) => {
  const payload = parseBody(await readBody(event))
  const { url, serviceRoleKey, documentSignatureBucket } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)

  await ensureStorageBucket({
    url,
    serviceRoleKey,
    bucket: documentSignatureBucket,
    isPublic: false,
    missingErrorMessage: `Не удалось подготовить бакет "${documentSignatureBucket}".`
  })

  const dispatchRows = await $fetch<DocumentDispatchDbRow[]>(`${url}/rest/v1/document_dispatches`, {
    headers,
    query: {
      select: 'id,template_id,recipient_count,signed_count,status',
      id: `eq.${payload.dispatchId}`,
      template_id: `eq.${payload.templateId}`,
      limit: 1
    }
  })

  const dispatch = dispatchRows[0]
  if (!dispatch) {
    throw createError({ statusCode: 404, statusMessage: 'Отправка договора не найдена.' })
  }

  const { buffer, contentType } = toBuffer(payload.signatureImage)
  const safeName = sanitizePathSegment(payload.employeeName || 'employee')
  const stamp = Date.now()
  const signaturePath = `${safeName}/${payload.templateId}-${payload.dispatchId}-${stamp}.jpg`

  await uploadStorageObject({
    url,
    serviceRoleKey,
    bucket: documentSignatureBucket,
    path: signaturePath,
    data: buffer,
    contentType: contentType || 'image/jpeg',
    uploadErrorMessage: 'Не удалось сохранить подпись.'
  })

  const signatureUrl = `${url}/storage/v1/object/${documentSignatureBucket}/${encodeStoragePath(signaturePath)}`

  const inserted = await $fetch<SignedDocumentDbRow[]>(`${url}/rest/v1/signed_documents`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    body: {
      object_id: null,
      dispatch_id: payload.dispatchId,
      template_id: payload.templateId,
      employee_name: payload.employeeName,
      phone_number: payload.phoneNumber,
      signed_via: 'web',
      file_url: signatureUrl,
      signature_path: signaturePath,
      signature_json: payload.signatureJson ?? null,
      consent_checked: payload.consentChecked ?? false,
      user_agent: payload.userAgent ?? null
    }
  })

  const signed = inserted[0]
  if (!signed) {
    throw createError({ statusCode: 500, statusMessage: 'Не удалось сохранить подпись.' })
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

  return mapSignedDbRowToRecord(signed)
})
