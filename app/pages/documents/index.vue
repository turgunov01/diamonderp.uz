<script setup lang="ts">
import { nextTick } from 'vue'
interface Customer {
  id: number
  username: string
  phoneNumber: string
  objectPinned: string
  objectPositions: string[]
}

interface DocumentTemplate {
  id: number
  name: string
  description?: string
  contractType: string
  createdAt: string
  updatedAt: string
}

type DispatchStatus = 'sent' | 'partially_signed' | 'signed'

interface DocumentDispatch {
  id: number
  templateId: number | null
  templateName?: string
  title: string
  recipientIds: number[]
  recipientPhones: string[]
  recipientCount: number
  signedCount: number
  status: DispatchStatus
  sentAt: string
  recipients?: {
    id: number
    username: string
    phoneNumber: string
  }[]
}

interface SignedDocument {
  id: number
  dispatchId: number | null
  templateId: number | null
  templateName?: string
  employeeName: string
  phoneNumber: string
  signedAt: string
  signedVia: string
  fileUrl?: string
  signaturePath?: string
}

interface DocumentsResponse {
  templates: DocumentTemplate[]
  sent: DocumentDispatch[]
  signed: SignedDocument[]
}

type ActiveBuilding = {
  id: number
  name: string
}

type ActiveObject = {
  id: number
  name: string
}

const toast = useToast()
const activeBuilding = useState<ActiveBuilding | null>('active-building', () => null)
const activeObject = useState<ActiveObject | null>('active-object', () => null)
const activeBuildingIdCookie = useCookie<number | null>('active-building-id', { default: () => null })
const activeObjectIdCookie = useCookie<number | null>('active-object-id', { default: () => null })

const activeTab = ref<'templates' | 'sent' | 'signed'>('templates')
const sendModalOpen = ref(false)
const selectedTemplateId = ref<number | undefined>()
const selectedRecipientIds = ref<number[]>([])
const sending = ref(false)
const exporting = ref(false)
const deletingId = ref<number | null>(null)
const deletingSentId = ref<number | null>(null)
const deletingSignedId = ref<number | null>(null)
const miniOpen = ref(false)
const miniContent = ref('<h1>Черновик договора</h1><p>Вставьте текст или переменные.</p>')
const miniEditor = ref<HTMLElement | null>(null)
const detailsOpen = ref(false)
const selectedDispatchId = ref<number | null>(null)
const signatureOpen = ref(false)
const signatureLoading = ref(false)
const signatureUrl = ref<string | null>(null)
const signatureDocument = ref<SignedDocument | null>(null)

const objectId = computed(() => activeObject.value?.id ?? activeObjectIdCookie.value ?? null)
const buildingId = computed(() => activeBuilding.value?.id ?? activeBuildingIdCookie.value ?? null)
const objectName = computed(() => activeObject.value?.name?.trim() || '')
const hasObjectScope = computed(() => Boolean(objectId.value))
const miniTokens = [
  { label: 'Имя', token: '{{employee_name}}' },
  { label: 'Телефон', token: '{{phone}}' },
  { label: 'Должность', token: '{{position}}' },
  { label: 'Объект', token: '{{object_name}}' },
  { label: 'Сумма', token: '{{amount}}' },
  { label: 'Дата', token: '{{date}}' }
]

function focusMini() {
  nextTick(() => miniEditor.value?.focus())
}

function runMiniCommand(command: string, value?: string) {
  if (!process.client) return
  focusMini()
  document.execCommand(command, false, value)
  miniContent.value = miniEditor.value?.innerHTML || ''
}

function insertMiniText(text: string) {
  runMiniCommand('insertText', text)
}

function onMiniInput(event: Event) {
  const target = event.target as HTMLElement | null
  miniContent.value = target?.innerHTML || ''
}

function clearMini() {
  miniContent.value = ''
  if (miniEditor.value) miniEditor.value.innerHTML = ''
}

async function copyMini() {
  if (!process.client) return
  const html = miniEditor.value?.innerHTML || ''
  await navigator.clipboard.writeText(html)
  toast.add({ title: 'Скопировано', color: 'success' })
}

