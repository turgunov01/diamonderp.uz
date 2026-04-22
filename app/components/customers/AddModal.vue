<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

type SalaryType = 'fixed' | 'hourly'
type ShiftKind = 'day' | 'night' | 'hourly'

type EditableCustomer = {
  id: number
  buildingId?: number | null
  fullName?: string
  username: string
  phoneNumber: string
  role: string
  age: number
  workShift: 'day' | 'night'
  salaryType?: SalaryType
  hourlyRate?: number
  objectPinned: string
  objectPositions: string[]
}

type BuildingItem = {
  id: number
  name: string
  logo?: string | null
  description?: string | null
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
const DEFAULT_PASSWORD = '12345678'
const DEFAULT_ROLE_OPTIONS = [
  { label: 'Сотрудник', value: 'customer' },
  { label: 'Клинер', value: 'cleaner' },
  { label: 'Менеджер', value: 'manager' },
  { label: 'Супервайзер', value: 'supervisor' },
  { label: 'Закупщик', value: 'procurement' },
  { label: 'HR', value: 'hr' },
  { label: 'Админ', value: 'admin' }
] as const

const createSchema = z.object({
  fullName: z.string().min(3, 'ФИО обязательно'),
  username: z.string().min(3, 'Имя пользователя слишком короткое'),
  password: z.string().min(6, 'Пароль должен быть не менее 6 символов'),
  phoneNumber: z.string().min(7, 'Номер телефона слишком короткий'),
  role: z.string().min(1, 'Роль обязательна').max(64, 'Роль слишком длинная'),
  age: z.coerce
    .number()
    .int('Возраст должен быть целым числом')
    .min(18, 'Возраст должен быть не менее 18'),
  workShift: z.enum(['day', 'night']),
  salaryType: z.enum(['fixed', 'hourly']),
  hourlyRate: z.coerce.number().int('Ставка должна быть целым числом').min(0, 'Ставка не может быть меньше 0'),
  objectPinned: z.string().optional(),
  objectPositions: z.array(z.string()).min(1, 'Выберите хотя бы один объект')
})

const editSchema = z.object({
  fullName: z.string().min(3, 'ФИО обязательно').optional(),
  username: z.string().min(3, 'Имя пользователя слишком короткое'),
  password: z.string().refine(
    value => !value.trim() || value.trim().length >= 6,
    'Пароль должен быть не менее 6 символов'
  ),
  phoneNumber: z.string().min(7, 'Номер телефона слишком короткий'),
  role: z.string().min(1, 'Роль обязательна').max(64, 'Роль слишком длинная').optional(),
  age: z.coerce
    .number()
    .int('Возраст должен быть целым числом')
    .min(18, 'Возраст должен быть не менее 18'),
  workShift: z.enum(['day', 'night']),
  salaryType: z.enum(['fixed', 'hourly']),
  hourlyRate: z.coerce.number().int('Ставка должна быть целым числом').min(0, 'Ставка не может быть меньше 0'),
  objectPinned: z.string().optional(),
  objectPositions: z.array(z.string())
})
type FormState = {
  buildingId: number | null
  fullName: string
  username: string
  password: string
  phoneNumber: string
  role: string
  age: number
  workShift: 'day' | 'night'
  salaryType: SalaryType
  hourlyRate: number
  objectPinned: string
  objectPositions: string[]
}

type FormSubmitState = {
  fullName: string
  username: string
  password: string
  phoneNumber: string
  role: string
  age: number
  workShift: 'day' | 'night'
  salaryType: SalaryType
  hourlyRate: number
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
  buildingId: activeBuilding.value?.id ?? null,
  fullName: '',
  username: '',
  password: DEFAULT_PASSWORD,
  phoneNumber: '',
  role: 'customer',
  age: 18,
  workShift: 'day',
  salaryType: 'fixed',
  hourlyRate: 0,
  objectPinned: '',
  objectPositions: []
})

const isEditMode = computed(() => Boolean(props.customer?.id))
const schema = computed(() => (isEditMode.value ? editSchema : createSchema))

const { data: buildings } = await useFetch<BuildingItem[]>('/api/buildings', {
  default: () => []
})

const buildingOptions = computed(() =>
  (buildings.value || []).map(building => ({
    label: building.name,
    value: building.id
  }))
)

const selectedBuildingId = computed(() => {
  const raw = state.buildingId
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
})

type CustomerRoleItem = {
  id: number
  buildingId: number | null
  code: string
  label: string
  isActive: boolean
  createdAt: string | null
}

const { data: roles } = await useFetch<CustomerRoleItem[]>('/api/customer-roles', {
  default: () => [],
  query: {
    buildingId: selectedBuildingId
  }
})

const roleOptions = computed(() => {
  const dynamic = (roles.value || [])
    .filter(role => role.isActive)
    .map(role => ({ label: role.label, value: role.code }))

  return dynamic.length ? dynamic : DEFAULT_ROLE_OPTIONS
})

watch(activeBuilding, (building) => {
  if (isEditMode.value) return
  state.buildingId = building?.id ?? null
}, { immediate: true })

const { data: objects } = await useFetch<ObjectItem[]>('/api/objects', {
  default: () => [],
  query: {
    buildingId: selectedBuildingId
  }
})

const objectOptions = computed(() => {
  if (!selectedBuildingId.value) {
    return []
  }

  return (objects.value || []).map(item => ({
    label: item.name,
    value: item.name
  }))
})

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

