import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../../utils/data-api'
import { encodeStoragePath, parseObjectIdInput, type SignedDocumentDbRow } from '../../documents'

interface StorageSignedUrlResponse {
  signedURL?: string
  signedUrl?: string
}

function normalizeSignedUrl(baseUrl: string, value: string) {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value
  }

  if (value.startsWith('/object/')) {
    return `${baseUrl}/storage/v1${value}`
  }

  if (value.startsWith('object/')) {
    return `${baseUrl}/storage/v1/${value}`
  }

  if (value.startsWith('/')) {
    return `${baseUrl}${value}`
  }

  if (value.startsWith('storage/v1/')) {
    return `${baseUrl}/${value}`
  }

  return `${baseUrl}/${value}`
}

function inferSignaturePathFromFileUrl(options: {
  signatureBucket: string
  fileUrl?: string | null
}) {
  const fileUrl = options.fileUrl?.trim()
  if (!fileUrl) return null

  const bucketMarker = `/storage/v1/object/${options.signatureBucket}/`
  const index = fileUrl.indexOf(bucketMarker)
  if (index === -1) return null

  const raw = fileUrl.slice(index + bucketMarker.length)
  return raw ? decodeURIComponent(raw) : null
}

export default eventHandler(async (event) => {
  const idRaw = getRouterParam(event, 'id')
  const signedId = Number(idRaw)
  if (!idRaw || !Number.isInteger(signedId) || signedId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный id подписанного документа.' })
  }

  const objectId = parseObjectIdInput(getQuery(event).objectId, 'objectId query param is required.')

  const { url, serviceRoleKey, documentSignatureBucket } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  const rows = await $fetch<SignedDocumentDbRow[]>(`${url}/rest/v1/signed_documents`, {
    headers,
    query: {
      select: 'id,object_id,signature_path,file_url',
      id: `eq.${signedId}`,
      object_id: `eq.${objectId}`,
      limit: '1'
    }
  })

  const row = rows[0]
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Подписанный документ не найден.' })
  }

  const signaturePath = row.signature_path
    || inferSignaturePathFromFileUrl({ signatureBucket: documentSignatureBucket, fileUrl: row.file_url })

  if (!signaturePath) {
    throw createError({ statusCode: 404, statusMessage: 'Подпись для этого документа не найдена.' })
  }

  const signedUrlResponse = await $fetch<StorageSignedUrlResponse>(
    `${url}/storage/v1/object/sign/${documentSignatureBucket}/${encodeStoragePath(signaturePath)}`,
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: {
        expiresIn: 60 * 10
      }
    }
  )

  const signedUrl = signedUrlResponse.signedURL || signedUrlResponse.signedUrl
  if (!signedUrl) {
    throw createError({ statusCode: 500, statusMessage: 'Не удалось сформировать ссылку на подпись.' })
  }

  setHeader(event, 'Cache-Control', 'no-store')

  return {
    url: normalizeSignedUrl(url, signedUrl)
  }
})
