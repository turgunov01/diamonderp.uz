<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { upperFirst } from 'scule'
import { getPaginationRowModel } from '@tanstack/table-core'
import type { Row } from '@tanstack/table-core'

interface Customer {
  id: number
  username: string
  avatar: {
    src: string
  }
  password: string
  phoneNumber: string
  passportFile: string
  age: number
  workShift: 'day' | 'night'
  objectPinned: string
  objectPositions: string[]
  baseSalary: number
  positionBonus: number
  salaryCurrency: 'UZS'
}

type CustomerStatus = 'active' | 'inactive'

interface ShiftDraft {
  workShift: 'day' | 'night'
  saving: boolean
}

interface SalaryDraft {
  baseSalary: number
  positionBonus: number
  saving: boolean
}

const UAvatar = resolveComponent('UAvatar')
const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UCheckbox = resolveComponent('UCheckbox')

const toast = useToast()
const table = useTemplateRef('table')
const activeBuilding = useState<{ id: number, name: string } | null>('active-building')
const customerInfoOpen = ref(false)
const selectedCustomer = ref<Customer | null>(null)
const deletingSelected = ref(false)
const editCustomerOpen = ref(false)
const editingCustomer = ref<Customer | null>(null)

const hrTabs = [{
  label: 'Пользователи',
  value: 'users'
}, {
  label: 'Смены',
  value: 'shifts'
}, {
  label: 'Зарплаты',
  value: 'salaries'
}]
const selectedHrTab = ref('users')

const columnFilters = ref([{
  id: 'username',
  value: ''
}])
const columnVisibility = ref()
const rowSelection = ref({})

const shiftDrafts = ref<Record<number, ShiftDraft>>({})
const salaryDrafts = ref<Record<number, SalaryDraft>>({})

const { data, status, error, refresh } = await useAutoRefreshFetch<Customer[]>('/api/customers', {
  lazy: true,
  default: () => [],
  query: {
    buildingId: computed(() => activeBuilding.value?.id)
  }
})
const safeCustomers = computed(() => data.value || [])
const isLoading = computed(() => status.value === 'pending' || status.value === 'idle')

watch(error, (newError) => {
  if (!newError) {
    return
  }

  toast.add({
    title: 'Не удалось загрузить клиентов',
    description: newError.statusMessage || 'Проверьте API и переменные окружения Supabase.',
    color: 'error'
  })
}, { immediate: true })

watch(data, (customers) => {
  if (!customers?.length) {
    shiftDrafts.value = {}
    salaryDrafts.value = {}
    return
  }

  const nextShiftDrafts: Record<number, ShiftDraft> = {}
  const nextSalaryDrafts: Record<number, SalaryDraft> = {}

  for (const customer of customers) {
    nextShiftDrafts[customer.id] = {
      workShift: customer.workShift,
      saving: false
    }

    nextSalaryDrafts[customer.id] = {
      baseSalary: customer.baseSalary,
      positionBonus: customer.positionBonus,
      saving: false
    }
  }

  shiftDrafts.value = nextShiftDrafts
  salaryDrafts.value = nextSalaryDrafts
}, { immediate: true })

function openCustomerInfo(customer: Customer) {
  selectedCustomer.value = customer
  customerInfoOpen.value = true
}

function openCustomerEdit(customer: Customer) {
  editingCustomer.value = customer
  editCustomerOpen.value = true
}

watch(editCustomerOpen, (value) => {
  if (!value) {
    editingCustomer.value = null
  }
})

