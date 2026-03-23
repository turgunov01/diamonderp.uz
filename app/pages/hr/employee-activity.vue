<script setup lang="ts">
import { h } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import { storeToRefs } from 'pinia'
import type { EmployeeActivityRecord, EmployeeActivityStatus } from '~/stores/employeeActivity'

interface CustomerFilterItem {
  id: number
  username: string
}

interface EmployeeSelectItem {
  label: string
  value: number
}

definePageMeta({
  title: 'Активность сотрудников'
})

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const toast = useToast()
const employeeActivityStore = useEmployeeActivityStore()
const { list, loading } = storeToRefs(employeeActivityStore)
const activeBuilding = useState<{ id: number, name: string } | null>('active-building')
const editOpen = ref(false)
const editLoading = ref(false)
const employeesLoading = ref(false)
const editingRecord = ref<EmployeeActivityRecord | null>(null)
const employeeOptions = ref<EmployeeSelectItem[]>([])

const filters = reactive({
  from: '',
  to: '',
  employeeIds: [] as number[]
})

const editState = reactive({
  date: '',
  status: 'on_time' as EmployeeActivityStatus,
  workMinutes: '',
  lateMinutes: ''
})

function statusColor(status: EmployeeActivityStatus) {
  if (status === 'on_time') return 'success'
  if (status === 'late') return 'warning'
  return 'error'
}

function statusLabel(status: EmployeeActivityStatus) {
  if (status === 'on_time') return 'Вовремя'
  if (status === 'late') return 'Опоздание'
  return 'Отсутствие'
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

function formatMinutes(value: number) {
  return `${value.toLocaleString()} мин`
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    return err.data?.statusMessage || err.message
  }

  return undefined
}

function normalizeEmployeeFilters() {
  if (!filters.employeeIds.length) {
    return
  }

  const availableIds = new Set(employeeOptions.value.map(item => item.value))
  filters.employeeIds = filters.employeeIds.filter(employeeId => availableIds.has(employeeId))
}

async function loadEmployeeOptions() {
  employeesLoading.value = true

  try {
    const customers = await $fetch<CustomerFilterItem[]>('/api/customers', {
      query: {
        buildingId: activeBuilding.value?.id || undefined
      }
    })

    employeeOptions.value = customers
      .map(customer => ({
        label: customer.username,
        value: customer.id
      }))
      .sort((left, right) => left.label.localeCompare(right.label, 'ru'))

    normalizeEmployeeFilters()
  } catch (error) {
    employeeOptions.value = []
    filters.employeeIds = []

    toast.add({
      title: 'Не удалось загрузить список сотрудников',
      description: getErrorMessage(error) || 'Повторите попытку позже.',
      color: 'error'
    })
  } finally {
    employeesLoading.value = false
  }
}

async function loadActivities() {
  try {
    await employeeActivityStore.fetchActivities({
      from: filters.from,
      to: filters.to,
      buildingId: activeBuilding.value?.id,
      employeeIds: filters.employeeIds
    })
  } catch (error) {
    toast.add({
      title: 'Не удалось загрузить активность сотрудников',
      description: getErrorMessage(error) || 'Проверьте API активности сотрудников.',
      color: 'error'
    })
  }
}

async function loadPageData() {
  await loadEmployeeOptions()
  await loadActivities()
}

watch(() => activeBuilding.value?.id, async (newBuildingId, oldBuildingId) => {
  if (newBuildingId === oldBuildingId) {
    return
  }

  filters.employeeIds = []
  employeeActivityStore.$patch({ list: [] })
  await loadPageData()
})

watch(() => editState.status, (status) => {
  if (status === 'on_time') {
    editState.lateMinutes = '0'
  }

  if (status === 'absent') {
    editState.workMinutes = '0'
    editState.lateMinutes = '0'
  }
})

async function applyFilters() {
  await loadActivities()
}

async function resetFilters() {
  filters.from = ''
  filters.to = ''
  filters.employeeIds = []
  await loadActivities()
}

function openEditModal(record: EmployeeActivityRecord) {
  editingRecord.value = record
  editState.date = record.date.slice(0, 10)
  editState.status = record.status
  editState.workMinutes = String(record.workMinutes)
  editState.lateMinutes = String(record.lateMinutes)
  editOpen.value = true
}

