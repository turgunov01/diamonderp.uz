<script setup lang="ts">
definePageMeta({
  title: 'Отходы',
  ssr: true
})

type BinCategory = 'Макулатура' | 'Пластик' | 'Общее'
type BinStatus = 'available' | 'loaded'

interface WasteBin {
  id: number
  objectId: number | null
  category: BinCategory
  volumeM3: number
  weightKg: number
  status: BinStatus
  createdAt: string
  updatedAt: string
}

interface WasteReport {
  id: number
  binId: number
  objectId: number | null
  category: BinCategory
  amountM3: number
  amountKg: number
  createdAt: string
}

interface WasteResponse {
  bins: WasteBin[]
  reports: WasteReport[]
}

const toast = useToast()
const activeObject = useState<{ id: number, name: string } | null>('active-object')

const {
  data,
  refresh,
  status,
  pending
} = await useAutoRefreshAsyncData<WasteResponse>(
  'waste-data',
  () => $fetch('/api/waste', {
    query: {
      objectId: activeObject.value?.id
    }
  }),
  {
    default: () => ({ bins: [], reports: [] }),
    watch: [activeObject]
  }
)

const isLoading = computed(() => pending.value || status.value === 'pending')

const reportForm = reactive({
  binId: null as number | null,
  amountM3: 0,
  amountKg: 0
})

const createModalOpen = ref(false)
const creating = ref(false)
const createForm = reactive({
  category: 'Общее' as BinCategory,
  volumeM3: 1,
  widthM: 1,
  heightM: 1,
  densityKgPerM3: 80,
  weightKg: 0,
  status: 'available' as BinStatus
})

const bins = computed(() => data.value?.bins || [])
const reports = computed(() => data.value?.reports || [])

const availableBins = computed(() => bins.value.filter(b => b.status === 'available'))
const loadedBins = computed(() => bins.value.filter(b => b.status === 'loaded'))

const totals = computed(() => ({
  count: bins.value.length,
  m3: bins.value.reduce((s, b) => s + b.volumeM3, 0),
  kg: bins.value.reduce((s, b) => s + b.weightKg, 0)
}))

const totalsAvailable = computed(() => ({
  count: availableBins.value.length,
  m3: availableBins.value.reduce((s, b) => s + b.volumeM3, 0),
  kg: availableBins.value.reduce((s, b) => s + b.weightKg, 0)
}))

const totalsLoaded = computed(() => ({
  count: loadedBins.value.length,
  m3: loadedBins.value.reduce((s, b) => s + b.volumeM3, 0),
  kg: loadedBins.value.reduce((s, b) => s + b.weightKg, 0)
}))

const categories: BinCategory[] = ['Макулатура', 'Пластик', 'Общее']
const categoryStats = computed(() => categories.map(cat => {
  const catBins = bins.value.filter(b => b.category === cat)
  const avail = catBins.filter(b => b.status === 'available')
  const load = catBins.filter(b => b.status === 'loaded')
  return {
    category: cat,
    total: catBins.length,
    available: avail.length,
    loaded: load.length,
    m3: catBins.reduce((s, b) => s + b.volumeM3, 0),
    kg: catBins.reduce((s, b) => s + b.weightKg, 0)
  }
}))

function formatNumber(n: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n)
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function statusLabel(status: BinStatus) {
  return status === 'available' ? 'Свободен' : 'Загружен'
}

function statusColor(status: BinStatus) {
  return status === 'available' ? 'success' : 'warning'
}

async function submitReport() {
  if (!reportForm.binId) {
    toast.add({ title: 'Выберите бак', color: 'warning' })
    return
  }
  try {
    await $fetch('/api/waste/report', {
      method: 'POST',
      body: {
        binId: reportForm.binId,
        amountM3: reportForm.amountM3,
        amountKg: reportForm.amountKg,
        objectId: activeObject.value?.id ?? null
      }
    })
    toast.add({ title: 'Отчёт отправлен', description: 'Данные обновлены', color: 'success' })
    reportForm.binId = null
    reportForm.amountM3 = 0
    reportForm.amountKg = 0
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось отправить отчёт',
      description: (err as any)?.data?.statusMessage || (err as Error)?.message,
      color: 'error'
    })
  }
}

