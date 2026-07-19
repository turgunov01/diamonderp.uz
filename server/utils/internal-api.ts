import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'

const generatedInternalApiSecret = randomUUID()

export function getInternalApiSecret() {
  const config = useRuntimeConfig()
  const configured = config.internalApiSecret || process.env.APP_INTERNAL_API_SECRET

  return typeof configured === 'string' && configured.length
    ? configured
    : generatedInternalApiSecret
}

export function getInternalApiHeaders(secret = getInternalApiSecret()) {
  return {
    apikey: secret,
    Authorization: `Bearer ${secret}`
  }
}

export function assertInternalApiRequest(event: H3Event) {
  const expected = getInternalApiSecret()
  const apiKey = getHeader(event, 'apikey')
  const authorization = getHeader(event, 'authorization')
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined

  if (apiKey === expected || bearer === expected) {
    return
  }

  throw createError({
    statusCode: 401,
    message: 'Internal API credentials are required.'
  })
}
