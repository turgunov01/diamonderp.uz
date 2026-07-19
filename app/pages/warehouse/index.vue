<script setup lang="ts">
type CalculationType = 'kg' | 'liter' | 'piece'

interface WarehouseItem {
  id: number
  name: string
  manufacturer: string
  calculationType: CalculationType
  unitPrice: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface WarehouseResponse {
  items: WarehouseItem[]
  summary: {
    total: number
    active: number
    byCalculationType: Record<CalculationType, number>
  }
}

interface CreateWarehouseItemState {
  name: string
  manufacturer: string
  calculationType: CalculationType
  unitPrice: number
}

const unitLabels: Record<CalculationType, string> = {
  kg: 'кг',
  liter: 'л',
  piece: 'шт'
}

const calculationOptions = [
  { label: 'кг', value: 'kg' },
  { label: 'л', value: 'liter' },
  { label: 'штук', value: 'piece' }
]

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { canManageWarehouse } = useRoleAccess()
const createModalOpen = ref(false)
const creating = ref(false)
const deleteModalOpen = ref(false)
const deletingItemId = ref<number | null>(null)
const warehouseItemToDelete = ref<WarehouseItem | null>(null)

const form = reactive<CreateWarehouseItemState>({
  name: '',
  manufacturer: '',
  calculationType: 'piece',
  unitPrice: 0
})

const returnPath = computed(() => {
  const raw = route.query.return
  return typeof raw === 'string' && raw.startsWith('/') ? raw : null
})

const { data, error, refresh, status, pending } = await useAutoRefreshFetch<WarehouseResponse>('/api/warehouse', {
  default: () => ({
    items: [],
    summary: {
      total: 0,
      active: 0,
      byCalculationType: {
        kg: 0,
        liter: 0,
        piece: 0
      }
    }
  }),
  query: {
    activeOnly: true
  },
  immediate: true
})

const isLoading = computed(() => pending.value || status.value === 'pending')

watch(error, (value) => {
  if (!value) {
    return
  }

  toast.add({
    title: 'Не удалось загрузить склад',
    description: value.data?.message || value.statusMessage || 'Проверьте API склада.',
    color: 'error'
  })
}, { immediate: true })

onMounted(() => {
  if (route.query.create === '1' && canManageWarehouse.value) {
    createModalOpen.value = true
  }
})

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'UZS',
    maximumFractionDigits: 0
  }).format(amount)
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU')
}

function resetForm() {
  form.name = ''
  form.manufacturer = ''
  form.calculationType = 'piece'
  form.unitPrice = 0
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const err = error as { data?: { message?: string, statusMessage?: string }, message?: string }
    return err.data?.message || err.message
  }

  return undefined
}

function openCreateModal() {
  if (!canManageWarehouse.value) {
    toast.add({
      title: 'Создание позиций доступно только администратору',
      color: 'warning'
    })
    return
  }

  createModalOpen.value = true
}

async function createWarehouseItem() {
  if (!canManageWarehouse.value || creating.value) {
    return
  }

  if (!form.name.trim() || !form.manufacturer.trim()) {
    toast.add({ title: 'Заполните название и производителя', color: 'warning' })
    return
  }

  if (!Number.isInteger(Number(form.unitPrice)) || Number(form.unitPrice) <= 0) {
    toast.add({ title: 'Цена должна быть целым числом больше нуля', color: 'warning' })
    return
  }

  creating.value = true

  try {
    await $fetch('/api/warehouse', {
      method: 'POST',
      body: {
        name: form.name,
        manufacturer: form.manufacturer,
        calculationType: form.calculationType,
        unitPrice: Number(form.unitPrice)
      }
    })

    toast.add({ title: 'Позиция создана', color: 'success' })
    createModalOpen.value = false
    resetForm()
    await refresh()

    if (returnPath.value) {
      await router.push(returnPath.value)
    }
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось создать позицию',
      description: getErrorMessage(err) || 'Проверьте поля формы.',
      color: 'error'
    })
  } finally {
    creating.value = false
  }
}

function confirmDeleteWarehouseItem(item: WarehouseItem) {
  if (!canManageWarehouse.value) {
    toast.add({
      title: 'Удаление позиций доступно только администратору',
      color: 'warning'
    })
    return
  }

  warehouseItemToDelete.value = item
  deleteModalOpen.value = true
}

