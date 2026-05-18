import type { H3Event } from 'h3'
import type { AuthRole } from '~~/shared/types/auth'
import { verifyAuthToken } from '../../utils/auth'
import { recordAuthLocationEvent, type AuthLocationSource } from '../../utils/auth-locations'

interface LogoutRequestBody {
  location?: unknown
}

function readAuthToken(event: H3Event) {
  const authorization = getHeader(event, 'authorization') || getHeader(event, 'Authorization')
  if (typeof authorization === 'string' && authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim()
  }

  return getCookie(event, 'diamond-erp-token') || null
}

function parseSubject(subject: string): { source: AuthLocationSource, userId: number } | null {
  const [source, rawUserId] = subject.split(':')
  const userId = Number(rawUserId)

  if ((source !== 'erp' && source !== 'customer') || !Number.isInteger(userId) || userId <= 0) {
    return null
  }

  return {
    source,
    userId
  }
}

export default eventHandler(async (event) => {
  const body = await readBody<LogoutRequestBody>(event).catch((): LogoutRequestBody => ({}))
  const token = readAuthToken(event)

  if (token) {
    try {
      const payload = verifyAuthToken(token)
      const subject = parseSubject(payload.sub)

      if (subject) {
        await recordAuthLocationEvent({
          event,
          source: subject.source,
          userId: subject.userId,
          role: payload.role as AuthRole,
          eventType: 'logout',
          location: body?.location
        })
      }
    } catch {
      // Logout should still clear local session even if the token has expired.
    }
  }

  deleteCookie(event, 'diamond-erp-session', { path: '/' })
  deleteCookie(event, 'diamond-erp-token', { path: '/' })

  return {
    success: true
  }
})
