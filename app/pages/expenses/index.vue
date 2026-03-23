<script setup lang="ts">
type ExpenseStatus = 'draft' | 'approved' | 'rejected' | 'paid'

interface ExpenseRecord {
  id: number
  title: string
  category: string
  vendor: string
  plannedAmount: number
  actualAmount?: number
  currency: string
  dueDate?: string
  status: ExpenseStatus
  notes?: string
  createdAt: string
  updatedAt: string
}

interface ExpensesResponse {
  items: ExpenseRecord[]
  summary: {
    totalPlanned: number
    totalActual: number
    byStatus: Record<string, number>
  }
}

interface CreateExpenseState {
  title: string
  category: string
  vendor: string
  plannedAmount: number
  dueDate: string
  notes: string
}

const toast = useToast()
const { canManageExpenses, canDeleteExpenses } = useRoleAccess()
const createModalOpen = ref(false)
const creating = ref(false)
const updatingId = ref<number | null>(null)
const deleteModalOpen = ref(false)
const deletingId = ref<number | null>(null)
const expenseToDelete = ref<ExpenseRecord | null>(null)

const newExpense = reactive<CreateExpenseState>({
  title: '',
  category: 'Операционные',
  vendor: '',
  plannedAmount: 0,
  dueDate: '',
  notes: ''
})

const categories = [
  'Операционные',
  'Логистика',
  'Безопасность',
  'Оборудование',
  'Командировки'
]

const activeObject = useState<{ id: number, name: string } | null>('active-object')

const { data, error, refresh, execute, status, pending } = await useAutoRefreshFetch<ExpensesResponse>('/api/expenses', {
  default: () => ({
    items: [],
    summary: {
      totalPlanned: 0,
      totalActual: 0,
      byStatus: {
        draft: 0,
        approved: 0,
        rejected: 0,
        paid: 0
      }
    }
  }),
  query: {
    objectId: computed(() => activeObject.value?.id)
  },
  immediate: true
})

const isLoading = computed(() => pending.value || status.value === 'pending')

watch(activeObject, (val) => {
  if (val?.id) {
    execute()
  }
}, { immediate: true })

watch(error, (value) => {
  if (!value) {
    return
  }

  toast.add({
    title: 'Не удалось загрузить расходы',
    description: value.statusMessage || 'Проверьте API расходов.',
    color: 'error'
  })
}, { immediate: true })

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'UZS',
    maximumFractionDigits: 0
  }).format(amount)
}

function formatDate(value?: string) {
  if (!value) {
    return '-'
  }

  return new Date(value).toLocaleDateString('ru-RU')
}

function statusColor(status: ExpenseStatus) {
  if (status === 'draft') return 'neutral'
  if (status === 'approved') return 'primary'
  if (status === 'rejected') return 'error'
  return 'success'
}

function statusLabel(status: ExpenseStatus) {
  if (status === 'draft') return 'Черновик'
  if (status === 'approved') return 'Согласовано'
  if (status === 'rejected') return 'Отклонено'
  return 'Оплачено'
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    return err.data?.statusMessage || err.message
  }

  return undefined
}

function resetCreateState() {
  newExpense.title = ''
  newExpense.category = 'Операционные'
  newExpense.vendor = ''
  newExpense.plannedAmount = 0
  newExpense.dueDate = ''
  newExpense.notes = ''
}

async function createExpense() {
  if (!canManageExpenses.value) {
    return
  }

  if (creating.value) {
    return
  }

  if (!activeObject.value?.id) {
    toast.add({ title: 'Выберите объект перед созданием расхода', color: 'warning' })
    return
  }

  creating.value = true

  try {
    await $fetch('/api/expenses', {
      method: 'POST',
      body: {
        objectId: activeObject.value?.id,
        title: newExpense.title,
        category: newExpense.category,
        vendor: newExpense.vendor,
        plannedAmount: newExpense.plannedAmount,
        dueDate: newExpense.dueDate || undefined,
        notes: newExpense.notes || undefined,
        status: 'draft'
      }
    })

    toast.add({
      title: 'Расход создан',
      color: 'success'
    })

    createModalOpen.value = false
    resetCreateState()
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось создать расход',
      description: getErrorMessage(err) || 'Проверьте поля формы.',
      color: 'error'
    })
  } finally {
    creating.value = false
  }
}

