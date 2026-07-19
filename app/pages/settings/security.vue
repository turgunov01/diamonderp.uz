<script setup lang="ts">
import * as z from 'zod'
import type { FormError, FormSubmitEvent } from '@nuxt/ui'

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Введите текущий пароль'),
  newPassword: z.string().min(8, 'Минимум 8 символов'),
  confirmPassword: z.string().min(8, 'Минимум 8 символов')
})

type PasswordSchema = z.output<typeof passwordSchema>

const toast = useToast()
const changingPassword = ref(false)

const password = reactive<PasswordSchema>({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const validate = (state: Partial<PasswordSchema>): FormError[] => {
  const errors: FormError[] = []
  if (state.currentPassword && state.newPassword && state.currentPassword === state.newPassword) {
    errors.push({ name: 'newPassword', message: 'Пароли должны отличаться' })
  }
  if (state.newPassword && state.confirmPassword && state.newPassword !== state.confirmPassword) {
    errors.push({ name: 'confirmPassword', message: 'Пароли не совпадают' })
  }
  return errors
}

function resetPasswordForm() {
  password.currentPassword = ''
  password.newPassword = ''
  password.confirmPassword = ''
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const err = error as { data?: { message?: string, statusMessage?: string }, message?: string }
    return err.data?.message || err.message
  }

  return undefined
}

async function onPasswordSubmit(event: FormSubmitEvent<PasswordSchema>) {
  if (changingPassword.value) {
    return
  }

  changingPassword.value = true

  try {
    await $fetch('/api/auth/change-password', {
      method: 'POST',
      body: {
        currentPassword: event.data.currentPassword,
        newPassword: event.data.newPassword
      }
    })

    resetPasswordForm()
    toast.add({
      title: 'Пароль обновлен',
      description: 'Теперь используйте новый пароль при следующем входе.',
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch (error: unknown) {
    toast.add({
      title: 'Не удалось обновить пароль',
      description: getErrorMessage(error) || 'Проверьте текущий пароль и повторите попытку.',
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
  } finally {
    changingPassword.value = false
  }
}
</script>

<template>
  <UPageCard
    title="Пароль"
    description="Подтвердите текущий пароль перед установкой нового."
    variant="subtle"
  >
    <UForm
      :schema="passwordSchema"
      :state="password"
      :validate="validate"
      class="flex flex-col gap-4 max-w-xs"
      @submit="onPasswordSubmit"
    >
      <UFormField label="Текущий пароль" name="currentPassword">
        <UInput
          v-model="password.currentPassword"
          type="password"
          autocomplete="current-password"
          icon="i-lucide-lock-keyhole"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Новый пароль" name="newPassword">
        <UInput
          v-model="password.newPassword"
          type="password"
          autocomplete="new-password"
          icon="i-lucide-key-round"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Повторите новый пароль" name="confirmPassword">
        <UInput
          v-model="password.confirmPassword"
          type="password"
          autocomplete="new-password"
          icon="i-lucide-key-round"
          class="w-full"
        />
      </UFormField>

      <UButton
        label="Обновить пароль"
        icon="i-lucide-save"
        class="w-fit"
        type="submit"
        :loading="changingPassword"
      />
    </UForm>
  </UPageCard>

  <UPageCard
    title="Аккаунт"
    description="Если вы больше не хотите пользоваться сервисом, здесь можно удалить аккаунт. Это действие необратимо. Вся информация, связанная с аккаунтом, будет удалена навсегда."
    class="bg-gradient-to-tl from-error/10 from-5% to-default"
  >
    <template #footer>
      <UButton label="Удалить аккаунт" color="error" />
    </template>
  </UPageCard>
</template>
