import type { AuthSession, LoginRequestBody, LoginResponse } from '~~/shared/types/auth'

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
    const response = await $fetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: credentials
    })

    session.value = response.user
    token.value = response.token
    return response.user
  }

  async function logout() {
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
