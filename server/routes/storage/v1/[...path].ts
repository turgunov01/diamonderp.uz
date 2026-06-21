import { assertInternalApiRequest } from '../../../utils/internal-api'
import {
  createStorageSignedToken,
  ensureLocalBucket,
  getLocalBucketMetadata,
  readLocalStorageObject,
  verifyStorageSignedToken,
  writeLocalStorageObject
} from '../../../utils/local-storage'
import type { H3Event } from 'h3'

function getPathSegments(event: H3Event) {
  const raw = getRouterParam(event, 'path') || ''

  return raw.split('/').filter(Boolean)
}

function encodeObjectPath(path: string) {
  return path.split('/').map(part => encodeURIComponent(part)).join('/')
}

async function handleBucketPost(event: H3Event) {
  assertInternalApiRequest(event)
  const body = await readBody<{ id?: string, name?: string, public?: boolean }>(event)
  const bucket = body?.id || body?.name

  if (!bucket) {
    throw createError({ statusCode: 400, statusMessage: 'Bucket id is required.' })
  }

  await ensureLocalBucket(bucket, body.public === true)

  return {
    id: bucket,
    name: bucket,
    public: body.public === true
  }
}

async function handleObjectUpload(event: H3Event, bucket: string, objectPath: string) {
  assertInternalApiRequest(event)

  const raw = await readRawBody(event, false)
  await writeLocalStorageObject({
    bucket,
    path: objectPath,
    data: raw ? Buffer.from(raw) : Buffer.alloc(0),
    contentType: getHeader(event, 'content-type') || 'application/octet-stream'
  })

  return {
    Key: `${bucket}/${objectPath}`
  }
}

async function handleObjectDownload(event: H3Event, bucket: string, objectPath: string, isPublic: boolean) {
  if (isPublic) {
    const metadata = await getLocalBucketMetadata(bucket)
    if (!metadata.public) {
      throw createError({ statusCode: 403, statusMessage: 'Bucket is not public.' })
    }
  } else {
    const token = getQuery(event).token
    const signedToken = typeof token === 'string' ? token : undefined
    if (!verifyStorageSignedToken(bucket, objectPath, signedToken)) {
      assertInternalApiRequest(event)
    }
  }

  const object = await readLocalStorageObject(bucket, objectPath)
  setHeader(event, 'content-type', object.contentType)
  setHeader(event, 'content-length', object.size)

  return object.data
}

async function handleObjectSign(event: H3Event, bucket: string, objectPath: string) {
  assertInternalApiRequest(event)
  const body = await readBody<{ expiresIn?: number }>(event).catch(() => undefined)
  const expiresIn = Number(body?.expiresIn || 600)
  const token = createStorageSignedToken(bucket, objectPath, Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 600)
  const signedURL = `/object/${bucket}/${encodeObjectPath(objectPath)}?token=${encodeURIComponent(token)}`

  return {
    signedURL,
    signedUrl: signedURL
  }
}

export default eventHandler(async (event) => {
  const method = event.node.req.method || 'GET'
  const segments = getPathSegments(event)

  if (segments[0] === 'bucket' && method === 'POST') {
    return await handleBucketPost(event)
  }

  if (segments[0] !== 'object') {
    throw createError({ statusCode: 404, statusMessage: 'Storage route not found.' })
  }

  const isPublic = segments[1] === 'public'
  const isSign = segments[1] === 'sign'
  const bucketIndex = isPublic || isSign ? 2 : 1
  const bucket = segments[bucketIndex]
  const objectPath = segments.slice(bucketIndex + 1).join('/')

  if (!bucket || !objectPath) {
    throw createError({ statusCode: 400, statusMessage: 'Bucket and object path are required.' })
  }

  if (method === 'POST' && isSign) {
    return await handleObjectSign(event, bucket, objectPath)
  }

  if (method === 'POST' && !isPublic && !isSign) {
    return await handleObjectUpload(event, bucket, objectPath)
  }

  if (method === 'GET' && !isSign) {
    return await handleObjectDownload(event, bucket, objectPath, isPublic)
  }

  throw createError({ statusCode: 405, statusMessage: `Method ${method} is not supported.` })
})