function getRowItems(row: Row<Customer>) {
  return [
    {
      type: 'label',
      label: 'Действия'
    },
    {
      label: 'Копировать ID клиента',
      icon: 'i-lucide-copy',
      onSelect() {
        navigator.clipboard.writeText(row.original.id.toString())
        toast.add({
          title: 'Скопировано',
          description: 'ID клиента скопирован в буфер обмена'
        })
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Редактировать клиента',
      icon: 'i-lucide-pencil',
      onSelect() {
        openCustomerEdit(row.original)
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Посмотреть данные клиента',
      icon: 'i-lucide-list',
      onSelect() {
        openCustomerInfo(row.original)
      }
    },
    {
      label: 'Удалить клиента',
      icon: 'i-lucide-trash',
      color: 'error',
      onSelect() {
        void deleteCustomer(row.original)
      }
    }
  ]
}

const userColumns: TableColumn<Customer>[] = [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        'modelValue': table.getIsSomePageRowsSelected()
          ? 'indeterminate'
          : table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
          table.toggleAllPageRowsSelected(!!value),
        'ariaLabel': 'Выбрать все'
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        'modelValue': row.getIsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') => row.toggleSelected(!!value),
        'ariaLabel': 'Выбрать строку'
      })
  },
  {
    accessorKey: 'id',
    header: 'ID'
  },
  {
    accessorKey: 'username',
    header: 'Пользователь',
    cell: ({ row }) => {
      return h('div', { class: 'flex items-center gap-3' }, [
        h(UAvatar, {
          ...row.original.avatar,
          size: 'lg'
        }),
        h('div', undefined, [
          h('button', {
            class: 'font-medium text-highlighted hover:underline',
            onClick: () => openCustomerInfo(row.original)
          }, `@${row.original.username}`),
          h('p', { class: 'text-muted' }, row.original.phoneNumber)
        ])
      ])
    }
  },
  {
    accessorKey: 'age',
    header: 'Возраст'
  },
  {
    accessorKey: 'workShift',
    header: 'Смена',
    cell: ({ row }) => {
      const color = row.original.workShift === 'day' ? 'success' : 'warning'
      return h(UBadge, { class: 'capitalize', variant: 'subtle', color }, () =>
        row.original.workShift === 'day' ? 'день' : 'ночь'
      )
    }
  },
  /**{
    id: 'status',
    header: 'Статус',
    cell: ({ row }) => {
      return h('div', { class: 'space-y-1' }, [
        h(UBadge, {
          label: getCustomerStatusLabel(row.original),
          color: getCustomerStatusColor(row.original),
          variant: 'subtle'
        }),
        h('p', { class: 'text-xs text-muted' }, getCustomerStatusHint(row.original))
      ])
    }
  },**/
  {
    accessorKey: 'objectPinned',
    header: 'Закрепленный объект'
  },
  {
    accessorKey: 'objectPositions',
    header: 'Позиции',
    cell: ({ row }) => row.original.objectPositions.join(', ')
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      return h(
        'div',
        { class: 'text-right' },
        h(
          UDropdownMenu,
          {
            content: {
              align: 'end'
            },
            items: getRowItems(row)
          },
          () =>
            h(UButton, {
              icon: 'i-lucide-ellipsis-vertical',
              color: 'neutral',
              variant: 'ghost',
              class: 'ml-auto'
            })
        )
      )
    }
  }
]

const username = computed({
  get: (): string => {
    return (table.value?.tableApi?.getColumn('username')?.getFilterValue() as string) || ''
  },
  set: (value: string) => {
    table.value?.tableApi?.getColumn('username')?.setFilterValue(value || undefined)
  }
})

const pagination = ref({
  pageIndex: 0,
  pageSize: 10
})

const columnLabelMap: Record<string, string> = {
  select: 'Выбор',
  id: 'ID',
  username: 'Пользователь',
  age: 'Возраст',
  workShift: 'Смена',
  objectPinned: 'Закрепленный объект',
  objectPositions: 'Позиции',
  actions: 'Действия'
}

function getColumnLabel(columnId: string) {
  return columnLabelMap[columnId] || upperFirst(columnId)
}

const shiftStats = computed(() => {
  const customers = safeCustomers.value
  const dayUsers = customers.filter(customer => customer.workShift === 'day')
  const nightUsers = customers.filter(customer => customer.workShift === 'night')

  return [{
    id: 'day',
    label: 'Дневная смена',
    color: 'success' as const,
    users: dayUsers
  }, {
    id: 'night',
    label: 'Ночная смена',
    color: 'warning' as const,
    users: nightUsers
  }]
})

function formatCurrency(value: number) {
  return new Intl.NumberFormat('uz-UZ', {
    style: 'currency',
    currency: 'UZS',
    maximumFractionDigits: 0
  }).format(value)
}

function getSalaryTotal(customerId: number) {
  const draft = salaryDrafts.value[customerId]
  if (!draft) {
    return 0
  }

  return (Number(draft.baseSalary) || 0) + (Number(draft.positionBonus) || 0)
}