async function createBin() {
  if (creating.value) return
  creating.value = true

  const computedWeight = createForm.densityKgPerM3 * (Number(createForm.volumeM3) || 0)
  createForm.weightKg = Math.round(computedWeight)

  try {
    await $fetch('/api/waste/bin', {
      method: 'POST',
      body: {
        category: createForm.category,
        volumeM3: createForm.volumeM3,
        weightKg: createForm.weightKg,
        status: createForm.status,
        objectId: activeObject.value?.id ?? null
      }
    })
    toast.add({ title: 'Бак создан', color: 'success' })
    createModalOpen.value = false
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось создать бак',
      description: (err as any)?.data?.statusMessage || (err as Error)?.message,
      color: 'error'
    })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="waste">
    <template #header>
      <UDashboardNavbar title="Отходы">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-plus"
            label="Создать бак"
            color="primary"
            @click="createModalOpen = true"
          />
          <UButton
            icon="i-lucide-refresh-ccw"
            color="neutral"
            variant="outline"
            :loading="isLoading"
            @click="refresh"
            label="Обновить"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-3">
          <UPageCard
            icon="i-lucide-trash"
            title="Все баки"
            variant="subtle"
            :ui="{ leading: 'p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25 flex-col' }"
          >
            <p class="text-2xl font-semibold text-highlighted">{{ totals.count }}</p>
            <p class="text-xs text-muted">Всего · {{ formatNumber(totals.m3) }} м³ · {{ formatNumber(totals.kg) }} кг</p>
          </UPageCard>
          <UPageCard
            icon="i-lucide-check-circle"
            title="Доступные"
            variant="subtle"
            :ui="{ leading: 'p-2.5 rounded-full bg-success/10 ring ring-inset ring-success/25 flex-col' }"
          >
            <p class="text-2xl font-semibold text-highlighted">{{ totalsAvailable.count }}</p>
            <p class="text-xs text-muted">{{ formatNumber(totalsAvailable.m3) }} м³ · {{ formatNumber(totalsAvailable.kg) }} кг</p>
          </UPageCard>
          <UPageCard
            icon="i-lucide-loader"
            title="Загруженные"
            variant="subtle"
            :ui="{ leading: 'p-2.5 rounded-full bg-warning/10 ring ring-inset ring-warning/25 flex-col' }"
          >
            <p class="text-2xl font-semibold text-highlighted">{{ totalsLoaded.count }}</p>
            <p class="text-xs text-muted">{{ formatNumber(totalsLoaded.m3) }} м³ · {{ formatNumber(totalsLoaded.kg) }} кг</p>
          </UPageCard>
        </div>

        <div class="rounded-lg border border-default bg-elevated/30">
          <div class="flex items-center justify-between px-4 py-3 border-b border-default/60">
            <h3 class="font-semibold text-highlighted">По категориям</h3>
            <UBadge :label="categoryStats.length" variant="subtle" />
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-elevated/40">
                  <th class="px-3 py-2 text-left">Категория</th>
                  <th class="px-3 py-2 text-left">Контейнеров</th>
                  <th class="px-3 py-2 text-left">Доступно</th>
                  <th class="px-3 py-2 text-left">Загружено</th>
                  <th class="px-3 py-2 text-left">Объём, м³</th>
                  <th class="px-3 py-2 text-left">Вес, кг</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="stat in categoryStats"
                  :key="stat.category"
                  class="border-t border-default"
                >
                  <td class="px-3 py-2 font-medium text-highlighted">{{ stat.category }}</td>
                  <td class="px-3 py-2">{{ stat.total }}</td>
                  <td class="px-3 py-2 text-success">{{ stat.available }}</td>
                  <td class="px-3 py-2 text-warning">{{ stat.loaded }}</td>
                  <td class="px-3 py-2">{{ formatNumber(stat.m3) }}</td>
                  <td class="px-3 py-2">{{ formatNumber(stat.kg) }}</td>
                </tr>
                <tr v-if="!categoryStats.length">
                  <td class="px-3 py-4 text-muted" colspan="6">
                    Нет данных по категориям.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="rounded-lg border border-default bg-elevated/30">
          <div class="flex items-center justify-between px-4 py-3 border-b border-default/60">
            <div>
              <h3 class="font-semibold text-highlighted leading-tight">Контейнеры</h3>
              <p class="text-xs text-muted">Все баки с привязкой к объекту и статусом</p>
            </div>
            <UBadge :label="bins.length" variant="subtle" />
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-elevated/40">
                  <th class="px-3 py-2 text-left">ID</th>
                  <th class="px-3 py-2 text-left">Объект</th>
                  <th class="px-3 py-2 text-left">Категория</th>
                  <th class="px-3 py-2 text-left">Объём, м³</th>
                  <th class="px-3 py-2 text-left">Вес, кг</th>
                  <th class="px-3 py-2 text-left">Статус</th>
                  <th class="px-3 py-2 text-left">Создан</th>
                  <th class="px-3 py-2 text-left">Обновлён</th>
                </tr>
              </thead>
              <tbody>
                <template v-if="isLoading">
                  <tr v-for="n in 5" :key="`bin-loading-${n}`" class="border-t border-default">
                    <td class="px-3 py-3" colspan="8">
                      <div class="h-4 w-full bg-default/50 rounded animate-pulse" />
                    </td>
                  </tr>
                </template>
                <template v-else>
                  <tr
                    v-for="bin in bins"
                    :key="bin.id"
                    class="border-t border-default"
                  >
                    <td class="px-3 py-2">#{{ bin.id }}</td>
                    <td class="px-3 py-2">{{ bin.objectId ?? '—' }}</td>
                    <td class="px-3 py-2">{{ bin.category }}</td>
                    <td class="px-3 py-2">{{ formatNumber(bin.volumeM3) }}</td>
                    <td class="px-3 py-2">{{ formatNumber(bin.weightKg) }}</td>
                    <td class="px-3 py-2">
                      <UBadge :label="statusLabel(bin.status)" :color="statusColor(bin.status)" variant="subtle" />
                    </td>
                    <td class="px-3 py-2">{{ formatDate(bin.createdAt) }}</td>
                    <td class="px-3 py-2">{{ formatDate(bin.updatedAt) }}</td>
                  </tr>
                  <tr v-if="!bins.length">
                    <td class="px-3 py-4 text-muted" colspan="8">
                      Контейнеры не найдены.
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div class="rounded-lg border border-default bg-elevated/30 p-4 space-y-3">
            <h3 class="font-semibold text-highlighted">Отчёт о вывозе</h3>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Бак">
                <USelect
                  v-model="reportForm.binId"
                  :items="bins.map(b => ({ label: `#${b.id} · ${b.category} · ${b.status === 'available' ? 'свободен' : 'загружен'}`, value: b.id }))"
                  placeholder="Выберите бак"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Объём, м³">
                <UInput v-model="reportForm.amountM3" type="number" min="0" step="0.1" class="w-full" />
              </UFormField>
              <UFormField label="Вес, кг">
                <UInput v-model="reportForm.amountKg" type="number" min="0" step="1" class="w-full" />
              </UFormField>
            </div>
            <div class="flex items-center justify-end gap-2">
              <UButton
                label="Отправить отчёт"
                icon="i-lucide-send"
                :loading="isLoading"
                @click="submitReport"
              />
            </div>
          </div>

          <div class="rounded-lg border border-default bg-elevated/30">
            <div class="flex items-center justify-between px-4 py-3 border-b border-default/60">
              <h3 class="font-semibold text-highlighted">История отчётов</h3>
              <UBadge :label="reports.length" variant="subtle" />
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="bg-elevated/40">
                    <th class="px-3 py-2 text-left">ID</th>
                    <th class="px-3 py-2 text-left">Бак</th>
                    <th class="px-3 py-2 text-left">Категория</th>
                    <th class="px-3 py-2 text-left">Объём, м³</th>
                    <th class="px-3 py-2 text-left">Вес, кг</th>
                    <th class="px-3 py-2 text-left">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-if="isLoading">
                    <tr v-for="n in 5" :key="`report-loading-${n}`" class="border-t border-default">
                      <td class="px-3 py-3" colspan="6">
                        <div class="h-4 w-full bg-default/50 rounded animate-pulse" />
                      </td>
                    </tr>
                  </template>
                  <template v-else>
                    <tr
                      v-for="report in reports"
                      :key="report.id"
                      class="border-t border-default"
                    >
                      <td class="px-3 py-2">#{{ report.id }}</td>
                      <td class="px-3 py-2">#{{ report.binId }}</td>
                      <td class="px-3 py-2">{{ report.category }}</td>
                      <td class="px-3 py-2">{{ formatNumber(report.amountM3) }}</td>
                      <td class="px-3 py-2">{{ formatNumber(report.amountKg) }}</td>
                      <td class="px-3 py-2">{{ formatDate(report.createdAt) }}</td>
                    </tr>
                    <tr v-if="!reports.length">
                      <td class="px-3 py-4 text-muted" colspan="6">
                        Отчётов пока нет.
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <UModal
        v-model:open="createModalOpen"
        title="Создать бак"
        description="Добавьте новый контейнер для учёта отходов."
      >
        <template #body>
          <div class="space-y-3">
            <UFormField label="Категория">
              <USelect
                v-model="createForm.category"
                :items="['Макулатура', 'Пластик', 'Общее'].map(v => ({ label: v, value: v }))"
              />
            </UFormField>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Объём, м³">
                <UInput v-model="createForm.volumeM3" type="number" min="0" step="0.1" class="w-full" />
              </UFormField>
              <UFormField label="Ширина, м">
                <UInput v-model="createForm.widthM" type="number" min="0" step="0.1" class="w-full" />
              </UFormField>
              <UFormField label="Высота, м">
                <UInput v-model="createForm.heightM" type="number" min="0" step="0.1" class="w-full" />
              </UFormField>
              <UFormField label="Вес, кг (авто)">
                <UInput
                  :model-value="Math.round(createForm.densityKgPerM3 * (Number(createForm.volumeM3) || 0))"
                  type="number"
                  disabled
                  class="w-full"
                />
              </UFormField>
            </div>
            <UFormField label="Статус">
              <USelect
                v-model="createForm.status"
                :items="[
                  { label: 'Доступен', value: 'available' },
                  { label: 'Загружен', value: 'loaded' }
                ]"
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
                label="Создать"
                icon="i-lucide-check"
                :loading="creating"
                @click="createBin"
              />
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
