<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const fileRef = ref<HTMLInputElement>()

const currency = useDashboardCurrency()

const currencyOptions = [
  { label: 'Сумы (UZS)', value: 'UZS' },
  { label: 'Доллары (USD)', value: 'USD' },
  { label: 'Евро (EUR)', value: 'EUR' },
  { label: 'Рубли (RUB)', value: 'RUB' }
]

const profileSchema = z.object({
  name: z.string().min(2, 'Слишком короткое значение'),
  email: z.string().email('Некорректный email'),
  username: z.string().min(2, 'Слишком короткое значение'),
  avatar: z.string().optional(),
  bio: z.string().optional()
})

type ProfileSchema = z.output<typeof profileSchema>

const profile = reactive<Partial<ProfileSchema>>({
  name: 'Нодир Усманов',
  email: 'nodir@example.com',
  username: 'nodir.usmanov',
  avatar: undefined,
  bio: undefined
})

const toast = useToast()

async function onSubmit(event: FormSubmitEvent<ProfileSchema>) {
  toast.add({
    title: 'Успешно',
    description: 'Настройки обновлены.',
    icon: 'i-lucide-check',
    color: 'success'
  })

  console.log(event.data)
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement

  if (!input.files?.length) {
    return
  }

  profile.avatar = URL.createObjectURL(input.files[0]!)
}

function onFileClick() {
  fileRef.value?.click()
}
</script>

<template>
  <UForm
    id="settings"
    :schema="profileSchema"
    :state="profile"
    @submit="onSubmit"
  >
    <UPageCard
      title="Профиль"
      description="Эта информация будет отображаться публично."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <UButton
        form="settings"
        label="Сохранить изменения"
        color="neutral"
        type="submit"
        class="w-fit lg:ms-auto"
      />
    </UPageCard>

    <UPageCard variant="subtle">
      <UFormField
        name="name"
        label="Имя"
        description="Будет отображаться в чеках, счетах и другой коммуникации."
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput
          v-model="profile.name"
          autocomplete="off"
        />
      </UFormField>

      <USeparator />

      <UFormField
        name="currency"
        label="Валюта по умолчанию"
        description="Используется в статистике и выручке."
        class="flex max-sm:flex-col justify-between items-start gap-4"
        :ui="{ container: 'w-full' }"
      >
        <USelect
          v-model="currency"
          :items="currencyOptions"
          option-attribute="label"
          value-attribute="value"
          class="w-56"
        />
      </UFormField>

      <USeparator />

      <UFormField
        name="email"
        label="Электронная почта"
        description="Используется для входа, email-чеков и обновлений продукта."
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput
          v-model="profile.email"
          type="email"
          autocomplete="off"
        />
      </UFormField>

      <USeparator />

      <UFormField
        name="username"
        label="Логин"
        description="Ваш уникальный логин для входа и адреса профиля."
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput
          v-model="profile.username"
          type="username"
          autocomplete="off"
        />
      </UFormField>

      <USeparator />

      <UFormField
        name="avatar"
        label="Аватар"
        description="JPG, GIF или PNG. Максимум 1 МБ."
        class="flex max-sm:flex-col justify-between sm:items-center gap-4"
      >
        <div class="flex flex-wrap items-center gap-3">
          <UAvatar
            :src="profile.avatar"
            :alt="profile.name"
            size="lg"
          />
          <UButton
            label="Выбрать"
            color="neutral"
            @click="onFileClick"
          />
          <input
            ref="fileRef"
            type="file"
            class="hidden"
            accept=".jpg, .jpeg, .png, .gif"
            @change="onFileChange"
          >
        </div>
      </UFormField>

      <USeparator />

      <UFormField
        name="bio"
        label="О себе"
        description="Краткое описание профиля. Ссылки будут отображаться как кликабельные."
        class="flex max-sm:flex-col justify-between items-start gap-4"
        :ui="{ container: 'w-full' }"
      >
        <UTextarea
          v-model="profile.bio"
          :rows="5"
          autoresize
          class="w-full"
        />
      </UFormField>
    </UPageCard>
  </UForm>
</template>
