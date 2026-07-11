<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { canAccessPath, getDefaultRouteForRole } from '~~/shared/utils/access'

definePageMeta({
  layout: false
})

const route = useRoute()
const { login } = useAuth()

const schema = z.object({
  login: z.string().trim().min(1, 'Введите email, телефон или логин.'),
  password: z.string().min(6, 'Минимум 6 символов.')
})

type LoginSchema = z.output<typeof schema>

const state = reactive<LoginSchema>({
  login: 'admin@diamond.local',
  password: 'password123'
})

const loading = ref(false)
const errorMessage = ref('')

useSeoMeta({
  title: 'Вход',
  description: 'Вход в Diamond ERP'
})

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    return err.data?.statusMessage || err.message
  }

  return undefined
}

async function onSubmit(event: FormSubmitEvent<LoginSchema>) {
  if (loading.value) {
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const user = await login(event.data)

    const requestedRedirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      ? route.query.redirect
      : getDefaultRouteForRole(user.role)

    const redirect = canAccessPath(user.role, requestedRedirect)
      ? requestedRedirect
      : getDefaultRouteForRole(user.role)

    await navigateTo(redirect, { replace: true })
  } catch (error) {
    errorMessage.value = getErrorMessage(error) || 'Не удалось выполнить вход.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_28%),linear-gradient(180deg,_rgb(var(--ui-bg))_0%,_rgb(var(--ui-bg-elevated))_100%)]">
    <div class="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div class="w-full max-w-md">
        <UPageCard
          title="Вход в систему"
          description="Используйте учетные данные, чтобы открыть доступ к Diamond ERP."
          variant="subtle"
          class="w-full border border-default bg-elevated/70 backdrop-blur"
          :ui="{
            root: 'rounded-3xl shadow-2xl shadow-primary/5',
            container: 'gap-y-6 p-6 sm:p-8'
          }"
        >
          <template #header>
            <div class="space-y-4">
              <div class="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
                <UIcon name="i-lucide-shield-check" class="size-6 text-primary" />
              </div>

              <UAlert
                v-if="errorMessage"
                color="error"
                variant="subtle"
                icon="i-lucide-circle-alert"
                :title="errorMessage"
              />
            </div>
          </template>

          <UForm
            :schema="schema"
            :state="state"
            class="space-y-5"
            @submit="onSubmit"
          >
            <UFormField label="Email, телефон или логин" name="login" required>
              <UInput
                v-model="state.login"
                type="text"
                icon="i-lucide-user"
                autocomplete="username"
                placeholder="admin@diamond.local или +998901234567"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Пароль" name="password" required>
              <UInput
                v-model="state.password"
                type="password"
                icon="i-lucide-lock-keyhole"
                autocomplete="current-password"
                placeholder="Введите пароль"
                class="w-full"
              />
            </UFormField>

            <UButton
              type="submit"
              label="Войти"
              icon="i-lucide-log-in"
              color="primary"
              block
              size="lg"
              :loading="loading"
            />
          </UForm>

          <template #footer>
            <div class="rounded-2xl border border-default bg-default/60 p-4 text-sm text-muted">
              Middleware защищает все страницы приложения, кроме <code>/login</code>. После входа пользователь
              перенаправляется на исходный маршрут.
            </div>
          </template>
        </UPageCard>
      </div>
    </div>
  </div>
</template>
