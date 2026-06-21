<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import {
  DEFAULT_WORK_SCHEDULE_TYPE,
  getLegacyWorkScheduleType,
  getWorkScheduleDefinition,
  normalizeWorkScheduleType,
  type WorkScheduleType
} from '~~/shared/utils/work-schedules'

type WorkShift = 'day' | 'night'
type SalaryType = 'fixed' | 'hourly'
type CustomerRole = string

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
  salaryType?: SalaryType
  objectPinned: string
  objectPositions: string[]
}

type ObjectItem = {
  id: number
  name: string
  schedule_type?: WorkScheduleType | string | null
  scheduleType?: WorkScheduleType | string | null
}

const DEFAULT_PASSWORD = '12345678'
const NOT_PINNED_VALUE = '__not_pinned__'
const DEFAULT_ROLE_OPTIONS = [
  { label: 'РЎРѕС‚СЂСѓРґРЅРёРє', value: 'customer' },
  { label: 'РљР»РёРЅРµСЂ', value: 'cleaner' },
  { label: 'РњРµРЅРµРґР¶РµСЂ', value: 'manager' },
  { label: 'РЎСѓРїРµСЂРІР°Р№Р·РµСЂ', value: 'supervisor' },
  { label: 'Р—Р°РєСѓРїС‰РёРє', value: 'procurement' },
  { label: 'HR', value: 'hr' },
  { label: 'РђРґРјРёРЅ', value: 'admin' }
] as const

const createSchema = z.object({
  fullName: z.string().min(3, 'Р¤РРћ РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ'),
  username: z.string().min(3, 'РРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ СЃР»РёС€РєРѕРј РєРѕСЂРѕС‚РєРѕРµ'),
  phoneNumber: z.string().min(7, 'РќРѕРјРµСЂ С‚РµР»РµС„РѕРЅР° СЃР»РёС€РєРѕРј РєРѕСЂРѕС‚РєРёР№'),
  role: z.string().min(1, 'Р РѕР»СЊ РѕР±СЏР·Р°С‚РµР»СЊРЅР°').max(64, 'Р РѕР»СЊ СЃР»РёС€РєРѕРј РґР»РёРЅРЅР°СЏ'),
  age: z.coerce
    .number()
    .int('Р’РѕР·СЂР°СЃС‚ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ С†РµР»С‹Рј С‡РёСЃР»РѕРј')
    .min(18, 'Р’РѕР·СЂР°СЃС‚ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅРµ РјРµРЅРµРµ 18'),
  workShift: z.enum(['day', 'night']),
  salaryType: z.enum(['fixed', 'hourly']),
  objectPinned: z.string().optional(),
  objectPositions: z.array(z.string()).min(1, 'Р’С‹Р±РµСЂРёС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ РѕР±СЉРµРєС‚')
})

type FormState = {
  fullName: string
  username: string
  phoneNumber: string
  role: CustomerRole
  age: number
  workShift: WorkShift
  salaryType: SalaryType
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
    buildingId: computed(() => activeBuilding.value?.id)
  }
})

const roleOptions = computed(() => {
  const dynamic = (roles.value || [])
    .filter(role => role.isActive)
    .map(role => ({ label: role.label, value: role.code }))

  return dynamic.length ? dynamic : [...DEFAULT_ROLE_OPTIONS]
})

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
  salaryType: 'fixed',
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

const objectScheduleByName = computed(() => {
  const map = new Map<string, WorkScheduleType>()

  for (const object of objects.value || []) {
    const name = object.name?.trim()
    if (!name) continue
    map.set(name, normalizeWorkScheduleType(object.scheduleType ?? object.schedule_type))
  }

  return map
})

const pinnedObjectOptions = computed(() => [
  { label: 'РќРµ Р·Р°РєСЂРµРїР»РµРЅ', value: NOT_PINNED_VALUE },
  ...objectOptions.value
])

function getSelectedScheduleType() {
  const names = [
    state.objectPinned?.trim(),
    ...state.objectPositions.map(position => position.trim())
  ].filter(Boolean)

  for (const name of names) {
    const scheduleType = objectScheduleByName.value.get(name)
    if (scheduleType) {
      return scheduleType
    }
  }

  return getLegacyWorkScheduleType({
    workShift: state.workShift,
    salaryType: state.salaryType
  })
}

const selectedSchedule = computed(() => getWorkScheduleDefinition(getSelectedScheduleType() || DEFAULT_WORK_SCHEDULE_TYPE))

function syncScheduleFromObject() {
  const schedule = selectedSchedule.value
  state.salaryType = schedule.salaryType
  state.workShift = schedule.workShift
}

