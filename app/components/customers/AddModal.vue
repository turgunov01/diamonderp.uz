<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

type EditableCustomer = {
  id: number
  username: string
  phoneNumber: string
  age: number
  workShift: 'day' | 'night'
  objectPinned: string
  objectPositions: string[]
}

type ObjectItem = {
  id: number
  name: string
  description?: string | null
  address?: string | null
  code?: string | null
}

const props = withDefaults(defineProps<{
  customer?: EditableCustomer | null
  hideTrigger?: boolean
}>(), {
  customer: null,
  hideTrigger: false
})

const emit = defineEmits<{
  saved: []
}>()

const open = defineModel<boolean>('open', { default: false })
const NOT_PINNED_VALUE = '__not_pinned__'

const createSchema = z.object({
  username: z.string().min(3, 'Имя пользователя слишком короткое'),
  password: z.string().min(6, 'Пароль должен быть не менее 6 символов'),
  phoneNumber: z.string().min(7, 'Номер телефона слишком короткий'),
  age: z.coerce
    .number()
    .int('Возраст должен быть целым числом')
    .min(18, 'Возраст должен быть не менее 18'),
  workShift: z.enum(['day', 'night']),
  objectPinned: z.string().optional(),
  objectPositions: z.array(z.string()).min(1, 'Выберите хотя бы один объект')
})

const editSchema = z.object({
  username: z.string().min(3, 'Имя пользователя слишком короткое'),
  password: z.string().refine(
    value => !value.trim() || value.trim().length >= 6,
    'Пароль должен быть не менее 6 символов'
  ),
  phoneNumber: z.string().min(7, 'Номер телефона слишком короткий'),
  age: z.coerce
    .number()
    .int('Возраст должен быть целым числом')
    .min(18, 'Возраст должен быть не менее 18'),
  workShift: z.enum(['day', 'night']),
  objectPinned: z.string().optional(),
  objectPositions: z.array(z.string())
})

type FormState = {
  username: string
  password: string
  phoneNumber: string
  age: number
  workShift: 'day' | 'night'
  objectPinned: string
  objectPositions: string[]
}

type FormSubmitState = {
  username: string
  password: string
  phoneNumber: string
  age: number
  workShift: 'day' | 'night'
  objectPinned?: string
  objectPositions: string[]
}

const loading = ref(false)
const avatarFile = ref<File | null>(null)
const passportFrontFile = ref<File | null>(null)
const passportBackFile = ref<File | null>(null)
const toast = useToast()
const activeBuilding = useState<{ id: number, name: string } | null>('active-building')

const state = reactive<FormState>({
  username: '',
  password: '',
  phoneNumber: '',
  age: 18,
  workShift: 'day',
  objectPinned: '',
  objectPositions: []
})

const isEditMode = computed(() => Boolean(props.customer?.id))
const schema = computed(() => (isEditMode.value ? editSchema : createSchema))

const { data: objects } = await useFetch<ObjectItem[]>('/api/objects', {
  default: () => [],
  query: {
    buildingId: computed(() => activeBuilding.value?.id)
  }
})

const objectOptions = computed(() =>
  (objects.value || []).map(item => ({
    label: item.name,
    value: item.name
  }))
)

const pinnedObjectOptions = computed(() => [
  { label: 'Не закреплен', value: NOT_PINNED_VALUE },
  ...objectOptions.value
])

const pinnedObjectModel = computed({
  get: () => state.objectPinned || NOT_PINNED_VALUE,
  set: (value: string) => {
    state.objectPinned = value === NOT_PINNED_VALUE ? '' : value
  }
})

function fillStateFromCustomer(customer?: EditableCustomer | null) {
  state.username = customer?.username || ''
  state.password = ''
  state.phoneNumber = customer?.phoneNumber || ''
  state.age = customer?.age ?? 18
  state.workShift = customer?.workShift || 'day'
  state.objectPinned = customer?.objectPinned || ''
  state.objectPositions = [...(customer?.objectPositions || [])]
  avatarFile.value = null
  passportFrontFile.value = null
  passportBackFile.value = null
}

function resetState() {
  fillStateFromCustomer(isEditMode.value ? props.customer : null)
}

watch(
  () => props.customer,
  (customer) => {
    if (isEditMode.value) {
      fillStateFromCustomer(customer)
    }
  },
  { immediate: true }
)

watch(open, (value) => {
  if (!value) {
    resetState()
    return
  }

  fillStateFromCustomer(isEditMode.value ? props.customer : null)
})

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    return err.data?.statusMessage || err.message
  }

  return undefined
}

function onAvatarFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  avatarFile.value = input.files?.[0] || null
}

function onPassportFrontFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  passportFrontFile.value = input.files?.[0] || null
}

function onPassportBackFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  passportBackFile.value = input.files?.[0] || null
}

function buildObjectPositions(positions: string[], pinned: string) {
  const normalized = positions.map(item => item.trim()).filter(Boolean)

  if (pinned.trim() && !normalized.includes(pinned.trim())) {
    normalized.unshift(pinned.trim())
  }

  return normalized
}

function finalizeSubmit() {
  setTimeout(() => {
    open.value = false
    emit('saved')
  }, 0)
}

