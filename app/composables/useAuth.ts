import type { AuthSession, LoginRequestBody, LoginResponse } from '~~/shared/types/auth'

export function useAuth() {
  const session = useCookie<AuthSession | null>('diamond-erp-session', {
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
    return response.user
  }

  async function logout() {
    session.value = null
    await navigateTo('/login', { replace: true })
  }

  return {
    session,
    loggedIn,
    login,
    logout
  }
}