function downloadMini() {
  const html = miniEditor.value?.innerHTML || ''
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'draft.html'
  a.click()
  URL.revokeObjectURL(url)
}

const tabs = [
  { label: 'Шаблоны', value: 'templates' },
  { label: 'Отправленные', value: 'sent' },
  { label: 'Подписанные', value: 'signed' }
]

const emptyDocuments = () => ({
  templates: [],
  sent: [],
  signed: []
})

const {
  data: documentsData,
  error,
  status,
  refresh
} = await useAutoRefreshAsyncData<DocumentsResponse>(
  'documents-data',
  () => {
    if (!objectId.value) {
      return Promise.resolve(emptyDocuments())
    }

    return $fetch('/api/documents', {
      query: {
        objectId: objectId.value
      }
    })
  },
  {
    default: emptyDocuments,
    watch: [objectId],
    immediate: false
  }
)

const {
  data: customers,
  refresh: refreshCustomers
} = await useAutoRefreshAsyncData<Customer[]>(
  'documents-customers',
  () => {
    const query: Record<string, number> = {}
    if (buildingId.value) {
      query.buildingId = buildingId.value
    }

    return $fetch('/api/customers', { query })
  },
  {
    default: () => [],
    watch: [buildingId],
    immediate: true
  }
)

watch(objectId, async (value) => {
  if (!value) {
    return
  }

  await refresh()
}, { immediate: true })

watch(buildingId, async (value) => {
  if (!value) {
    return
  }

  await refreshCustomers()
}, { immediate: true })

watch(error, (value) => {
  if (!value || !objectId.value) {
    return
  }

  toast.add({
    title: 'Не удалось загрузить документы',
    description: value.statusMessage || 'Проверьте API документов и подключение к Postgres.',
    color: 'error'
  })
}, { immediate: true })

watch(objectId, () => {
  sendModalOpen.value = false
  selectedTemplateId.value = undefined
  selectedRecipientIds.value = []
})

watch(signatureOpen, (open) => {
  if (open) return
  signatureUrl.value = null
  signatureDocument.value = null
  signatureLoading.value = false
})

const templateSelectItems = computed(() => {
  return (documentsData.value?.templates || []).map(template => ({
    label: `${template.name} (${template.contractType.toUpperCase()})`,
    value: template.id
  }))
})

const availableCustomers = computed(() => {
  const list = customers.value || []
  if (!objectName.value) {
    return list
  }

  const preferred = list.filter((customer) => {
    const pinned = (customer.objectPinned || '').trim()
    const positions = customer.objectPositions || []
    return pinned === objectName.value || positions.includes(objectName.value)
  })

  if (!preferred.length) {
    return list
  }

  const preferredIds = new Set(preferred.map(customer => customer.id))
  return [...preferred, ...list.filter(customer => !preferredIds.has(customer.id))]
})

const customerSelectItems = computed(() => {
  return availableCustomers.value.map(customer => ({
    label: `@${customer.username} - ${customer.phoneNumber}`,
    value: customer.id
  }))
})

const selectedDispatch = computed(() => {
  if (!selectedDispatchId.value) return null
  return documentsData.value?.sent.find(d => d.id === selectedDispatchId.value) || null
})

const selectedDispatchHistory = computed(() => {
  const dispatchId = selectedDispatchId.value
  if (!dispatchId) return []
  return (documentsData.value?.signed || []).filter(s => s.dispatchId === dispatchId)
})

