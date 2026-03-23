import { canAccessPath, getDefaultRouteForRole } from '~~/shared/utils/access'

export default defineNuxtRouteMiddleware((to) => {
  const { session } = useAuth()

  if (to.path === '/login') {
    if (!session.value) {
      return
    }

    const requestedRedirect = typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/')
      ? to.query.redirect
      : getDefaultRouteForRole(session.value.role)

    const redirect = canAccessPath(session.value.role, requestedRedirect)
      ? requestedRedirect
      : getDefaultRouteForRole(session.value.role)

    return navigateTo(redirect, { replace: true })
  }

  if (session.value) {
    if (canAccessPath(session.value.role, to.path)) {
      return
    }

    return navigateTo(getDefaultRouteForRole(session.value.role), { replace: true })
  }

  return navigateTo({
    path: '/login',
    query: to.fullPath && to.fullPath !== '/login'
      ? { redirect: to.fullPath }
      : undefined
  }, { replace: true })
})