function parseNonNegativeInteger(value: unknown, fieldName: string) {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Поле ${fieldName} должно быть целым числом не меньше 0.`)
  }

  return amount
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    return err.data?.statusMessage || err.message
  }

  return undefined
}

function getPassportFiles(passportFile: string) {
  try {
    const parsed = JSON.parse(passportFile) as { front?: string, back?: string }
    const files = [
      parsed.front ? { label: 'Лицевая сторона', value: parsed.front } : null,
      parsed.back ? { label: 'Обратная сторона', value: parsed.back } : null
    ].filter(Boolean)

    if (files.length) {
      return files as { label: string, value: string }[]
    }
  } catch {
    // Older records can still store one file path as plain text.
  }

  return [{ label: 'Файл', value: passportFile }]
}

function getCustomerStatus(customer: Customer): CustomerStatus {
  return customer.objectPinned.trim() ? 'active' : 'inactive'
}

function getCustomerStatusLabel(customer: Customer) {
  return getCustomerStatus(customer) === 'active' ? 'Активен' : 'Неактивен'
}

function getCustomerStatusColor(customer: Customer) {
  return getCustomerStatus(customer) === 'active' ? 'success' : 'warning'
}

function getCustomerStatusHint(customer: Customer) {
  return getCustomerStatus(customer) === 'active'
    ? 'Закреплен за объектом'
    : 'На проверке - ожидаются изменения'
}

async function deleteCustomer(customer: Customer) {
  try {
    await $fetch(`/api/customers/${customer.id}`, {
      method: 'DELETE'
    })

    toast.add({
      title: 'Удалено',
      description: `Пользователь @${customer.username} удален.`,
      color: 'success'
    })
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось удалить пользователя',
      description: getErrorMessage(err) || 'Повторите попытку.',
      color: 'error'
    })
  }
}

const selectedCustomers = computed(() => {
  return (table.value?.tableApi?.getFilteredSelectedRowModel().rows || [])
    .map(row => row.original as Customer)
})

async function deleteSelectedCustomers() {
  if (!selectedCustomers.value.length || deletingSelected.value) {
    return
  }

  const countToDelete = selectedCustomers.value.length
  deletingSelected.value = true

  try {
    await Promise.all(selectedCustomers.value.map(async (customer) => {
      await $fetch(`/api/customers/${customer.id}`, {
        method: 'DELETE'
      })
    }))

    toast.add({
      title: 'Удалено',
      description: `Удалено пользователей: ${countToDelete}`,
      color: 'success'
    })
    rowSelection.value = {}
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось удалить пользователей',
      description: getErrorMessage(err) || 'Повторите попытку.',
      color: 'error'
    })
  } finally {
    deletingSelected.value = false
  }
}

async function saveCustomerShift(customer: Customer) {
  const draft = shiftDrafts.value[customer.id]
  if (!draft || draft.saving) {
    return
  }

  draft.saving = true

  try {
    await $fetch(`/api/customers/${customer.id}`, {
      method: 'PATCH',
      body: {
        workShift: draft.workShift
      }
    })

    toast.add({
      title: 'Сохранено',
      description: `Смена пользователя @${customer.username} обновлена.`,
      color: 'success'
    })
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось сохранить смену',
      description: getErrorMessage(err) || 'Повторите попытку.',
      color: 'error'
    })
  } finally {
    draft.saving = false
  }
}

async function saveCustomerSalary(customer: Customer) {
  const draft = salaryDrafts.value[customer.id]
  if (!draft || draft.saving) {
    return
  }

  draft.saving = true

  try {
    const baseSalary = parseNonNegativeInteger(draft.baseSalary, 'базовая зарплата')
    const positionBonus = parseNonNegativeInteger(draft.positionBonus, 'надбавка')

    await $fetch(`/api/customers/${customer.id}`, {
      method: 'PATCH',
      body: {
        baseSalary,
        positionBonus
      }
    })

    toast.add({
      title: 'Сохранено',
      description: `Зарплата пользователя @${customer.username} обновлена.`,
      color: 'success'
    })
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось сохранить зарплату',
      description: getErrorMessage(err) || 'Проверьте значения и повторите попытку.',
      color: 'error'
    })
  } finally {
    draft.saving = false
  }
}
</script>

<template>
  <UDashboardPanel id="hr">
    <template #header>
      <UDashboardNavbar title="Кадры">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UTabs
          v-model="selectedHrTab"
          :items="hrTabs"
          :content="false"
          class="w-max"
          :ui="{ list: 'w-max' }"
        />

        <div v-if="selectedHrTab === 'users'" class="space-y-4">
          <div class="text-sm text-muted">
            {{ activeBuilding?.name ? `Здание: ${activeBuilding.name}` : 'Здание не выбрано' }}
          </div>

          <div class="flex flex-wrap items-center justify-between gap-1.5">
            <UInput
              v-model="username"
              class="max-w-sm"
              icon="i-lucide-search"
              placeholder="Фильтр по имени пользователя..."
            />

            <div class="flex flex-wrap items-center gap-1.5">
              <CustomersAddModal @saved="refresh()" />
              <CustomersBulkImport />
              <CustomersDeleteModal
                :count="table?.tableApi?.getFilteredSelectedRowModel().rows.length"
                :loading="deletingSelected"
                @confirm="deleteSelectedCustomers"
              >
                <UButton
                  v-if="table?.tableApi?.getFilteredSelectedRowModel().rows.length"
                  label="Удалить"
                  color="error"
                  variant="subtle"
                  icon="i-lucide-trash"
                  :loading="deletingSelected"
                >
                  <template #trailing>
                    <UKbd>
                      {{ table?.tableApi?.getFilteredSelectedRowModel().rows.length }}
                    </UKbd>
                  </template>
                </UButton>
              </CustomersDeleteModal>

              <UDropdownMenu
                :items="
                  table?.tableApi
                    ?.getAllColumns()
                    .filter((column: any) => column.getCanHide())
                    .map((column: any) => ({
                      label: getColumnLabel(column.id),
                      type: 'checkbox' as const,
                      checked: column.getIsVisible(),
                      onUpdateChecked(checked: boolean) {
                        table?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked)
                      },
                      onSelect(e?: Event) {
                        e?.preventDefault()
                      }
                    }))
                "
                :content="{ align: 'end' }"
              >
                <UButton
                  label="Отображение"
                  color="neutral"
                  variant="outline"
                  trailing-icon="i-lucide-settings-2"
                />
              </UDropdownMenu>
            </div>
          </div>

          <UTable
            ref="table"
            v-model:column-filters="columnFilters"
            v-model:column-visibility="columnVisibility"
            v-model:row-selection="rowSelection"
            v-model:pagination="pagination"
            :pagination-options="{
              getPaginationRowModel: getPaginationRowModel()
            }"
            class="shrink-0"
            :data="safeCustomers"
            :columns="userColumns"
            :loading="isLoading"
            :ui="{
              base: 'table-fixed border-separate border-spacing-0',
              thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
              tbody: '[&>tr]:last:[&>td]:border-b-0',
              th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
              td: 'border-b border-default',
              separator: 'h-0'
            }"
          />

          <div class="flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto">
            <div class="text-sm text-muted">
              Выбрано {{ table?.tableApi?.getFilteredSelectedRowModel().rows.length || 0 }} из
              {{ table?.tableApi?.getFilteredRowModel().rows.length || 0 }} строк.
            </div>

            <div class="flex items-center gap-1.5">
              <UPagination
                :default-page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
                :items-per-page="table?.tableApi?.getState().pagination.pageSize"
                :total="table?.tableApi?.getFilteredRowModel().rows.length"
                @update:page="(p: number) => table?.tableApi?.setPageIndex(p - 1)"
              />
            </div>
          </div>
        </div>

        <div v-else-if="selectedHrTab === 'shifts'" class="space-y-4">
          <div class="grid gap-4 md:grid-cols-2">
            <div
              v-for="shift in shiftStats"
              :key="shift.id"
              class="rounded-lg border border-default bg-elevated/30 p-4 space-y-3"
            >
              <div class="flex items-center justify-between">
                <p class="font-semibold text-highlighted">
                  {{ shift.label }}
                </p>
                <UBadge :label="String(shift.users.length)" :color="shift.color" variant="subtle" />
              </div>

              <div v-if="shift.users.length" class="space-y-2">
                <div
                  v-for="user in shift.users"
                  :key="user.id"
                  class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-default bg-default/50 p-2"
                >
                  <button class="font-medium hover:underline" @click="openCustomerInfo(user)">
                    @{{ user.username }}
                  </button>

                  <div class="flex items-center gap-2">
                    <USelect
                      v-model="shiftDrafts[user.id]!.workShift"
                      :items="[
                        { label: 'День', value: 'day' },
                        { label: 'Ночь', value: 'night' }
                      ]"
                      class="w-28"
                    />
                    <UButton
                      label="Сохранить"
                      size="sm"
                      color="primary"
                      :loading="shiftDrafts[user.id]!.saving"
                      @click="saveCustomerShift(user)"
                    />
                  </div>
                </div>
              </div>
              <p v-else class="text-sm text-muted">
                Нет пользователей в этой смене.
              </p>
            </div>
          </div>
        </div>

        <div v-else class="space-y-4">
          <div class="rounded-lg border border-default overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-elevated/50">
                  <th class="px-3 py-2 text-left">
                    ID
                  </th>
                  <th class="px-3 py-2 text-left">
                    Пользователь
                  </th>
                  <th class="px-3 py-2 text-left">
                    Базовая зарплата
                  </th>
                  <th class="px-3 py-2 text-left">
                    Надбавка
                  </th>
                  <th class="px-3 py-2 text-left">
                    Итого
                  </th>
                  <th class="px-3 py-2 text-right">
                    Действие
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="customer in safeCustomers"
                  :key="customer.id"
                  class="border-t border-default"
                >
                  <td class="px-3 py-2">
                    {{ customer.id }}
                  </td>
                  <td class="px-3 py-2">
                    @{{ customer.username }}
                  </td>
                  <td class="px-3 py-2 min-w-48">
                    <UInput
                      v-model="salaryDrafts[customer.id]!.baseSalary"
                      type="number"
                      min="0"
                      step="1"
                    />
                  </td>
                  <td class="px-3 py-2 min-w-40">
                    <UInput
                      v-model="salaryDrafts[customer.id]!.positionBonus"
                      type="number"
                      min="0"
                      step="1"
                    />
                  </td>
                  <td class="px-3 py-2 font-medium whitespace-nowrap">
                    {{ formatCurrency(getSalaryTotal(customer.id)) }}
                  </td>
                  <td class="px-3 py-2 text-right">
                    <UButton
                      label="Сохранить"
                      size="sm"
                      color="primary"
                      :loading="salaryDrafts[customer.id]!.saving"
                      @click="saveCustomerSalary(customer)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="text-xs text-muted">
            Базовая зарплата по умолчанию: 1 000 000 сум.
          </p>
        </div>
      </div>

      <UModal
        v-model:open="customerInfoOpen"
        :title="selectedCustomer ? `Пользователь @${selectedCustomer.username}` : 'Пользователь'"
        :description="selectedCustomer ? 'Информация о выбранном пользователе' : ''"
      >
        <template #body>
          <div v-if="selectedCustomer" class="space-y-4">
            <div class="flex items-center gap-3">
              <UAvatar :src="selectedCustomer.avatar.src" size="xl" />
              <div>
                <p class="font-semibold text-highlighted">
                  @{{ selectedCustomer.username }}
                </p>
                <p class="text-sm text-muted">
                  {{ selectedCustomer.phoneNumber }}
                </p>
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-md border border-default p-3">
                <p class="text-xs text-muted">
                  Возраст
                </p>
                <p class="font-medium">
                  {{ selectedCustomer.age }}
                </p>
              </div>
              <div class="rounded-md border border-default p-3">
                <p class="text-xs text-muted">
                  Смена
                </p>
                <p class="font-medium capitalize">
                  {{ selectedCustomer.workShift === 'day' ? 'день' : 'ночь' }}
                </p>
              </div>
              <div class="rounded-md border border-default p-3">
                <p class="text-xs text-muted">
                  Закрепленный объект
                </p>
                <p class="font-medium">
                  {{ selectedCustomer.objectPinned || 'На проверке - ожидаются изменения' }}
                </p>
              </div>
              <div class="rounded-md border border-default p-3">
                <p class="text-xs text-muted">
                  Зарплата
                </p>
                <p class="font-medium">
                  {{ formatCurrency(selectedCustomer.baseSalary + selectedCustomer.positionBonus) }}
                </p>
              </div>
              <div class="rounded-md border border-default p-3 sm:col-span-2">
                <p class="text-xs text-muted">
                  Файл паспорта
                </p>
                <div class="space-y-2">
                  <div
                    v-for="passport in getPassportFiles(selectedCustomer.passportFile)"
                    :key="passport.label"
                  >
                    <p class="text-xs text-muted">
                      {{ passport.label }}
                    </p>
                    <p class="font-medium break-all">
                      {{ passport.value }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div class="rounded-md border border-default p-3">
              <p class="text-xs text-muted mb-2">
                Позиции объекта
              </p>
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="position in selectedCustomer.objectPositions"
                  :key="position"
                  :label="position"
                  color="neutral"
                  variant="outline"
                />
              </div>
            </div>
          </div>
        </template>
      </UModal>

      <CustomersAddModal
        v-if="editingCustomer"
        v-model:open="editCustomerOpen"
        :customer="editingCustomer"
        :hide-trigger="true"
        @saved="refresh()"
      />
    </template>
  </UDashboardPanel>
</template>