watch([() => state.objectPinned, () => state.objectPositions, objectScheduleByName], () => {
  syncScheduleFromObject()
}, { deep: true })

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
  if (import.meta.client && 'crypto' in window && typeof window.crypto?.randomUUID === 'function') {
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
  state.salaryType = draft.salaryType ?? 'fixed'
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
      throw new Error('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєР°С‡Р°С‚СЊ С€Р°Р±Р»РѕРЅ')
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
      title: 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєР°С‡Р°С‚СЊ С€Р°Р±Р»РѕРЅ',
      description: getErrorMessage(error) || 'РџСЂРѕРІРµСЂСЊС‚Рµ API Рё РїРѕРІС‚РѕСЂРёС‚Рµ РїРѕРїС‹С‚РєСѓ.',
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
      throw new Error('Р’С‹Р±РµСЂРёС‚Рµ Р·РґР°РЅРёРµ РїРµСЂРµРґ РёРјРїРѕСЂС‚РѕРј.')
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
        salaryType: 'fixed',
        objectPinned: '',
        objectPositions: []
      }

      existingPhoneSet.add(phoneKey)
      upsertDraft(draft)
      addedToCache++
    }

    const errorCount = result.errors.length

    toast.add({
      title: 'Р¤Р°Р№Р» РѕР±СЂР°Р±РѕС‚Р°РЅ',
      description: `Р’ С‡РµСЂРЅРѕРІРёРєРё РґРѕР±Р°РІР»РµРЅРѕ: ${addedToCache}. РџСЂРѕРїСѓС‰РµРЅРѕ: ${result.skipped + skippedAlreadyCached}.`,
      color: errorCount ? 'warning' : 'success'
    })

    if (errorCount) {
      const firstErrors = result.errors.slice(0, 3)
      toast.add({
        title: 'РћС€РёР±РєРё РІ СЃС‚СЂРѕРєР°С… С„Р°Р№Р»Р°',
        description: firstErrors.map(item => `РЎС‚СЂРѕРєР° ${item.row}: ${item.message}`).join(' | '),
        color: 'warning'
      })
    }

    draftsOpen.value = true
  } catch (error: unknown) {
    toast.add({
      title: 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±СЂР°Р±РѕС‚Р°С‚СЊ С„Р°Р№Р»',
      description: getErrorMessage(error) || 'РџСЂРѕРІРµСЂСЊС‚Рµ С„Р°Р№Р» Рё РїРѕРІС‚РѕСЂРёС‚Рµ РїРѕРїС‹С‚РєСѓ.',
      color: 'error'
    })
  } finally {
    importing.value = false
    input.value = ''
  }
}