async function onSubmit(event?: FormSubmitEvent<FormSubmitState>) {
  if (!event || loading.value) {
    return
  }

  loading.value = true

  try {
    if (!activeBuilding.value?.id) {
      throw new Error('Выберите здание перед сохранением сотрудника.')
    }

    const objectPinned = event.data.objectPinned?.trim() || ''
    const objectPositions = buildObjectPositions(event.data.objectPositions, event.data.objectPinned || '')

    if (!isEditMode.value && !objectPositions.length) {
      throw new Error('Выберите хотя бы один объект.')
    }

    if (isEditMode.value && props.customer?.id) {
      await $fetch(`/api/customers/${props.customer.id}`, {
        method: 'PATCH',
        body: {
          buildingId: activeBuilding.value?.id ?? null,
          username: event.data.username.trim(),
          password: event.data.password.trim() || undefined,
          phoneNumber: event.data.phoneNumber.trim(),
          age: event.data.age,
          workShift: event.data.workShift,
          objectPinned,
          objectPositions
        }
      })

      toast.add({
        title: 'Изменения сохранены',
        description: `Пользователь @${event.data.username} обновлен`,
        color: 'success'
      })
    } else {
      if (!avatarFile.value) {
        throw new Error('Файл аватара обязателен.')
      }
      if (!passportFrontFile.value) {
        throw new Error('Файл лицевой стороны паспорта обязателен.')
      }
      if (!passportBackFile.value) {
        throw new Error('Файл обратной стороны паспорта обязателен.')
      }

      const form = new FormData()
      form.append('username', event.data.username.trim())
      form.append('buildingId', String(activeBuilding.value?.id || ''))
      form.append('password', event.data.password)
      form.append('phoneNumber', event.data.phoneNumber.trim())
      form.append('age', String(event.data.age))
      form.append('workShift', event.data.workShift)
      form.append('objectPinned', objectPinned)
      form.append('objectPositions', JSON.stringify(objectPositions))
      form.append('avatarFile', avatarFile.value)
      form.append('passportFrontFile', passportFrontFile.value)
      form.append('passportBackFile', passportBackFile.value)

      await $fetch('/api/customers', {
        method: 'POST',
        body: form
      })

      toast.add({
        title: 'Успешно',
        description: `Пользователь @${event.data.username} добавлен`,
        color: 'success'
      })
    }

    await refreshNuxtData('/api/customers')
    finalizeSubmit()
  } catch (error: unknown) {
    toast.add({
      title: isEditMode.value ? 'Не удалось сохранить изменения' : 'Не удалось создать сотрудника',
      description: getErrorMessage(error) || 'Проверьте введенные данные и попробуйте снова.',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isEditMode ? 'Редактировать пользователя' : 'Добавить пользователя'"
    :description="isEditMode ? 'Измените данные сотрудника' : 'Добавьте сотрудника в базу данных'"
  >
    <UButton
      v-if="!hideTrigger"
      :label="isEditMode ? 'Редактировать пользователя' : 'Добавить пользователя'"
      icon="i-lucide-plus"
      @click="open = true"
    />

    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        :on-submit="onSubmit"
        class="space-y-4"
      >
        <UFormField label="Имя пользователя" name="username">
          <UInput v-model="state.username" class="w-full" placeholder="alex.smith" />
        </UFormField>

        <UFormField v-if="!isEditMode" label="Файл аватара">
          <input
            class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm"
            type="file"
            accept="image/*"
            :disabled="loading"
            @change="onAvatarFileChange"
          >
        </UFormField>

        <UFormField label="Пароль" name="password">
          <UInput
            v-model="state.password"
            type="password"
            class="w-full"
            :placeholder="isEditMode ? 'Оставьте пустым, чтобы не менять' : 'Надежный пароль'"
          />
        </UFormField>

        <UFormField label="Номер телефона" name="phoneNumber">
          <UInput
            v-model="state.phoneNumber"
            class="w-full"
            placeholder="+998901112233"
          />
        </UFormField>

        <UFormField label="Возраст" name="age">
          <UInput
            v-model="state.age"
            type="number"
            min="18"
            step="1"
            class="w-full"
          />
        </UFormField>

        <template v-if="!isEditMode">
          <UFormField label="Паспорт: лицевая сторона">
            <input
              class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm"
              type="file"
              accept=".pdf,image/*"
              :disabled="loading"
              @change="onPassportFrontFileChange"
            >
          </UFormField>

          <UFormField label="Паспорт: обратная сторона">
            <input
              class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm"
              type="file"
              accept=".pdf,image/*"
              :disabled="loading"
              @change="onPassportBackFileChange"
            >
          </UFormField>
        </template>

        <UFormField label="Смена" name="workShift">
          <USelect
            v-model="state.workShift"
            :items="[
              { label: 'День', value: 'day' },
              { label: 'Ночь', value: 'night' }
            ]"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="isEditMode"
          label="Закрепленный объект"
          name="objectPinned"
        >
          <USelect
            v-model="pinnedObjectModel"
            :items="pinnedObjectOptions"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Позиции объекта" name="objectPositions">
          <USelectMenu
            v-model="state.objectPositions"
            :items="objectOptions"
            value-key="value"
            label-key="label"
            multiple
            placeholder="Выберите объекты"
            class="w-full"
          />
        </UFormField>

        <p class="text-xs text-muted">
          {{ isEditMode
            ? 'Если закрепленный объект выбран, он будет добавлен в список позиций автоматически.'
            : 'При создании достаточно выбрать позиции объекта. Закрепленный объект можно добавить позже при редактировании.' }}
        </p>

        <div class="flex justify-end gap-2">
          <UButton
            label="Отмена"
            color="neutral"
            variant="subtle"
            :disabled="loading"
            @click="open = false"
          />
          <UButton
            :label="isEditMode ? 'Сохранить' : 'Создать'"
            color="primary"
            variant="solid"
            type="submit"
            :loading="loading"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
