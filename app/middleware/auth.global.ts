export default defineNuxtRouteMiddleware((to) => {
  const { session } = useAuth()

  if (to.path === '/login') {
    if (!session.value) {
      return
    }

    const redirect = typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/')
      ? to.query.redirect
      : '/'

    return navigateTo(redirect, { replace: true })
  }

  if (session.value) {
    return
  }

  return navigateTo({
    path: '/login',
    query: to.fullPath && to.fullPath !== '/login'
      ? { redirect: to.fullPath }
      : undefined
  }, { replace: true })
})
