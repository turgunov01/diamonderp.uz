import type { AuthSession, LoginRequestBody, LoginResponse } from '~~/shared/types/auth'
import { captureAuthGeolocation } from './useAuthGeolocation'

export function useAuth() {
  const session = useCookie<AuthSession | null>('diamond-erp-session', {
    default: () => null,
    sameSite: 'lax',
    maxAge: 60 * 60 * 12
  })
  const token = useCookie<string | null>('diamond-erp-token', {
    default: () => null,
    sameSite: 'lax',
    maxAge: 60 * 60 * 12
  })

  const loggedIn = computed(() => Boolean(session.value))

  async function login(credentials: LoginRequestBody) {
    const location = credentials.location === undefined
      ? await captureAuthGeolocation({ timeoutMs: 6_000 })
      : credentials.location

    const response = await $fetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: {
        ...credentials,
        location
      }
    })

    session.value = response.user
    token.value = response.token
    return response.user
  }

  async function logout() {
    const currentToken = token.value
    const location = await captureAuthGeolocation({ timeoutMs: 5_000 })

    await $fetch('/api/auth/logout', {
      method: 'POST',
      headers: currentToken
        ? { Authorization: `Bearer ${currentToken}` }
        : undefined,
      body: {
        location
      }
    }).catch(() => undefined)

    session.value = null
    token.value = null
    await navigateTo('/login', { replace: true })
  }

  return {
    session,
    token,
    loggedIn,
    login,
    logout
  }
}
