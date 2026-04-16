<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

type WorkShift = 'day' | 'night'
type CustomerRole = 'customer' | 'cleaner' | 'manager' | 'supervisor' | 'procurement' | 'hr' | 'admin'

interface BulkImportPreviewResponse {
  added: number
  skipped: number
  errors: Array<{ row: number, message: string }>
  items: Array<{
    row: number
    buildingId: number
    fullName: string
    phoneNumber: string
    username: string
    issues: string[]
    age?: number | null
    workShift?: WorkShift | null
  }>
}

type DraftCustomer = {
  id: string
  buildingId: number
  sourceRow: number
  createdAt: string
  updatedAt: string
  issues: string[]
  fullName: string
  username: string
  phoneNumber: string
  role: CustomerRole
  age: number | null
  workShift: WorkShift | null
  objectPinned: string
  objectPositions: string[]
}

type ObjectItem = {
  id: number
  name: string
}

const DEFAULT_PASSWORD = '12345678'
const NOT_PINNED_VALUE = '__not_pinned__'
const ROLE_OPTIONS = [
  { label: 'Cleaner', value: 'cleaner' },
  { label: 'Customer', value: 'customer' },
  { label: 'Manager', value: 'manager' },
  { label: 'Supervisor', value: 'supervisor' },
  { label: 'Procurement', value: 'procurement' },
  { label: 'HR', value: 'hr' },
  { label: 'Admin', value: 'admin' }
] as const

const createSchema = z.object({
  fullName: z.string().min(3, 'ФИО обязательно'),
  username: z.string().min(3, 'Имя пользователя слишком короткое'),
  phoneNumber: z.string().min(7, 'Номер телефона слишком короткий'),
  role: z.enum(['customer', 'cleaner', 'manager', 'supervisor', 'procurement', 'hr', 'admin']),
  age: z.coerce
    .number()
    .int('Возраст должен быть целым числом')
    .min(18, 'Возраст должен быть не менее 18'),
  workShift: z.enum(['day', 'night']),
  objectPinned: z.string().optional(),
  objectPositions: z.array(z.string()).min(1, 'Выберите хотя бы один объект')
})

type FormState = {
  fullName: string
  username: string
  phoneNumber: string
  role: CustomerRole
  age: number
  workShift: WorkShift
  objectPinned: string
  objectPositions: string[]
}

const toast = useToast()
const importing = ref(false)
const downloading = ref(false)
const saving = ref(false)
const draftsOpen = ref(false)
const editorOpen = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const activeBuilding = useState<{ id: number, name: string } | null>('active-building')

const drafts = useLocalStorage<DraftCustomer[]>(
  'customers-import-drafts',
  [],
  { listenToStorageChanges: false }
)

const activeBuildingDrafts = computed(() => {
  const buildingId = activeBuilding.value?.id
  if (!buildingId) return []
  return (drafts.value || []).filter(item => item.buildingId === buildingId)
})

const activeBuildingDraftCount = computed(() => activeBuildingDrafts.value.length)

const editingDraftId = ref<string | null>(null)
const editingDraft = computed(() => {
  if (!editingDraftId.value) return null
  return (drafts.value || []).find(item => item.id === editingDraftId.value) || null
})

const state = reactive<FormState>({
  fullName: '',
  username: '',
  phoneNumber: '',
  role: 'customer',
  age: 18,
  workShift: 'day',
  objectPinned: '',
  objectPositions: []
})

const pinnedObjectModel = computed({
  get: () => state.objectPinned || NOT_PINNED_VALUE,
  set: (value: string) => {
    state.objectPinned = value === NOT_PINNED_VALUE ? '' : value
  }
})

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

function pickFile() {
  fileInput.value?.click()
}

function openDrafts() {
  draftsOpen.value = true
}

function closeEditor() {
  editorOpen.value = false
  editingDraftId.value = null
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    return err.data?.statusMessage || err.message
  }

  return undefined
}