function parseNonNegativeInteger(value: string, fieldLabel: string) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Поле "${fieldLabel}" должно быть целым числом не меньше 0.`)
  }

  return parsed
}

function normalizeEditValues() {
  let workMinutes = parseNonNegativeInteger(editState.workMinutes || '0', 'Рабочие минуты')
  let lateMinutes = parseNonNegativeInteger(editState.lateMinutes || '0', 'Минуты опоздания')

  if (editState.status === 'on_time') {
    lateMinutes = 0
  }

  if (editState.status === 'absent') {
    workMinutes = 0
    lateMinutes = 0
  }

  return {
    workMinutes,
    lateMinutes
  }
}

async function saveEditRecord() {
  if (!editingRecord.value || editLoading.value) {
    return
  }

  editLoading.value = true

  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editState.date)) {
      throw new Error('Поле "Дата" должно быть в формате YYYY-MM-DD.')
    }

    const { workMinutes, lateMinutes } = normalizeEditValues()

    await employeeActivityStore.updateActivity(editingRecord.value.id, {
      date: editState.date,
      status: editState.status,
      workMinutes,
      lateMinutes
    })

    await loadActivities()
    editOpen.value = false

    toast.add({
      title: 'Активность обновлена',
      description: `${editingRecord.value.employeeName} за ${formatDate(editState.date)}`,
      color: 'success'
    })
  } catch (error) {
    toast.add({
      title: 'Не удалось сохранить изменения',
      description: getErrorMessage(error) || 'Повторите попытку.',
      color: 'error'
    })
  } finally {
    editLoading.value = false
  }
}

if (import.meta.server) {
  await loadPageData()
} else {
  employeeActivityStore.$patch({ list: [] })
  employeeOptions.value = []
  void loadPageData()
}

const totalWorkMinutes = computed(() =>
  list.value.reduce((total, item) => total + item.workMinutes, 0)
)

const lateCount = computed(() =>
  list.value.filter(item => item.status === 'late').length
)

const absentCount = computed(() =>
  list.value.filter(item => item.status === 'absent').length
)

const columns: TableColumn<EmployeeActivityRecord>[] = [
  {
    accessorKey: 'employeeName',
    header: 'Сотрудник'
  },
  {
    accessorKey: 'date',
    header: 'Дата',
    cell: ({ row }) => formatDate(row.getValue('date'))
  },
  {
    accessorKey: 'status',
    header: 'Статус',
    cell: ({ row }) => h(UBadge, {
      color: statusColor(row.original.status),
      variant: 'subtle'
    }, () => statusLabel(row.original.status))
  },
  {
    accessorKey: 'workMinutes',
    header: 'Рабочие минуты',
    cell: ({ row }) => formatMinutes(Number(row.getValue('workMinutes')))
  },
  {
    accessorKey: 'lateMinutes',
    header: 'Минуты опоздания',
    cell: ({ row }) => formatMinutes(Number(row.getValue('lateMinutes')))
  },
  {
    id: 'actions',
    header: () => h('div', { class: 'text-right' }, 'Действия'),
    cell: ({ row }) => h('div', { class: 'flex justify-end' }, [
      h(UButton, {
        label: 'Редактировать',
        icon: 'i-lucide-pencil',
        size: 'xs',
        color: 'primary',
        variant: 'subtle',
        onClick: () => openEditModal(row.original)
      })
    ])
  }
]
</script>

<template>
  <UDashboardPanel id="employee-activity">
    <template #header>
      <UDashboardNavbar title="Активность сотрудников">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UCard :ui="{ body: 'space-y-6' }">
          <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div class="space-y-2">
              <p class="text-sm font-medium text-primary">
                Кадры
              </p>
              <div class="space-y-1">
                <h1 class="text-2xl font-semibold text-highlighted">
                  Активность сотрудников
                </h1>
                <p class="max-w-2xl text-sm text-muted">
                  Отслеживайте посещаемость, рабочее время и опоздания сотрудников.
                </p>
              </div>
            </div>

            <div v-if="loading" class="flex flex-wrap gap-3">
              <div
                v-for="n in 4"
                :key="`activity-stat-${n}`"
                class="min-w-36 animate-pulse space-y-2 rounded-xl border border-default bg-elevated/40 px-4 py-3"
              >
                <div class="h-3 w-20 rounded bg-default/50" />
                <div class="h-8 w-24 rounded bg-default/70" />
              </div>
            </div>

            <div v-else class="flex flex-wrap gap-3">
              <div class="min-w-36 rounded-xl border border-default bg-elevated/40 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted">
                  Записи
                </p>
                <p class="mt-2 text-2xl font-semibold text-highlighted">
                  {{ list.length }}
                </p>
              </div>

              <div class="min-w-36 rounded-xl border border-default bg-elevated/40 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted">
                  Опоздания
                </p>
                <p class="mt-2 text-2xl font-semibold text-highlighted">
                  {{ lateCount }}
                </p>
              </div>

              <div class="min-w-36 rounded-xl border border-default bg-elevated/40 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted">
                  Отсутствия
                </p>
                <p class="mt-2 text-2xl font-semibold text-highlighted">
                  {{ absentCount }}
                </p>
              </div>

              <div class="min-w-36 rounded-xl border border-default bg-elevated/40 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-muted">
                  Рабочие минуты
                </p>
                <p class="mt-2 text-2xl font-semibold text-highlighted">
                  {{ formatMinutes(totalWorkMinutes) }}
                </p>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div class="grid flex-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <UFormField label="С">
                <UInput
                  v-model="filters.from"
                  type="date"
                  :max="filters.to || undefined"
                />
              </UFormField>

              <UFormField label="По">
                <UInput
                  v-model="filters.to"
                  type="date"
                  :min="filters.from || undefined"
                />
              </UFormField>

              <UFormField label="Сотрудники">
                <USelectMenu
                  v-model="filters.employeeIds"
                  :items="employeeOptions"
                  value-key="value"
                  label-key="label"
                  multiple
                  searchable
                  class="w-full"
                  placeholder="Выберите сотрудников"
                  :disabled="employeesLoading"
                />
              </UFormField>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                label="Применить"
                icon="i-lucide-filter"
                color="primary"
                :loading="loading"
                @click="applyFilters"
              />

              <UButton
                label="Сбросить"
                icon="i-lucide-rotate-cw"
                color="neutral"
                variant="subtle"
                :disabled="!filters.from && !filters.to && !filters.employeeIds.length"
                @click="resetFilters"
              />
            </div>
          </div>

          <p v-if="!employeeOptions.length && !employeesLoading" class="text-xs text-muted">
            Для текущего здания сотрудники не найдены.
          </p>
        </UCard>

        <UCard :ui="{ body: '!p-0' }">
          <div class="flex items-center justify-between gap-3 border-b border-default px-4 py-4 sm:px-6">
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                Таблица активности сотрудников
              </h2>
              <p class="text-sm text-muted">
                Записи загружаются из <code>/api/employee/activity</code>.
              </p>
            </div>

            <UButton
              label="Обновить"
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              :loading="loading || employeesLoading"
              @click="loadPageData"
            />
          </div>

          <UTable
            :data="list"
            :columns="columns"
            :loading="loading"
            class="shrink-0"
            :ui="{
              base: 'table-fixed border-separate border-spacing-0',
              thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
              tbody: '[&>tr]:last:[&>td]:border-b-0',
              th: 'py-3 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
              td: 'border-b border-default align-top',
              separator: 'h-0'
            }"
          />

          <div v-if="!list.length && !loading" class="px-6 py-10 text-center text-sm text-muted">
            За выбранный период записи активности сотрудников не найдены.
          </div>
        </UCard>
      </div>

      <UModal
        v-model:open="editOpen"
        :title="editingRecord ? `Редактировать активность: ${editingRecord.employeeName}` : 'Редактировать активность'"
        description="Измените дату, статус и рабочие метрики сотрудника."
      >
        <template #body>
          <div class="space-y-4">
            <UFormField label="Дата">
              <UInput
                v-model="editState.date"
                type="date"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Статус">
              <USelect
                v-model="editState.status"
                :items="[
                  { label: 'Вовремя', value: 'on_time' },
                  { label: 'Опоздание', value: 'late' },
                  { label: 'Отсутствие', value: 'absent' }
                ]"
                class="w-full"
              />
            </UFormField>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Рабочие минуты">
                <UInput
                  v-model="editState.workMinutes"
                  type="number"
                  min="0"
                  step="1"
                  :disabled="editState.status === 'absent'"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Минуты опоздания">
                <UInput
                  v-model="editState.lateMinutes"
                  type="number"
                  min="0"
                  step="1"
                  :disabled="editState.status !== 'late'"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              label="Отмена"
              color="neutral"
              variant="subtle"
              :disabled="editLoading"
              @click="editOpen = false"
            />
            <UButton
              label="Сохранить"
              color="primary"
              :loading="editLoading"
              @click="saveEditRecord"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
