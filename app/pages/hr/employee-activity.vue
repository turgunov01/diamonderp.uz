<script setup lang="ts">
import { h } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import { storeToRefs } from 'pinia'
import type { EmployeeActivityRecord, EmployeeActivityStatus } from '~/stores/employeeActivity'

definePageMeta({
  title: 'Активность сотрудников'
})

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const toast = useToast()
const employeeActivityStore = useEmployeeActivityStore()
const { list, loading } = storeToRefs(employeeActivityStore)

const filters = reactive({
  from: '',
  to: ''
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

async function loadActivities() {
  try {
    await employeeActivityStore.fetchActivities({
      from: filters.from,
      to: filters.to
    })
  } catch (error) {
    toast.add({
      title: 'Не удалось загрузить активность сотрудников',
      description: getErrorMessage(error) || 'Проверьте API-заглушку активности сотрудников.',
      color: 'error'
    })
  }
}

async function applyFilters() {
  await loadActivities()
}

async function resetFilters() {
  filters.from = ''
  filters.to = ''
  await loadActivities()
}

function editRecord(record: EmployeeActivityRecord) {
  toast.add({
    title: 'Редактирование пока недоступно',
    description: `${record.employeeName} за ${formatDate(record.date)}`,
    color: 'neutral'
  })
}

if (import.meta.server) {
  await loadActivities()
} else {
  employeeActivityStore.$patch({ list: [] })
  void loadActivities()
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
    cell: ({ row }) => {
      return h(UBadge, {
        color: statusColor(row.original.status),
        variant: 'subtle'
      }, () => statusLabel(row.original.status))
    }
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
    cell: ({ row }) => {
      return h('div', { class: 'flex justify-end' }, [
        h(UButton, {
          label: 'Редактировать',
          icon: 'i-lucide-pencil',
          size: 'xs',
          color: 'primary',
          variant: 'subtle',
          onClick: () => editRecord(row.original)
        })
      ])
    }
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
                class="min-w-36 rounded-xl border border-default bg-elevated/40 px-4 py-3 animate-pulse space-y-2"
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
            <div class="flex flex-col gap-4 sm:flex-row">
              <UFormField label="С" class="min-w-44">
                <UInput
                  v-model="filters.from"
                  type="date"
                  :max="filters.to || undefined"
                />
              </UFormField>

              <UFormField label="По" class="min-w-44">
                <UInput
                  v-model="filters.to"
                  type="date"
                  :min="filters.from || undefined"
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
                :disabled="!filters.from && !filters.to"
                @click="resetFilters"
              />
            </div>
          </div>
        </UCard>

        <UCard :ui="{ body: '!p-0' }">
          <div class="flex items-center justify-between gap-3 border-b border-default px-4 py-4 sm:px-6">
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                Таблица активности сотрудников
              </h2>
              <p class="text-sm text-muted">
                Временные записи загружаются из <code>/api/employee/activity</code>.
              </p>
            </div>

            <UButton
              label="Обновить"
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              :loading="loading"
              @click="loadActivities"
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
    </template>
  </UDashboardPanel>
</template>