function createLocalId() {
  if (process.client && 'crypto' in window && typeof window.crypto?.randomUUID === 'function') {
    return window.crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function upsertDraft(nextDraft: DraftCustomer) {
  const list = drafts.value || []
  const index = list.findIndex(item => item.id === nextDraft.id)
  const next = [...list]

  if (index >= 0) {
    next.splice(index, 1, nextDraft)
  } else {
    next.unshift(nextDraft)
  }

  drafts.value = next
}

function removeDraft(id: string) {
  drafts.value = (drafts.value || []).filter(item => item.id !== id)
}

function clearDraftsForActiveBuilding() {
  const buildingId = activeBuilding.value?.id
  if (!buildingId) return
  drafts.value = (drafts.value || []).filter(item => item.buildingId !== buildingId)
}

function fillStateFromDraft(draft: DraftCustomer) {
  state.fullName = draft.fullName || ''
  state.username = draft.username || ''
  state.phoneNumber = draft.phoneNumber || ''
  state.role = draft.role || 'customer'
  state.age = draft.age ?? 18
  state.workShift = draft.workShift ?? 'day'
  state.objectPinned = draft.objectPinned || ''
  state.objectPositions = [...(draft.objectPositions || [])]
}

function openEditor(draft: DraftCustomer) {
  draftsOpen.value = false
  editingDraftId.value = draft.id
  fillStateFromDraft(draft)
  editorOpen.value = true
}

function buildObjectPositions(positions: string[], pinned: string) {
  const normalized = positions.map(item => item.trim()).filter(Boolean)

  if (pinned.trim() && !normalized.includes(pinned.trim())) {
    normalized.unshift(pinned.trim())
  }

  return normalized
}

async function downloadTemplate(format: 'xlsx' | 'csv' = 'xlsx') {
  if (downloading.value) {
    return
  }

  downloading.value = true

  try {
    const response = await fetch(`/api/customers/import-template?format=${format}&mode=draft`)
    if (!response.ok) {
      throw new Error('Не удалось скачать шаблон')
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `customers-import-template.${format}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (error: unknown) {
    toast.add({
      title: 'Не удалось скачать шаблон',
      description: getErrorMessage(error) || 'Проверьте API и повторите попытку.',
      color: 'error'
    })
  } finally {
    downloading.value = false
  }
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file || importing.value) {
    return
  }

  importing.value = true

  try {
    if (!activeBuilding.value?.id) {
      throw new Error('Выберите здание перед импортом.')
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('buildingId', String(activeBuilding.value.id))

    const result = await $fetch<BulkImportPreviewResponse>('/api/customers/bulk-import-preview', {
      method: 'POST',
      body: formData
    })

    const now = new Date().toISOString()
    const existingPhoneSet = new Set((drafts.value || []).map(item => item.phoneNumber.trim()))
    let addedToCache = 0
    let skippedAlreadyCached = 0

    for (const item of result.items) {
      const phoneKey = item.phoneNumber.trim()
      if (phoneKey && existingPhoneSet.has(phoneKey)) {
        skippedAlreadyCached++
        continue
      }

      const draft: DraftCustomer = {
        id: createLocalId(),
        buildingId: item.buildingId,
        sourceRow: item.row,
        createdAt: now,
        updatedAt: now,
        issues: [...(item.issues || [])],
        fullName: item.fullName,
        username: item.username,
        phoneNumber: item.phoneNumber,
        role: 'customer',
        age: item.age ?? null,
        workShift: item.workShift ?? null,
        objectPinned: '',
        objectPositions: []
      }

      existingPhoneSet.add(phoneKey)
      upsertDraft(draft)
      addedToCache++
    }

    const errorCount = result.errors.length

    toast.add({
      title: 'Файл обработан',
      description: `В черновики добавлено: ${addedToCache}. Пропущено: ${result.skipped + skippedAlreadyCached}.`,
      color: errorCount ? 'warning' : 'success'
    })

    if (errorCount) {
      const firstErrors = result.errors.slice(0, 3)
      toast.add({
        title: 'Ошибки в строках файла',
        description: firstErrors.map(item => `Строка ${item.row}: ${item.message}`).join(' | '),
        color: 'warning'
      })
    }

    draftsOpen.value = true
  } catch (error: unknown) {
    toast.add({
      title: 'Не удалось обработать файл',
      description: getErrorMessage(error) || 'Проверьте файл и повторите попытку.',
      color: 'error'
    })
  } finally {
    importing.value = false
    input.value = ''
  }
}

async function onCreateSubmit(event?: FormSubmitEvent<FormState>) {
  if (!event || saving.value) {
    return
  }

  const draft = editingDraft.value
  if (!draft) {
    return
  }

  saving.value = true

  try {
    const fullName = event.data.fullName.trim()
    const username = event.data.username.trim()
    const phoneNumber = event.data.phoneNumber.trim()
    const objectPinned = event.data.objectPinned?.trim() || ''
    const objectPositions = buildObjectPositions(event.data.objectPositions, objectPinned)

    const nextDraft: DraftCustomer = {
      ...draft,
      updatedAt: new Date().toISOString(),
      fullName,
      username,
      phoneNumber,
      role: event.data.role,
      age: event.data.age,
      workShift: event.data.workShift,
      objectPinned,
      objectPositions
    }
    upsertDraft(nextDraft)

    await $fetch('/api/customers', {
      method: 'POST',
      body: {
        buildingId: draft.buildingId,
        fullName,
        username,
        avatar: { src: `https://i.pravatar.cc/128?u=${encodeURIComponent(username)}` },
        password: DEFAULT_PASSWORD,
        phoneNumber,
        role: event.data.role,
        passportFile: `bulk-import/${username}.pdf`,
        age: event.data.age,
        workShift: event.data.workShift,
        objectPinned,
        objectPositions
      }
    })

    removeDraft(draft.id)
    await refreshNuxtData('/api/customers')

    toast.add({
      title: 'Пользователь создан',
      description: `@${username} добавлен в Supabase`,
      color: 'success'
    })

    closeEditor()
  } catch (error: unknown) {
    toast.add({
      title: 'Не удалось создать пользователя',
      description: getErrorMessage(error) || 'Проверьте данные и повторите попытку.',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <UButton
      label="Шаблон XLSX"
      icon="i-lucide-file-spreadsheet"
      color="neutral"
      variant="outline"
      :loading="downloading"
      @click="downloadTemplate('xlsx')"
    />

    <UButton
      label="Загрузить Excel"
      icon="i-lucide-upload"
      color="primary"
      variant="subtle"
      :loading="importing"
      @click="pickFile"
    />

    <UButton
      :label="`Черновики (${activeBuildingDraftCount})`"
      icon="i-lucide-list"
      color="neutral"
      variant="ghost"
      @click="openDrafts"
    />

    <input
      ref="fileInput"
      class="hidden"
      type="file"
      accept=".xlsx,.csv"
      @change="onFileSelected"
    >

    <UModal
      v-model:open="draftsOpen"
      title="Черновики массовой загрузки"
      description="Строки из Excel сохранены локально. Заполните объекты/смену и создайте пользователей по одному."
    >
      <template #body>
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm text-muted">
              Здание: <span class="font-medium text-highlighted">{{ activeBuilding?.name || '—' }}</span>
            </p>
            <UButton
              label="Очистить"
              color="warning"
              variant="outline"
              :disabled="!activeBuildingDraftCount"
              @click="clearDraftsForActiveBuilding"
            />
          </div>

          <div v-if="!activeBuildingDraftCount" class="rounded-md border border-dashed border-default p-4 text-sm text-muted">
            Черновиков для этого здания пока нет.
          </div>

          <div v-else class="max-h-[60vh] space-y-2 overflow-auto pr-1">
            <div
              v-for="draft in activeBuildingDrafts"
              :key="draft.id"
              class="flex items-start justify-between gap-3 rounded-md border border-default p-3"
            >
              <div class="min-w-0">
                <p class="truncate font-medium text-highlighted">
                  {{ draft.fullName }}
                </p>
                <p class="truncate text-sm text-muted">
                  {{ draft.phoneNumber }} · @{{ draft.username }}
                </p>
                <div v-if="draft.issues?.length" class="mt-2 flex flex-wrap gap-1.5">
                  <UBadge color="warning" variant="soft">
                    Есть замечания ({{ draft.issues.length }})
                  </UBadge>
                </div>
              </div>

              <div class="flex shrink-0 items-center gap-2">
                <UButton
                  label="Заполнить"
                  icon="i-lucide-pencil"
                  color="primary"
                  variant="solid"
                  @click="openEditor(draft)"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  @click="removeDraft(draft.id)"
                />
              </div>
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="editorOpen"
      title="Заполнить данные сотрудника"
      :description="editingDraft ? `Строка ${editingDraft.sourceRow} · черновик сохранён локально` : 'Черновик не выбран'"
    >
      <template #body>
        <UForm
          :schema="createSchema"
          :state="state"
          :on-submit="onCreateSubmit"
          class="space-y-4"
        >
          <UFormField label="ФИО" name="fullName">
            <UInput v-model="state.fullName" class="w-full" placeholder="Сардор Тургунов" />
          </UFormField>

          <UFormField label="Имя пользователя" name="username">
            <UInput v-model="state.username" class="w-full" placeholder="alex.smith" />
          </UFormField>

          <UFormField label="Номер телефона" name="phoneNumber">
            <UInput v-model="state.phoneNumber" class="w-full" placeholder="+998901112233" />
          </UFormField>

          <UFormField label="Роль" name="role">
            <USelect v-model="state.role" :items="ROLE_OPTIONS" class="w-full" />
          </UFormField>

          <UFormField label="Возраст" name="age">
            <UInput v-model="state.age" class="w-full" type="number" min="18" step="1" />
          </UFormField>

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

          <UFormField label="Закрепленный объект" name="objectPinned">
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

          <div v-if="editingDraft?.issues?.length" class="rounded-md border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900 dark:border-warning-800 dark:bg-warning-950 dark:text-warning-100">
            <p class="font-medium">
              Замечания из импорта:
            </p>
            <ul class="mt-1 list-disc space-y-1 pl-5">
              <li v-for="issue in editingDraft.issues" :key="issue">
                {{ issue }}
              </li>
            </ul>
          </div>

          <div class="flex justify-end gap-2">
            <UButton
              label="Отмена"
              color="neutral"
              variant="subtle"
              :disabled="saving"
              @click="closeEditor"
            />
            <UButton
              label="Создать в базе"
              color="primary"
              variant="solid"
              type="submit"
              :loading="saving"
            />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