function formatDate(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function statusLabel(statusValue: DispatchStatus) {
  if (statusValue === 'sent') {
    return 'В ожидании подписи'
  }

  if (statusValue === 'partially_signed') {
    return 'Частично подписано'
  }

  return 'Подписано'
}

function statusColor(statusValue: DispatchStatus) {
  if (statusValue === 'sent') {
    return 'warning'
  }

  if (statusValue === 'partially_signed') {
    return 'primary'
  }

  return 'success'
}

function openSendModal(templateId?: number) {
  if (!objectId.value) {
    toast.add({
      title: 'Сначала выберите объект',
      color: 'warning'
    })
    return
  }

  selectedTemplateId.value = templateId
  selectedRecipientIds.value = []
  sendModalOpen.value = true
}

function openDispatchDetails(id: number) {
  selectedDispatchId.value = id
  detailsOpen.value = true
}

function getErrorMessage(fetchError: unknown) {
  if (fetchError && typeof fetchError === 'object') {
    const err = fetchError as { data?: { statusMessage?: string }, message?: string }
    return err.data?.statusMessage || err.message
  }

  return undefined
}

async function sendDocument() {
  if (sending.value || !objectId.value) {
    return
  }

  if (!selectedTemplateId.value) {
    toast.add({
      title: 'Выберите шаблон',
      color: 'warning'
    })
    return
  }

  if (!selectedRecipientIds.value.length) {
    toast.add({
      title: 'Выберите сотрудников',
      color: 'warning'
    })
    return
  }

  sending.value = true

  try {
    await $fetch('/api/documents/send', {
      method: 'POST',
      body: {
        objectId: objectId.value,
        templateId: selectedTemplateId.value,
        recipientIds: selectedRecipientIds.value
      }
    })

    toast.add({
      title: 'Документ отправлен',
      description: `Сотрудников в отправке: ${selectedRecipientIds.value.length}`,
      color: 'success'
    })

    sendModalOpen.value = false
    await Promise.all([refresh(), refreshCustomers()])
  } catch (fetchError: unknown) {
    toast.add({
      title: 'Не удалось отправить документ',
      description: getErrorMessage(fetchError) || 'Повторите попытку.',
      color: 'error'
    })
  } finally {
    sending.value = false
  }
}

function createTemplate() {
  if (!objectId.value) {
    toast.add({
      title: 'Сначала выберите объект',
      color: 'warning'
    })
    return
  }

  navigateTo('/documents/builder')
}

function editTemplate(templateId: number) {
  navigateTo(`/documents/builder?templateId=${templateId}`)
}

async function deleteTemplate(templateId: number) {
  if (deletingId.value || !objectId.value) {
    return
  }

  deletingId.value = templateId

  try {
    await $fetch(`/api/documents/${templateId}`, {
      method: 'DELETE',
      query: {
        objectId: objectId.value
      }
    })

    toast.add({
      title: 'Шаблон удален',
      color: 'success'
    })

    await refresh()
  } catch (fetchError: unknown) {
    toast.add({
      title: 'Не удалось удалить шаблон',
      description: getErrorMessage(fetchError) || 'Попробуйте позже.',
      color: 'error'
    })
  } finally {
    deletingId.value = null
  }
}

function openSignatureExternal() {
  if (!process.client || !signatureUrl.value) return
  window.open(signatureUrl.value, '_blank', 'noopener,noreferrer')
}

async function openSignature(item: SignedDocument) {
  if (!objectId.value) {
    toast.add({ title: 'Сначала выберите объект', color: 'warning' })
    return
  }

  if (signatureLoading.value) return

  signatureDocument.value = item
  signatureUrl.value = null
  signatureOpen.value = true
  signatureLoading.value = true

  try {
    const response = await $fetch<{ url: string }>(`/api/documents/signed/${item.id}/signature`, {
      query: {
        objectId: objectId.value
      }
    })

    signatureUrl.value = response.url
  } catch (fetchError: unknown) {
    toast.add({
      title: 'Не удалось загрузить подпись',
      description: getErrorMessage(fetchError) || 'Проверьте API подписей и подключение к Postgres.',
      color: 'error'
    })
    signatureOpen.value = false
  } finally {
    signatureLoading.value = false
  }
}

async function deleteDispatch(id: number) {
  if (deletingSentId.value || !objectId.value) return
  deletingSentId.value = id
  try {
    await $fetch(`/api/documents/dispatch/${id}`, {
      method: 'DELETE',
      query: { objectId: objectId.value }
    })
    toast.add({ title: 'Отправка удалена', color: 'success' })
    await refresh()
  } catch (fetchError: unknown) {
    toast.add({
      title: 'Не удалось удалить отправку',
      description: getErrorMessage(fetchError) || 'Попробуйте позже.',
      color: 'error'
    })
  } finally {
    deletingSentId.value = null
  }
}

async function deleteSignedDoc(id: number) {
  if (deletingSignedId.value || !objectId.value) return
  deletingSignedId.value = id
  try {
    await $fetch(`/api/documents/signed/${id}`, {
      method: 'DELETE',
      query: { objectId: objectId.value }
    })
    toast.add({ title: 'Подписанный документ удалён', color: 'success' })
    await refresh()
  } catch (fetchError: unknown) {
    toast.add({
      title: 'Не удалось удалить запись',
      description: getErrorMessage(fetchError) || 'Попробуйте позже.',
      color: 'error'
    })
  } finally {
    deletingSignedId.value = null
  }
}

async function exportSigned(format: 'pdf' | 'xlsx' | 'csv') {
  if (exporting.value || !objectId.value) {
    return
  }

  exporting.value = true

  try {
    const response = await fetch(`/api/documents/export?scope=signed&format=${format}&objectId=${objectId.value}`)
    if (!response.ok) {
      throw new Error('Export failed')
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `signed-documents.${format}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (fetchError: unknown) {
    toast.add({
      title: 'Не удалось скачать файл',
      description: getErrorMessage(fetchError) || 'Проверьте API экспорта.',
      color: 'error'
    })
  } finally {
    exporting.value = false
  }
}

watch(miniOpen, (open) => {
  if (open) {
    nextTick(() => {
      if (miniEditor.value) {
        miniEditor.value.innerHTML = miniContent.value
        miniEditor.value.focus()
      }
    })
  }
})
</script>

<template>
  <UDashboardPanel id="documents">
    <template #header>
      <UDashboardNavbar title="Документы">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UBadge
            v-if="activeObject"
            :label="activeObject.name"
            color="neutral"
            variant="subtle"
          />
          <UButton
            icon="i-lucide-file-text"
            label="Мини Word"
            color="neutral"
            variant="ghost"
            @click="miniOpen = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="!hasObjectScope"
          color="warning"
          variant="subtle"
          title="Объект не выбран"
          description="Выберите объект в верхнем меню, чтобы работать с шаблонами и отправками."
        />

        <div class="flex flex-wrap items-center justify-between gap-3">
          <UTabs
            v-model="activeTab"
            :items="tabs"
            :content="false"
            class="w-full sm:w-max"
            :ui="{ list: 'w-full sm:w-max' }"
          />

          <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <UButton
              v-if="activeTab === 'templates'"
              label="Создать шаблон"
              icon="i-lucide-file-plus"
              class="flex-1 sm:flex-none"
              :disabled="!hasObjectScope"
              @click="createTemplate"
            />
            <UButton
              v-if="activeTab === 'sent'"
              label="Новая отправка"
              icon="i-lucide-send"
              class="flex-1 sm:flex-none"
              :disabled="!hasObjectScope"
              @click="openSendModal()"
            />
            <template v-if="activeTab === 'signed'">
              <UButton
                label="PDF"
                icon="i-lucide-file-text"
                color="neutral"
                variant="outline"
                :disabled="!hasObjectScope"
                :loading="exporting"
                @click="exportSigned('pdf')"
              />
              <UButton
                label="Excel"
                icon="i-lucide-file-spreadsheet"
                color="neutral"
                variant="outline"
                :disabled="!hasObjectScope"
                :loading="exporting"
                @click="exportSigned('xlsx')"
              />
              <UButton
                label="CSV"
                icon="i-lucide-file"
                color="neutral"
                variant="outline"
                :disabled="!hasObjectScope"
                :loading="exporting"
                @click="exportSigned('csv')"
              />
            </template>
          </div>
        </div>

        <div v-if="activeTab === 'templates'" class="grid gap-3 md:grid-cols-2">
          <div
            v-for="template in documentsData.templates"
            :key="template.id"
            class="rounded-lg border border-default bg-elevated/30 p-4 space-y-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-semibold text-highlighted">
                  {{ template.name }}
                </p>
                <p class="text-sm text-muted">
                  {{ template.description || 'Без описания' }}
                </p>
              </div>
              <UBadge :label="template.contractType.toUpperCase()" color="neutral" variant="subtle" />
            </div>

            <p class="text-xs text-muted">
              Обновлен: {{ formatDate(template.updatedAt) }}
            </p>

            <div class="flex flex-wrap items-center gap-2">
              <UButton
                label="Редактор"
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-lucide-pencil"
                @click="editTemplate(template.id)"
              />
              <UButton
                label="Отправить"
                size="sm"
                icon="i-lucide-send"
                @click="openSendModal(template.id)"
              />
              <UButton
                label="Удалить"
                size="sm"
                color="error"
                variant="outline"
                icon="i-lucide-trash"
                :loading="deletingId === template.id"
                @click="deleteTemplate(template.id)"
              />
            </div>
          </div>

          <div
            v-if="!documentsData.templates.length"
            class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted md:col-span-2"
          >
            Шаблонов пока нет для выбранного объекта.
          </div>
        </div>

        <div v-else-if="activeTab === 'sent'" class="space-y-3">
          <div class="rounded-lg border border-default overflow-x-auto hidden md:block">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-elevated/50">
                  <th class="px-3 py-2 text-left">
                    ID
                  </th>
                  <th class="px-3 py-2 text-left">
                    Заголовок
                  </th>
                  <th class="px-3 py-2 text-left">
                    Шаблон
                  </th>
                  <th class="px-3 py-2 text-left">
                    Сотрудники
                  </th>
                  <th class="px-3 py-2 text-left">
                    Подписано
                  </th>
                  <th class="px-3 py-2 text-left">
                    Статус
                  </th>
                  <th class="px-3 py-2 text-left">
                    Дата
                  </th>
                  <th class="px-3 py-2 text-left">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="dispatch in documentsData.sent"
                  :key="dispatch.id"
                  class="border-t border-default hover:bg-elevated/70 cursor-pointer"
                  @click="openDispatchDetails(dispatch.id)"
                >
                  <td class="px-3 py-2">
                    {{ dispatch.id }}
                  </td>
                  <td class="px-3 py-2">
                    {{ dispatch.title }}
                  </td>
                  <td class="px-3 py-2">
                    {{ dispatch.templateName || '-' }}
                  </td>
                  <td class="px-3 py-2">
                    <UBadge
                      :label="dispatch.recipientCount ? `${dispatch.recipientCount} чел.` : '—'"
                      variant="subtle"
                      color="neutral"
                    />
                  </td>
                  <td class="px-3 py-2">
                    {{ dispatch.signedCount }}
                  </td>
                  <td class="px-3 py-2">
                    <UBadge
                      :label="statusLabel(dispatch.status)"
                      :color="statusColor(dispatch.status)"
                      variant="subtle"
                    />
                  </td>
                  <td class="px-3 py-2">
                    {{ formatDate(dispatch.sentAt) }}
                  </td>
                  <td class="px-3 py-2">
                    <UButton
                      icon="i-lucide-trash"
                      color="error"
                      variant="ghost"
                      size="xs"
                      :loading="deletingSentId === dispatch.id"
                      @click.stop="deleteDispatch(dispatch.id)"
                    />
                  </td>
                </tr>
                <tr v-if="!documentsData.sent.length">
                  <td class="px-3 py-4 text-muted" colspan="8">
                    Отправленных документов пока нет.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="documentsData.sent.length" class="space-y-3 md:hidden">
            <div
              v-for="dispatch in documentsData.sent"
              :key="dispatch.id"
              class="rounded-lg border border-default bg-elevated/50 p-3 space-y-2 cursor-pointer"
              @click="openDispatchDetails(dispatch.id)"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="font-semibold text-highlighted">
                  #{{ dispatch.id }} · {{ dispatch.title }}
                </p>
                <UBadge :label="statusLabel(dispatch.status)" :color="statusColor(dispatch.status)" variant="subtle" />
              </div>
              <p class="text-xs text-muted">
                Шаблон: {{ dispatch.templateName || '-' }}
              </p>
              <div class="flex items-center gap-3 text-sm">
                <div>
                  <span class="font-medium">Сотрудники:</span>
                  <span class="text-muted">{{ dispatch.recipientCount ? `${dispatch.recipientCount} чел.` : '—' }}</span>
                </div>
              </div>
              <div class="text-xs text-muted">
                Подписано: {{ dispatch.signedCount }} / {{ dispatch.recipientCount }}
              </div>
              <p class="text-xs text-muted">
                Отправлено: {{ formatDate(dispatch.sentAt) }}
              </p>
              <div class="flex justify-end">
                <UButton
                  icon="i-lucide-trash"
                  color="error"
                  variant="ghost"
                  size="xs"
                  :loading="deletingSentId === dispatch.id"
                  @click.stop="deleteDispatch(dispatch.id)"
                />
              </div>
            </div>
          </div>

          <p v-else class="text-sm text-muted md:hidden">
            Отправленных документов пока нет.
          </p>
        </div>

        <div v-else class="space-y-3">
          <div class="rounded-lg border border-default overflow-x-auto hidden md:block">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-elevated/50">
                  <th class="px-3 py-2 text-left">
                    ID
                  </th>
                  <th class="px-3 py-2 text-left">
                    Сотрудник
                  </th>
                  <th class="px-3 py-2 text-left">
                    Телефон
                  </th>
                  <th class="px-3 py-2 text-left">
                    Шаблон
                  </th>
                  <th class="px-3 py-2 text-left">
                    Подписано через
                  </th>
                  <th class="px-3 py-2 text-left">
                    Дата подписи
                  </th>
                  <th class="px-3 py-2 text-left">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in documentsData.signed"
                  :key="item.id"
                  class="border-t border-default"
                >
                  <td class="px-3 py-2">
                    {{ item.id }}
                  </td>
                  <td class="px-3 py-2">
                    {{ item.employeeName }}
                  </td>
                  <td class="px-3 py-2">
                    {{ item.phoneNumber }}
                  </td>
                  <td class="px-3 py-2">
                    {{ item.templateName || '-' }}
                  </td>
                  <td class="px-3 py-2">
                    {{ item.signedVia }}
                  </td>
                  <td class="px-3 py-2">
                    {{ formatDate(item.signedAt) }}
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex items-center gap-1">
                      <UButton
                        icon="i-lucide-eye"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        :disabled="!(item.signaturePath || item.fileUrl)"
                        @click.stop="openSignature(item)"
                      />
                      <UButton
                        icon="i-lucide-trash"
                        color="error"
                        variant="ghost"
                        size="xs"
                        :loading="deletingSignedId === item.id"
                        @click.stop="deleteSignedDoc(item.id)"
                      />
                    </div>
                  </td>
                </tr>
                <tr v-if="!documentsData.signed.length">
                  <td class="px-3 py-4 text-muted" colspan="7">
                    Подписанных документов пока нет.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="documentsData.signed.length" class="space-y-3 md:hidden">
            <div
              v-for="item in documentsData.signed"
              :key="item.id"
              class="rounded-lg border border-default bg-elevated/50 p-3 space-y-2"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="font-semibold text-highlighted">
                  #{{ item.id }} · {{ item.employeeName }}
                </p>
                <span class="text-xs text-muted">{{ formatDate(item.signedAt) }}</span>
              </div>
              <p class="text-sm text-muted">
                Телефон: {{ item.phoneNumber }}
              </p>
              <p class="text-sm">
                Шаблон: {{ item.templateName || '-' }}
              </p>
              <p class="text-sm text-muted">
                Подписано через: {{ item.signedVia }}
              </p>
              <div class="flex justify-end gap-1">
                <UButton
                  icon="i-lucide-eye"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :disabled="!(item.signaturePath || item.fileUrl)"
                  @click.stop="openSignature(item)"
                />
                <UButton
                  icon="i-lucide-trash"
                  color="error"
                  variant="ghost"
                  size="xs"
                  :loading="deletingSignedId === item.id"
                  @click.stop="deleteSignedDoc(item.id)"
                />
              </div>
            </div>
          </div>

          <p v-else class="text-sm text-muted md:hidden">
            Подписанных документов пока нет.
          </p>
        </div>

        <p v-if="status === 'pending'" class="text-sm text-muted">
          Загрузка документов...
        </p>
      </div>

      <UModal
        v-model:open="miniOpen"
        title="Мини Word"
        description="Быстрый черновик без идей."
        size="xl"
      >
        <template #body>
          <div class="space-y-4">
            <div class="flex flex-wrap gap-2">
              <UButton size="xs" icon="i-lucide-bold" variant="ghost" @click="runMiniCommand('bold')" />
              <UButton size="xs" icon="i-lucide-italic" variant="ghost" @click="runMiniCommand('italic')" />
              <UButton size="xs" icon="i-lucide-underline" variant="ghost" @click="runMiniCommand('underline')" />
              <UButton size="xs" icon="i-lucide-heading-1" variant="ghost" @click="runMiniCommand('formatBlock', 'h1')" />
              <UButton size="xs" icon="i-lucide-heading-2" variant="ghost" @click="runMiniCommand('formatBlock', 'h2')" />
              <UButton size="xs" icon="i-lucide-list" variant="ghost" @click="runMiniCommand('insertUnorderedList')" />
              <UButton size="xs" icon="i-lucide-list-ordered" variant="ghost" @click="runMiniCommand('insertOrderedList')" />
              <UButton
                size="xs"
                icon="i-lucide-link"
                variant="ghost"
                @click="() => { const url = prompt('Ссылка'); if (url) runMiniCommand('createLink', url) }"
              />
              <UButton size="xs" icon="i-lucide-eraser" color="warning" variant="ghost" @click="clearMini" />
              <UButton size="xs" icon="i-lucide-copy" color="neutral" variant="ghost" @click="copyMini" />
              <UButton size="xs" icon="i-lucide-download" color="neutral" variant="ghost" @click="downloadMini" />
            </div>

            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="token in miniTokens"
                :key="token.token"
                color="neutral"
                variant="subtle"
                class="cursor-pointer"
                @click="insertMiniText(token.token)"
              >
                {{ token.label }}
              </UBadge>
            </div>

            <div
              ref="miniEditor"
              class="prose max-w-none min-h-[320px] max-h-[60vh] overflow-y-auto rounded-lg border border-default bg-white text-black p-3 outline-none focus:ring-2 focus:ring-primary"
              contenteditable="true"
              spellcheck="true"
              @input="onMiniInput"
            />
          </div>
        </template>
      </UModal>

      <UModal
        v-model:open="sendModalOpen"
        title="Отправка документа"
        description="Выберите шаблон и сотрудников, которые подпишут документ в мобильном приложении"
      >
        <template #body>
          <div class="space-y-4">
            <UFormField label="Шаблон">
              <USelect
                v-model="selectedTemplateId"
                :items="templateSelectItems"
                value-key="value"
                class="w-full"
                placeholder="Выберите шаблон"
              />
            </UFormField>

            <UFormField label="Сотрудники">
              <USelectMenu
                v-model="selectedRecipientIds"
                :items="customerSelectItems"
                value-key="value"
                label-key="label"
                multiple
                searchable
                class="w-full"
                placeholder="Выберите сотрудников"
              />
            </UFormField>

            <p v-if="!customerSelectItems.length" class="text-xs text-muted">
              Для текущего объекта нет сотрудников с привязкой по "Позиции объекта" или "Закрепленному объекту".
            </p>

            <div class="flex items-center justify-end gap-2">
              <UButton
                label="Отмена"
                color="neutral"
                variant="subtle"
                :disabled="sending"
                @click="sendModalOpen = false"
              />
              <UButton
                label="Отправить"
                icon="i-lucide-send"
                :loading="sending"
                @click="sendDocument"
              />
            </div>
          </div>
        </template>
      </UModal>

      <UModal
        v-model:open="detailsOpen"
        title="Детали отправки"
        :description="selectedDispatch ? selectedDispatch.title : 'Сведения о получателях и ходе подписания.'"
        class="!max-w-6xl !max-h-[calc(100dvh-1rem)] sm:!max-h-[calc(100dvh-2rem)]"
      >
        <template #body>
          <div v-if="selectedDispatch" class="space-y-4">
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <UBadge :label="statusLabel(selectedDispatch.status)" :color="statusColor(selectedDispatch.status)" variant="subtle" />
              <span class="text-muted">ID: {{ selectedDispatch.id }}</span>
              <span class="text-muted">Шаблон: {{ selectedDispatch.templateName || '—' }}</span>
              <span class="text-muted">Отправлено: {{ formatDate(selectedDispatch.sentAt) }}</span>
            </div>

            <div class="space-y-2">
              <h4 class="font-semibold text-highlighted">Сотрудники</h4>
              <div v-if="selectedDispatch.recipients?.length" class="flex flex-wrap gap-2">
                <UBadge
                  v-for="rec in selectedDispatch.recipients"
                  :key="rec.id"
                  :label="`@${rec.username}`"
                  color="neutral"
                  variant="subtle"
                />
              </div>
              <p v-else class="text-sm text-muted">Получатели не найдены.</p>
              <p class="text-xs text-muted">Подписано: {{ selectedDispatch.signedCount }} / {{ selectedDispatch.recipientCount }}</p>
            </div>

            <div class="space-y-2">
              <h4 class="font-semibold text-highlighted">История действий</h4>
              <div v-if="selectedDispatchHistory.length" class="rounded-lg border border-default overflow-x-auto">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="bg-elevated/50">
                      <th class="px-3 py-2 text-left">Сотрудник</th>
                      <th class="px-3 py-2 text-left">Телефон</th>
                      <th class="px-3 py-2 text-left">Подписано</th>
                      <th class="px-3 py-2 text-left">Способ</th>
                      <th class="px-3 py-2 text-left">Подпись</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="item in selectedDispatchHistory"
                      :key="item.id"
                      class="border-t border-default"
                    >
                      <td class="px-3 py-2">{{ item.employeeName }}</td>
                      <td class="px-3 py-2">{{ item.phoneNumber }}</td>
                      <td class="px-3 py-2">{{ formatDate(item.signedAt) }}</td>
                      <td class="px-3 py-2">{{ item.signedVia }}</td>
                      <td class="px-3 py-2">
                        <UButton
                          icon="i-lucide-eye"
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          :disabled="!(item.signaturePath || item.fileUrl)"
                          @click.stop="openSignature(item)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="text-sm text-muted">Подписей по этой отправке пока нет.</p>
            </div>
          </div>
          <div v-else class="text-sm text-muted">Выберите отправку, чтобы увидеть детали.</div>
        </template>
      </UModal>

      <UModal
        v-model:open="signatureOpen"
        title="Подпись сотрудника"
        :description="signatureDocument ? `${signatureDocument.employeeName} · ${formatDate(signatureDocument.signedAt)}` : 'Просмотр подписи.'"
      >
        <template #body>
          <div class="space-y-4">
            <p v-if="signatureLoading" class="text-sm text-muted">
              Загрузка подписи...
            </p>

            <div v-else-if="signatureUrl" class="rounded-lg border border-default bg-white p-3">
              <img
                :src="signatureUrl"
                alt="Подпись сотрудника"
                class="max-h-[360px] w-full object-contain"
                loading="lazy"
              >
            </div>

            <p v-else class="text-sm text-muted">
              Подпись не найдена.
            </p>

            <div class="flex items-center justify-end gap-2">
              <UButton
                label="Закрыть"
                color="neutral"
                variant="subtle"
                @click="signatureOpen = false"
              />
              <UButton
                v-if="signatureUrl"
                label="Открыть"
                icon="i-lucide-external-link"
                color="neutral"
                variant="ghost"
                @click="openSignatureExternal"
              />
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