async function setStatus(item: ExpenseRecord, status: ExpenseStatus) {
  if (!canManageExpenses.value) {
    return
  }

  if (updatingId.value === item.id) {
    return
  }

  updatingId.value = item.id

  try {
    await $fetch(`/api/expenses/${item.id}`, {
      method: 'PATCH',
      body: {
        status,
        actualAmount: status === 'paid' ? item.actualAmount || item.plannedAmount : item.actualAmount
      }
    })

    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось обновить статус',
      description: getErrorMessage(err) || 'Повторите попытку.',
      color: 'error'
    })
  } finally {
    updatingId.value = null
  }
}

function confirmDelete(item: ExpenseRecord) {
  if (!canDeleteExpenses.value) {
    return
  }

  expenseToDelete.value = item
  deleteModalOpen.value = true
}

async function deleteExpense() {
  if (!canDeleteExpenses.value) return
  if (!expenseToDelete.value) return
  if (deletingId.value) return

  deletingId.value = expenseToDelete.value.id
  try {
    await $fetch(`/api/expenses/${expenseToDelete.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Закупка удалена', color: 'success' })
    deleteModalOpen.value = false
    expenseToDelete.value = null
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось удалить',
      description: getErrorMessage(err) || 'Попробуйте позже.',
      color: 'error'
    })
  } finally {
    deletingId.value = null
  }
}

function getExpenseActions(item: ExpenseRecord) {
  const actions = []

  if (canManageExpenses.value) {
    actions.push(
      {
        label: 'Согласовать',
        icon: 'i-lucide-check',
        onSelect: () => setStatus(item, 'approved')
      },
      {
        label: 'Отклонить',
        icon: 'i-lucide-x',
        onSelect: () => setStatus(item, 'rejected')
      },
      {
        label: 'Отметить как оплачено',
        icon: 'i-lucide-wallet',
        onSelect: () => setStatus(item, 'paid')
      }
    )
  }

  if (canDeleteExpenses.value) {
    actions.push({
      label: 'Удалить',
      icon: 'i-lucide-trash',
      color: 'error',
      onSelect: () => confirmDelete(item)
    })
  }

  return actions
}
</script>

<template>
  <UDashboardPanel id="expenses">
    <template #header>
      <UDashboardNavbar title="Расходы">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UBadge
              v-if="!canManageExpenses"
              label="Только чтение"
              color="neutral"
              variant="subtle"
            />
            <UButton
              v-if="canManageExpenses"
              label="Новый расход"
              icon="i-lucide-plus"
              @click="createModalOpen = true"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-3">
          <template v-if="isLoading">
            <div
              v-for="n in 3"
              :key="`expense-card-${n}`"
              class="rounded-lg border border-default p-4 bg-elevated/30 animate-pulse space-y-3"
            >
              <div class="h-3 w-16 bg-default/60 rounded" />
              <div class="h-5 w-24 bg-default/70 rounded" />
            </div>
          </template>
          <template v-else>
            <div class="rounded-lg border border-default p-4 bg-elevated/30">
              <p class="text-xs text-muted">План</p>
              <p class="text-lg font-semibold">{{ formatCurrency(data.summary.totalPlanned) }}</p>
            </div>
            <div class="rounded-lg border border-default p-4 bg-elevated/30">
              <p class="text-xs text-muted">Факт</p>
              <p class="text-lg font-semibold">{{ formatCurrency(data.summary.totalActual) }}</p>
            </div>
            <div class="rounded-lg border border-default p-4 bg-elevated/30">
              <p class="text-xs text-muted">Оплачено</p>
              <p class="text-lg font-semibold">{{ data.summary.byStatus.paid || 0 }}</p>
            </div>
          </template>
        </div>

        <div class="rounded-lg border border-default overflow-x-auto">
          <template v-if="isLoading">
            <div class="divide-y divide-default">
              <div
                v-for="n in 6"
                :key="`expense-row-${n}`"
                class="flex items-center gap-3 px-3 py-3 animate-pulse"
              >
                <div class="h-4 w-10 bg-default/60 rounded" />
                <div class="h-4 w-40 bg-default/70 rounded" />
                <div class="h-4 w-24 bg-default/50 rounded" />
                <div class="h-4 w-32 bg-default/50 rounded" />
                <div class="h-4 w-20 bg-default/60 rounded" />
                <div class="h-4 w-16 bg-default/50 rounded" />
              </div>
            </div>
          </template>
          <template v-else>
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-elevated/50">
                  <th class="px-3 py-2 text-left">ID</th>
                  <th class="px-3 py-2 text-left">Статья</th>
                  <th class="px-3 py-2 text-left">Категория</th>
                  <th class="px-3 py-2 text-left">Поставщик</th>
                  <th class="px-3 py-2 text-left">План</th>
                  <th class="px-3 py-2 text-left">Факт</th>
                  <th class="px-3 py-2 text-left">Срок</th>
                  <th class="px-3 py-2 text-left">Статус</th>
                  <th class="px-3 py-2 text-right">Действие</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in data.items"
                  :key="item.id"
                  class="border-t border-default"
                >
                  <td class="px-3 py-2">{{ item.id }}</td>
                  <td class="px-3 py-2">
                    <p class="font-medium">{{ item.title }}</p>
                    <p class="text-xs text-muted">{{ item.notes || 'Без комментариев' }}</p>
                  </td>
                  <td class="px-3 py-2">{{ item.category }}</td>
                  <td class="px-3 py-2">{{ item.vendor }}</td>
                  <td class="px-3 py-2">{{ formatCurrency(item.plannedAmount) }}</td>
                  <td class="px-3 py-2">{{ formatCurrency(item.actualAmount || 0) }}</td>
                  <td class="px-3 py-2">{{ formatDate(item.dueDate) }}</td>
                  <td class="px-3 py-2">
                    <UBadge :label="statusLabel(item.status)" :color="statusColor(item.status)" variant="subtle" />
                  </td>
                  <td class="px-3 py-2 text-right">
                    <UDropdownMenu
                      v-if="getExpenseActions(item).length"
                      :items="getExpenseActions(item)"
                      :content="{ align: 'end' }"
                    >
                      <UButton
                        icon="i-lucide-ellipsis-vertical"
                        color="neutral"
                        variant="ghost"
                        :loading="updatingId === item.id"
                      />
                    </UDropdownMenu>
                    <span v-else class="text-xs text-muted">Только просмотр</span>
                  </td>
                </tr>
                <tr v-if="!data.items.length">
                  <td class="px-3 py-4 text-muted" colspan="9">
                    Расходов пока нет.
                  </td>
                </tr>
              </tbody>
            </table>
          </template>
        </div>
      </div>

      <UModal
        v-if="canManageExpenses"
        v-model:open="createModalOpen"
        title="Новый расход"
        description="Добавьте плановый расход и отслеживайте его статус"
      >
        <template #body>
          <div class="space-y-4">
            <UFormField label="Статья">
              <UInput v-model="newExpense.title" class="w-full" placeholder="Например: Закупка формы" />
            </UFormField>

            <UFormField label="Категория">
              <USelect
                v-model="newExpense.category"
                :items="categories.map(item => ({ label: item, value: item }))"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Поставщик">
              <UInput v-model="newExpense.vendor" class="w-full" placeholder="Название поставщика" />
            </UFormField>

            <UFormField label="Плановая сумма (UZS)">
              <UInput v-model="newExpense.plannedAmount" type="number" min="0" step="1" class="w-full" />
            </UFormField>

            <UFormField label="Срок оплаты">
              <UInput v-model="newExpense.dueDate" type="date" class="w-full" />
            </UFormField>

            <UFormField label="Комментарий">
              <UTextarea v-model="newExpense.notes" class="w-full" :rows="3" />
            </UFormField>

            <div class="flex items-center justify-end gap-2">
              <UButton
                label="Отмена"
                color="neutral"
                variant="subtle"
                :disabled="creating"
                @click="createModalOpen = false"
              />
              <UButton
                label="Сохранить"
                :loading="creating"
                @click="createExpense"
              />
            </div>
          </div>
        </template>
      </UModal>

      <UModal
        v-if="canDeleteExpenses"
        v-model:open="deleteModalOpen"
        title="Удалить расход?"
        description="При удалении запись удаляется с сервера без возможности восстановления."
        :ui="{ width: 'sm:max-w-md' }"
      >
        <template #body>
          <div class="space-y-3">
            <p class="text-sm text-muted">
              Вы уверены, что хотите удалить расход
              <strong>{{ expenseToDelete?.title }}</strong>?
            </p>
            <div class="flex items-center justify-end gap-2">
              <UButton
                label="Отмена"
                color="neutral"
                variant="subtle"
                :disabled="deletingId !== null"
                @click="deleteModalOpen = false"
              />
              <UButton
                label="Удалить"
                color="error"
                icon="i-lucide-trash"
                :loading="deletingId !== null"
                @click="deleteExpense"
              />
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