async function onCreateSubmit(event?: FormSubmitEvent<Record<string, unknown>>) {
  if (!event || saving.value) {
    return
  }

  const draft = editingDraft.value
  if (!draft) {
    return
  }

  saving.value = true

  try {
    const data = event.data as FormState
    const fullName = data.fullName.trim()
    const username = data.username.trim()
    const phoneNumber = data.phoneNumber.trim()
    const objectPinned = data.objectPinned?.trim() || ''
    const objectPositions = buildObjectPositions(data.objectPositions, objectPinned)
    syncScheduleFromObject()
    const schedule = selectedSchedule.value

    const nextDraft: DraftCustomer = {
      ...draft,
      updatedAt: new Date().toISOString(),
      fullName,
      username,
      phoneNumber,
      role: data.role,
      age: data.age,
      workShift: schedule.workShift,
      salaryType: schedule.salaryType,
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
        role: data.role,
        passportFile: `bulk-import/${username}.pdf`,
        age: data.age,
        workShift: schedule.workShift,
        salaryType: schedule.salaryType,
        objectPinned,
        objectPositions
      }
    })

    removeDraft(draft.id)
    await refreshNuxtData('/api/customers')

    toast.add({
      title: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃРѕР·РґР°РЅ',
      description: `@${username} РґРѕР±Р°РІР»РµРЅ РІ Postgres`,
      color: 'success'
    })

    closeEditor()
  } catch (error: unknown) {
    toast.add({
      title: 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ',
      description: getErrorMessage(error) || 'РџСЂРѕРІРµСЂСЊС‚Рµ РґР°РЅРЅС‹Рµ Рё РїРѕРІС‚РѕСЂРёС‚Рµ РїРѕРїС‹С‚РєСѓ.',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-2">
    <UButton
      label="РЁР°Р±Р»РѕРЅ XLSX"
      icon="i-lucide-file-spreadsheet"
      color="neutral"
      variant="outline"
      :loading="downloading"
      @click="downloadTemplate('xlsx')"
    />

    <UButton
      label="Р—Р°РіСЂСѓР·РёС‚СЊ Excel"
      icon="i-lucide-upload"
      color="primary"
      variant="subtle"
      :loading="importing"
      @click="pickFile"
    />

    <UButton
      :label="`Р§РµСЂРЅРѕРІРёРєРё (${activeBuildingDraftCount})`"
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
      fullscreen
      title="Р§РµСЂРЅРѕРІРёРєРё РјР°СЃСЃРѕРІРѕР№ Р·Р°РіСЂСѓР·РєРё"
      description="РЎС‚СЂРѕРєРё РёР· Excel СЃРѕС…СЂР°РЅРµРЅС‹ Р»РѕРєР°Р»СЊРЅРѕ. Р—Р°РїРѕР»РЅРёС‚Рµ РѕР±СЉРµРєС‚С‹ Рё СЃРѕР·РґР°Р№С‚Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ РїРѕ РѕРґРЅРѕРјСѓ."
    >
      <template #body>
        <div class="flex h-full min-h-0 flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm text-muted">
              Р—РґР°РЅРёРµ: <span class="font-medium text-highlighted">{{ activeBuilding?.name || 'вЂ”' }}</span>
            </p>
            <UButton
              label="РћС‡РёСЃС‚РёС‚СЊ"
              color="warning"
              variant="outline"
              :disabled="!activeBuildingDraftCount"
              @click="clearDraftsForActiveBuilding"
            />
          </div>

          <div v-if="!activeBuildingDraftCount" class="rounded-md border border-dashed border-default p-4 text-sm text-muted">
            Р§РµСЂРЅРѕРІРёРєРѕРІ РґР»СЏ СЌС‚РѕРіРѕ Р·РґР°РЅРёСЏ РїРѕРєР° РЅРµС‚.
          </div>

          <div v-else class="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
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
                  {{ draft.phoneNumber }} В· @{{ draft.username }}
                </p>
                <div v-if="draft.issues?.length" class="mt-2">
                  <UBadge color="warning" variant="soft">
                    Р•СЃС‚СЊ Р·Р°РјРµС‡Р°РЅРёСЏ ({{ draft.issues.length }})
                  </UBadge>
                  <ul class="mt-1 list-disc space-y-1 pl-5 text-xs text-warning-900 dark:text-warning-100">
                    <li v-for="issue in draft.issues" :key="issue" class="break-words">
                      {{ issue }}
                    </li>
                  </ul>
                </div>
              </div>

              <div class="flex shrink-0 items-center gap-2">
                <UButton
                  label="Р—Р°РїРѕР»РЅРёС‚СЊ"
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
      title="Р—Р°РїРѕР»РЅРёС‚СЊ РґР°РЅРЅС‹Рµ СЃРѕС‚СЂСѓРґРЅРёРєР°"
      :description="editingDraft ? `РЎС‚СЂРѕРєР° ${editingDraft.sourceRow} В· С‡РµСЂРЅРѕРІРёРє СЃРѕС…СЂР°РЅС‘РЅ Р»РѕРєР°Р»СЊРЅРѕ` : 'Р§РµСЂРЅРѕРІРёРє РЅРµ РІС‹Р±СЂР°РЅ'"
    >
      <template #body>
        <UForm
          :schema="createSchema"
          :state="state"
          :on-submit="onCreateSubmit"
          class="space-y-4"
        >
          <UFormField label="Р¤РРћ" name="fullName">
            <UInput v-model="state.fullName" class="w-full" placeholder="РЎР°СЂРґРѕСЂ РўСѓСЂРіСѓРЅРѕРІ" />
          </UFormField>

          <UFormField label="РРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ" name="username">
            <UInput v-model="state.username" class="w-full" placeholder="alex.smith" />
          </UFormField>

          <UFormField label="РќРѕРјРµСЂ С‚РµР»РµС„РѕРЅР°" name="phoneNumber">
            <UInput v-model="state.phoneNumber" class="w-full" placeholder="+998901112233" />
          </UFormField>

          <UFormField label="Р РѕР»СЊ" name="role">
            <USelect v-model="state.role" :items="roleOptions" class="w-full" />
          </UFormField>

          <UFormField label="Р’РѕР·СЂР°СЃС‚" name="age">
            <UInput
              v-model="state.age"
              class="w-full"
              type="number"
              min="18"
              step="1"
            />
          </UFormField>

          <UFormField label="Р“СЂР°С„РёРє РѕР±СЉРµРєС‚Р°">
            <UInput
              :model-value="selectedSchedule.label"
              class="w-full"
              disabled
            />
          </UFormField>

          <UFormField label="Р—Р°РєСЂРµРїР»РµРЅРЅС‹Р№ РѕР±СЉРµРєС‚" name="objectPinned">
            <USelect
              v-model="pinnedObjectModel"
              :items="pinnedObjectOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <UFormField label="РџРѕР·РёС†РёРё РѕР±СЉРµРєС‚Р°" name="objectPositions">
            <USelectMenu
              v-model="state.objectPositions"
              :items="objectOptions"
              value-key="value"
              label-key="label"
              multiple
              placeholder="Р’С‹Р±РµСЂРёС‚Рµ РѕР±СЉРµРєС‚С‹"
              class="w-full"
            />
          </UFormField>

          <div v-if="editingDraft?.issues?.length" class="rounded-md border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900 dark:border-warning-800 dark:bg-warning-950 dark:text-warning-100">
            <p class="font-medium">
              Р—Р°РјРµС‡Р°РЅРёСЏ РёР· РёРјРїРѕСЂС‚Р°:
            </p>
            <ul class="mt-1 list-disc space-y-1 pl-5">
              <li v-for="issue in editingDraft.issues" :key="issue">
                {{ issue }}
              </li>
            </ul>
          </div>

          <div class="flex justify-end gap-2">
            <UButton
              label="РћС‚РјРµРЅР°"
              color="neutral"
              variant="subtle"
              :disabled="saving"
              @click="closeEditor"
            />
            <UButton
              label="РЎРѕР·РґР°С‚СЊ РІ Р±Р°Р·Рµ"
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