const shiftKindModel = computed<ShiftKind>({
  get: () => (state.salaryType === 'hourly' ? 'hourly' : state.workShift),
  set: (value) => {
    if (value === 'hourly') {
      state.salaryType = 'hourly'
      return
    }

    state.salaryType = 'fixed'
    state.workShift = value
  }
})

function transliterate(value: string) {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n', ң: 'ng', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ұ: 'u', ү: 'u', ф: 'f', х: 'h', ҳ: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e',
    ю: 'yu', я: 'ya', ь: '', ъ: ''
  }

  return value
    .toLowerCase()
    .split('')
    .map(char => map[char] ?? char)
    .join('')
}

watch(() => state.fullName, (value) => {
  if (isEditMode.value) return
  const normalized = transliterate(value || '')
    .replace(/[^a-z0-9\\s.-]+/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
  if (!normalized) {
    state.username = ''
    return
  }
  const parts = normalized.split(' ')
  state.username = parts.length >= 2 ? `${parts[0]}.${parts.slice(1).join('.')}` : normalized.replace(/\\s+/g, '.')
})

function fillStateFromCustomer(customer?: EditableCustomer | null) {
  state.buildingId = customer?.buildingId ?? activeBuilding.value?.id ?? null
  state.fullName = customer?.fullName || ''
  state.username = customer?.username || ''
  state.password = customer ? '' : DEFAULT_PASSWORD
  state.phoneNumber = customer?.phoneNumber || ''
  state.role = customer?.role || 'customer'
  state.age = customer?.age ?? 18
  state.workShift = customer?.workShift || 'day'
  state.salaryType = customer?.salaryType ?? 'fixed'
  state.hourlyRate = customer?.hourlyRate ?? 0
  state.objectPinned = customer?.objectPinned || ''
  state.objectPositions = [...(customer?.objectPositions || [])]
  avatarFile.value = null
  passportFrontFile.value = null
  passportBackFile.value = null
}

watch(() => state.buildingId, (next, previous) => {
  if (!isEditMode.value) return

  const nextId = typeof next === 'number' ? next : Number(next)
  const prevId = typeof previous === 'number' ? previous : Number(previous)

  if (!Number.isInteger(nextId) || nextId <= 0) return
  if (!Number.isInteger(prevId) || prevId <= 0) return
  if (nextId === prevId) return

  state.objectPinned = ''
  state.objectPositions = []
})

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
    const buildingId = selectedBuildingId.value
    if (!buildingId) {
      throw new Error('Выберите здание перед сохранением сотрудника.')
    }

    const fullName = event.data.fullName.trim()
    const objectPinned = event.data.objectPinned?.trim() || ''
    const objectPositions = buildObjectPositions(event.data.objectPositions, event.data.objectPinned || '')

    if (!isEditMode.value && !objectPositions.length) {
      throw new Error('Выберите хотя бы один объект.')
    }

    if (isEditMode.value && props.customer?.id) {
      await $fetch(`/api/customers/${props.customer.id}`, {
        method: 'PATCH',
        body: {
          buildingId,
          fullName,
          username: event.data.username.trim(),
          password: event.data.password.trim() || undefined,
          phoneNumber: event.data.phoneNumber.trim(),
          age: event.data.age,
          workShift: event.data.workShift,
          salaryType: event.data.salaryType,
          hourlyRate: event.data.salaryType === 'hourly' ? event.data.hourlyRate : undefined,
          role: event.data.role || 'customer',
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
      form.append('fullName', fullName)
      form.append('username', event.data.username.trim())
      form.append('buildingId', String(buildingId))
      form.append('password', event.data.password || DEFAULT_PASSWORD)
      form.append('phoneNumber', event.data.phoneNumber.trim())
      form.append('role', event.data.role || 'customer')
      form.append('age', String(event.data.age))
      form.append('workShift', event.data.workShift)
      form.append('salaryType', event.data.salaryType)
      form.append('hourlyRate', String(event.data.hourlyRate ?? 0))
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
        <UFormField label="ФИО" name="fullName">
          <UInput v-model="state.fullName" class="w-full" placeholder="Сардор Тургунов" />
        </UFormField>
        <UFormField label="Имя пользователя" name="username">
          <UInput v-model="state.username" class="w-full" placeholder="alex.smith" />
        </UFormField>

        <UFormField label="Роль" name="role">
          <USelect
            v-model="state.role"
            :items="roleOptions"
            class="w-full"
          />
        </UFormField>

        <UFormField v-if="isEditMode" label="Здание" name="buildingId">
          <USelect
            v-model="state.buildingId"
            :items="buildingOptions"
            class="w-full"
          />
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
            :placeholder="isEditMode ? 'Оставьте пустым, чтобы не менять' : `По умолчанию ${DEFAULT_PASSWORD}`"
            :disabled="!isEditMode"
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
            v-model="shiftKindModel"
            :items="[
              { label: 'День', value: 'day' },
              { label: 'Ночь', value: 'night' },
              { label: 'Почасовое', value: 'hourly' }
            ]"
            class="w-full"
          />
        </UFormField>

        <UFormField v-if="state.salaryType === 'hourly'" label="Ставка (UZS/час)" name="hourlyRate">
          <UInput
            v-model="state.hourlyRate"
            type="number"
            min="0"
            step="1000"
            class="w-full"
            placeholder="Например: 20000"
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
