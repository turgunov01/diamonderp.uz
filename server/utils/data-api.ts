import { getInternalApiHeaders, getInternalApiSecret } from './internal-api'

interface DataApiServerConfig {
  url: string
  serviceRoleKey: string
  avatarBucket: string
  passportBucket: string
  documentTemplateBucket: string
  documentTemplateUploadBucket: string
  documentSignatureBucket: string
  taskPhotoBucket: string
}

function normalizeUrl(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

export function getDataApiServerConfig(): DataApiServerConfig {
  const config = useRuntimeConfig()
  const storage = config.storage || {}
  const url = typeof storage.baseUrl === 'string' ? storage.baseUrl : ''
  const serviceRoleKey = getInternalApiSecret()
  const avatarBucket = storage.avatarBucket
  const passportBucket = storage.passportBucket
  const documentTemplateBucket = storage.documentTemplateBucket
  const documentTemplateUploadBucket = storage.documentTemplateUploadBucket
  const documentSignatureBucket = storage.documentSignatureBucket
  const taskPhotoBucket = storage.taskPhotoBucket

  return {
    url: normalizeUrl(url),
    serviceRoleKey,
    avatarBucket: typeof avatarBucket === 'string' && avatarBucket.length ? avatarBucket : 'customer-avatars',
    passportBucket: typeof passportBucket === 'string' && passportBucket.length ? passportBucket : 'customer-passports',
    documentTemplateBucket: typeof documentTemplateBucket === 'string' && documentTemplateBucket.length
      ? documentTemplateBucket
      : 'document-templates',
    documentTemplateUploadBucket: typeof documentTemplateUploadBucket === 'string' && documentTemplateUploadBucket.length
      ? documentTemplateUploadBucket
      : 'document-template-uploads',
    documentSignatureBucket: typeof documentSignatureBucket === 'string' && documentSignatureBucket.length
      ? documentSignatureBucket
      : 'document-signatures',
    taskPhotoBucket: typeof taskPhotoBucket === 'string' && taskPhotoBucket.length
      ? taskPhotoBucket
      : 'object-task-photos'
  }
}

export function getDataApiServerHeaders(serviceRoleKey: string) {
  return getInternalApiHeaders(serviceRoleKey)
}