async function deleteWarehouseItem() {
  if (!canManageWarehouse.value || !warehouseItemToDelete.value || deletingItemId.value !== null) {
    return
  }

  deletingItemId.value = warehouseItemToDelete.value.id

  try {
    await $fetch(`/api/warehouse/${warehouseItemToDelete.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Позиция удалена', color: 'success' })
    deleteModalOpen.value = false
    warehouseItemToDelete.value = null
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось удалить позицию',
      description: getErrorMessage(err) || 'Попробуйте позже.',
      color: 'error'
    })
  } finally {
    deletingItemId.value = null
  }
}
</script>

<template>
  <UDashboardPanel id="warehouse">
    <template #header>
      <UDashboardNavbar title="Склад">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              v-if="returnPath"
              label="К закупкам"
              icon="i-lucide-arrow-left"
              color="neutral"
              variant="subtle"
              @click="router.push(returnPath)"
            />
            <UBadge
              v-if="!canManageWarehouse"
              label="Только чтение"
              color="neutral"
              variant="subtle"
            />
            <UButton
              v-if="canManageWarehouse"
              label="Новая позиция"
              icon="i-lucide-plus"
              @click="openCreateModal"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-4">
          <template v-if="isLoading">
            <div
              v-for="n in 4"
              :key="`warehouse-summary-${n}`"
              class="rounded-lg border border-default bg-elevated/30 p-4 animate-pulse space-y-3"
            >
              <div class="h-3 w-16 rounded bg-default/60" />
              <div class="h-6 w-20 rounded bg-default/70" />
            </div>
          </template>
          <template v-else>
            <div class="rounded-lg border border-default bg-elevated/30 p-4">
              <p class="text-xs text-muted">Всего</p>
              <p class="text-2xl font-semibold">{{ data.summary.total }}</p>
            </div>
            <div class="rounded-lg border border-default bg-elevated/30 p-4">
              <p class="text-xs text-muted">Килограммы</p>
              <p class="text-2xl font-semibold">{{ data.summary.byCalculationType.kg }}</p>
            </div>
            <div class="rounded-lg border border-default bg-elevated/30 p-4">
              <p class="text-xs text-muted">Литры</p>
              <p class="text-2xl font-semibold">{{ data.summary.byCalculationType.liter }}</p>
            </div>
            <div class="rounded-lg border border-default bg-elevated/30 p-4">
              <p class="text-xs text-muted">Штуки</p>
              <p class="text-2xl font-semibold">{{ data.summary.byCalculationType.piece }}</p>
            </div>
          </template>
        </div>

        <div v-if="isLoading" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="n in 6"
            :key="`warehouse-card-loading-${n}`"
            class="rounded-lg border border-default bg-elevated/30 p-4 animate-pulse space-y-3"
          >
            <div class="h-5 w-36 rounded bg-default/70" />
            <div class="h-4 w-28 rounded bg-default/50" />
            <div class="h-8 w-full rounded bg-default/50" />
          </div>
        </div>

        <div v-else-if="data.items.length" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="item in data.items"
            :key="item.id"
            class="rounded-lg border border-default bg-elevated/30 p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-semibold text-highlighted truncate">{{ item.name }}</p>
                <p class="text-sm text-muted truncate">{{ item.manufacturer }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <UBadge :label="unitLabels[item.calculationType]" color="primary" variant="subtle" />
                <UButton
                  v-if="canManageWarehouse"
                  icon="i-lucide-trash"
                  color="error"
                  variant="ghost"
                  size="xs"
                  square
                  aria-label="Удалить позицию"
                  :loading="deletingItemId === item.id"
                  :disabled="deletingItemId !== null && deletingItemId !== item.id"
                  @click="confirmDeleteWarehouseItem(item)"
                />
              </div>
            </div>

            <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p class="text-xs text-muted">Цена</p>
                <p class="font-medium">{{ formatCurrency(item.unitPrice) }}</p>
              </div>
              <div>
                <p class="text-xs text-muted">За расчет</p>
                <p class="font-medium">1 {{ unitLabels[item.calculationType] }}</p>
              </div>
              <div>
                <p class="text-xs text-muted">Создано</p>
                <p class="font-medium">{{ formatDate(item.createdAt) }}</p>
              </div>
              <div>
                <p class="text-xs text-muted">Статус</p>
                <UBadge
                  :label="item.isActive ? 'Активна' : 'Отключена'"
                  :color="item.isActive ? 'success' : 'neutral'"
                  variant="subtle"
                />
              </div>
            </div>
          </div>
        </div>

        <div v-else class="rounded-lg border border-default bg-elevated/30 p-6">
          <p class="font-medium">Позиции склада пока не созданы.</p>
          <p class="mt-1 text-sm text-muted">После создания позиции она появится в выпадающем списке при создании закупки.</p>
        </div>
      </div>

      <UModal
        v-if="canManageWarehouse"
        v-model:open="createModalOpen"
        title="Новая позиция склада"
        description="Позиция будет доступна при создании закупок"
      >
        <template #body>
          <div class="space-y-4">
            <UFormField label="Название товара">
              <UInput v-model="form.name" class="w-full" placeholder="Например: Моющее средство" />
            </UFormField>

            <UFormField label="Производитель">
              <UInput v-model="form.manufacturer" class="w-full" placeholder="Название производителя" />
            </UFormField>

            <UFormField label="Тип расчета">
              <USelect
                v-model="form.calculationType"
                :items="calculationOptions"
                class="w-full"
              />
            </UFormField>

            <UFormField :label="`Цена за 1 ${unitLabels[form.calculationType]} (UZS)`">
              <UInput
                v-model.number="form.unitPrice"
                type="number"
                min="1"
                step="1"
                class="w-full"
              />
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
                :label="returnPath ? 'Создать и вернуться' : 'Создать'"
                icon="i-lucide-check"
                :loading="creating"
                @click="createWarehouseItem"
              />
            </div>
          </div>
        </template>
      </UModal>

      <UModal
        v-if="canManageWarehouse"
        v-model:open="deleteModalOpen"
        title="Удалить позицию склада?"
        description="Позиция исчезнет из склада и больше не будет доступна при создании закупок."
      >
        <template #body>
          <div class="space-y-3">
            <p class="text-sm text-muted">
              Вы уверены, что хотите удалить позицию
              <strong>{{ warehouseItemToDelete?.name || '' }}</strong>?
            </p>
            <div class="flex items-center justify-end gap-2">
              <UButton
                label="Отмена"
                color="neutral"
                variant="subtle"
                :disabled="deletingItemId !== null"
                @click="deleteModalOpen = false"
              />
              <UButton
                label="Удалить"
                color="error"
                icon="i-lucide-trash"
                :loading="deletingItemId !== null"
                @click="deleteWarehouseItem"
              />
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
