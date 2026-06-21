import { createHmac, timingSafeEqual } from 'node:crypto'
import { constants } from 'node:fs'
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { getInternalApiSecret } from './internal-api'

interface BucketMetadata {
  public: boolean
}

const DEFAULT_STORAGE_ROOT = '.data/storage'

function getStorageRoot() {
  const config = useRuntimeConfig()
  const configured = config.storage?.root || process.env.STORAGE_ROOT || DEFAULT_STORAGE_ROOT

  return resolve(process.cwd(), configured)
}

function assertSafeSegment(value: string, label: string) {
  if (!value || value === '.' || value === '..' || value.includes('\\') || value.includes('/')) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label}.` })
  }
}

export function resolveStorageObjectPath(bucket: string, objectPath: string) {
  assertSafeSegment(bucket, 'bucket')

  const parts = objectPath
    .split('/')
    .map(part => decodeURIComponent(part))
    .filter(Boolean)

  for (const part of parts) {
    assertSafeSegment(part, 'object path')
  }

  const bucketRoot = resolve(getStorageRoot(), bucket)
  const filePath = resolve(bucketRoot, ...parts)

  if (filePath !== bucketRoot && !filePath.startsWith(`${bucketRoot}\\`) && !filePath.startsWith(`${bucketRoot}/`)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid object path.' })
  }

  return {
    bucketRoot,
    filePath
  }
}

function getBucketMetadataPath(bucket: string) {
  const { bucketRoot } = resolveStorageObjectPath(bucket, 'metadata')

  return resolve(bucketRoot, '.bucket.json')
}

function getObjectMetadataPath(filePath: string) {
  return `${filePath}.meta.json`
}

export async function ensureLocalBucket(bucket: string, isPublic: boolean) {
  const { bucketRoot } = resolveStorageObjectPath(bucket, 'metadata')
  await mkdir(bucketRoot, { recursive: true })
  await writeFile(getBucketMetadataPath(bucket), JSON.stringify({ public: isPublic }, null, 2), 'utf8')
}

export async function getLocalBucketMetadata(bucket: string): Promise<BucketMetadata> {
  try {
    const raw = await readFile(getBucketMetadataPath(bucket), 'utf8')
    const parsed = JSON.parse(raw) as Partial<BucketMetadata>

    return {
      public: parsed.public === true
    }
  } catch {
    return { public: false }
  }
}

export async function writeLocalStorageObject(options: {
  bucket: string
  path: string
  data: Buffer
  contentType: string
}) {
  const { filePath } = resolveStorageObjectPath(options.bucket, options.path)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, options.data)
  await writeFile(getObjectMetadataPath(filePath), JSON.stringify({ contentType: options.contentType }, null, 2), 'utf8')
}

export async function readLocalStorageObject(bucket: string, objectPath: string) {
  const { filePath } = resolveStorageObjectPath(bucket, objectPath)
  await access(filePath, constants.R_OK)
  const [data, metadataRaw] = await Promise.all([
    readFile(filePath),
    readFile(getObjectMetadataPath(filePath), 'utf8').catch(() => '')
  ])

  let contentType = 'application/octet-stream'
  if (metadataRaw) {
    try {
      const metadata = JSON.parse(metadataRaw) as { contentType?: string }
      if (metadata.contentType) {
        contentType = metadata.contentType
      }
    } catch {}
  }

  return {
    data,
    contentType,
    size: (await stat(filePath)).size
  }
}

function signStoragePayload(bucket: string, objectPath: string, expiresAt: number) {
  return createHmac('sha256', getInternalApiSecret())
    .update(`${bucket}/${objectPath}:${expiresAt}`)
    .digest('hex')
}

export function createStorageSignedToken(bucket: string, objectPath: string, expiresInSeconds: number) {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds
  const signature = signStoragePayload(bucket, objectPath, expiresAt)

  return `${expiresAt}.${signature}`
}

export function verifyStorageSignedToken(bucket: string, objectPath: string, token?: string | null) {
  if (!token) {
    return false
  }

  const [expiresAtRaw, signature] = token.split('.')
  const expiresAt = Number(expiresAtRaw)

  if (!Number.isInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000) || !signature) {
    return false
  }

  const expected = signStoragePayload(bucket, objectPath, expiresAt)
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(signature)

  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
}
