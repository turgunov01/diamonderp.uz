<script setup lang="ts">
import * as z from 'zod'
import type { FormError } from '@nuxt/ui'

const passwordSchema = z.object({
  current: z.string().min(8, 'Минимум 8 символов'),
  new: z.string().min(8, 'Минимум 8 символов')
})

type PasswordSchema = z.output<typeof passwordSchema>

const password = reactive<Partial<PasswordSchema>>({
  current: '',
  new: ''
})

const validate = (state: Partial<PasswordSchema>): FormError[] => {
  const errors: FormError[] = []
  if (state.current && state.new && state.current === state.new) {
    errors.push({ name: 'new', message: 'Пароли должны отличаться' })
  }
  return errors
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
    >
      <UFormField name="current">
        <UInput
          v-model="password.current"
          type="password"
          placeholder="Текущий пароль"
          class="w-full"
        />
      </UFormField>

      <UFormField name="new">
        <UInput
          v-model="password.new"
          type="password"
          placeholder="Новый пароль"
          class="w-full"
        />
      </UFormField>

      <UButton label="Обновить" class="w-fit" type="submit" />
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
