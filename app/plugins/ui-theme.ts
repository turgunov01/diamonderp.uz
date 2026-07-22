// Persist the primary/neutral color choice from the theme picker across reloads.
// useAppConfig() is not persisted on its own (it resets to app.config.ts defaults),
// so we mirror the selection into cookies and re-apply them here on every app init
// — running on the server too, which avoids a color flash before hydration.
export default defineNuxtPlugin(() => {
  const appConfig = useAppConfig()
  const primary = useCookie<string | null>('ui-primary', { maxAge: 60 * 60 * 24 * 365 })
  const neutral = useCookie<string | null>('ui-neutral', { maxAge: 60 * 60 * 24 * 365 })

  if (primary.value) {
    appConfig.ui.colors.primary = primary.value
  }

  if (neutral.value) {
    appConfig.ui.colors.neutral = neutral.value
  }
})
