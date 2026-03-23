import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'

const BUCKET = 'marble-photos'

function safeFilename(name?: string) {
  const base = (name || 'photo').replace(/[^a-zA-Z0-9._-]+/g, '-')
  return `${Date.now()}-${base}`
}

export default eventHandler(async (event) => {
  if (!event.node.req.headers['content-type']?.toLowerCase().includes('multipart/form-data')) {
    throw createError({ statusCode: 400, statusMessage: 'Content-Type должен быть multipart/form-data.' })
  }

  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)

  // ensure bucket exists and is public
  try {
    await $fetch(`${url}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: { id: BUCKET, name: BUCKET, public: true }
    })
  } catch (error: any) {
    const status = error?.status
    if (status !== 400 && status !== 409) {
      throw createError({ statusCode: 500, statusMessage: 'Не удалось подготовить bucket marble-photos.' })
    }
  }

  const form = await readMultipartFormData(event)
  if (!form || !form.length) {
    throw createError({ statusCode: 400, statusMessage: 'Файлы не переданы.' })
  }

  const files = form.filter(f => f.type === 'file' && f.filename && f.data)
  if (!files.length) {
    throw createError({ statusCode: 400, statusMessage: 'Файлы не переданы.' })
  }

  const urls: string[] = []

  for (const file of files) {
    const key = `marble/${safeFilename(file.filename)}`
    await $fetch(`${url}/storage/v1/object/${BUCKET}/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true'
      },
      body: file.data
    })

    const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(key)}`
    urls.push(publicUrl)
  }

  return { urls }
})
