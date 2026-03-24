<script setup lang="ts">
definePageMeta({
  title: 'Отходы',
  ssr: true
})

type BinCategory = 'Макулатура' | 'Пластик' | 'Общее'
type BinStatus = 'available' | 'loaded'
type WasteDirection = 'in' | 'out'

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
  direction: WasteDirection
  fromObjectId?: number | null
  toObjectId?: number | null
  vehicle?: string | null
  photoUrl?: string | null
  comment?: string | null
  createdAt: string
}

interface WasteResponse {
  bins: WasteBin[]
  reports: WasteReport[]
}

const toast = useToast()
const { canManageWaste } = useRoleAccess()
const activeObject = useState<{ id: number, name: string } | null>('active-object')

const { data: objectsData } = await useFetch<{ id: number, name: string }[]>('/api/objects', {
  default: () => [],
  query: { order: 'name.asc' }
})

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
const bins = computed(() => data.value?.bins || [])
const reports = computed(() => data.value?.reports || [])

const objectOptions = computed(() => (objectsData.value || []).map(o => ({ label: o.name, value: o.id })))
const objectNameById = computed(() => {
  const map = new Map<number, string>()
  for (const o of objectsData.value || []) map.set(o.id, o.name)
  return map
})

const totals = computed(() => ({
  total: bins.value.length,
  available: bins.value.filter(b => b.status === 'available').length,
  loaded: bins.value.filter(b => b.status === 'loaded').length
}))

const categoryStats = computed(() => {
  const cats: BinCategory[] = ['Макулатура', 'Пластик', 'Общее']
  return cats.map(cat => {
    const catBins = bins.value.filter(b => b.category === cat)
    return {
      category: cat,
      total: catBins.length,
      available: catBins.filter(b => b.status === 'available').length,
      loaded: catBins.filter(b => b.status === 'loaded').length
    }
  })
})

const createModalOpen = ref(false)
const creating = ref(false)
const createForm = reactive({
  category: 'Общее' as BinCategory,
  volumeM3: 1,
  densityKgPerM3: 80,
  weightKg: 0,
  status: 'available' as BinStatus,
  objectId: null as number | null
})

const estimatedWeight = computed(() => {
  const volume = Number(createForm.volumeM3) || 0
  const density = Number(createForm.densityKgPerM3) || 0
  return Math.max(0, Math.round(volume * density))
})

watch([() => createForm.volumeM3, () => createForm.densityKgPerM3], () => {
  createForm.weightKg = estimatedWeight.value
})

const operationForm = reactive({
  direction: 'out' as WasteDirection,
  binId: null as number | null,
  fromObjectId: null as number | null,
  toObjectId: null as number | null,
  vehicle: '',
  amountM3: 0,
  amountKg: 0,
  photoUrl: '',
  comment: ''
})

const binDetailsOpen = ref(false)
const selectedBin = ref<WasteBin | null>(null)

function submitWasteRemoval() {
  operationForm.direction = 'out'
  void submitOperation()
}

function formatNumber(n: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n)
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

function directionLabel(direction: WasteDirection) {
  return direction === 'out' ? 'Вывоз' : 'Ввоз'
}

function openBinDetails(bin: WasteBin) {
  selectedBin.value = { ...bin }
  binDetailsOpen.value = true
}

async function submitOperation() {
  if (!canManageWaste.value) return
  if (!operationForm.binId) {
    toast.add({ title: 'Выберите бак', color: 'warning' })
    return
  }
  try {
    await $fetch('/api/waste/report', {
      method: 'POST',
      body: {
        ...operationForm,
        fromObjectId: operationForm.fromObjectId ?? activeObject.value?.id ?? null,
        toObjectId: operationForm.toObjectId ?? activeObject.value?.id ?? null
      }
    })
    toast.add({ title: 'Операция сохранена', color: 'success' })
    Object.assign(operationForm, {
      direction: 'out' as WasteDirection,
      binId: null,
      fromObjectId: null,
      toObjectId: null,
      vehicle: '',
      amountM3: 0,
      amountKg: 0,
      photoUrl: '',
      comment: ''
    })
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось сохранить',
      description: (err as any)?.data?.statusMessage || (err as Error)?.message,
      color: 'error'
    })
  }
}

async function createBin() {
  if (!canManageWaste.value || creating.value) return
  creating.value = true

  createForm.weightKg = Math.round((Number(createForm.volumeM3) || 0) * (Number(createForm.densityKgPerM3) || 0))

  try {
    await $fetch('/api/waste/bin', {
      method: 'POST',
      body: {
        category: createForm.category,
        volumeM3: createForm.volumeM3,
        weightKg: createForm.weightKg,
        status: createForm.status,
        objectId: createForm.objectId ?? activeObject.value?.id ?? null
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

async function updateBin(binId: number, patch: Partial<WasteBin>) {
  if (!canManageWaste.value) return
  await $fetch(`/api/waste/${binId}`, {
    method: 'PATCH',
    body: {
      status: patch.status,
      object_id: patch.objectId
    }
  })
  await refresh()
}
</script>

<template>
  <UDashboardPanel>
    <template #title>
      Отходы
    </template>

    <template #links>
      <UButton
        v-if="canManageWaste"
        size="sm"
        icon="i-lucide-plus"
        label="Создать бак"
        @click="createModalOpen = true"
      />
    </template>

    <template #body>
      <div class="grid gap-4 md:grid-cols-3">
        <div class="rounded-lg border border-default bg-elevated/40 p-4">
          <p class="text-xs text-muted">Всего баков</p>
          <p class="text-2xl font-semibold text-highlighted">{{ totals.total }}</p>
          <p class="text-xs text-muted mt-1">Свободно: {{ totals.available }} · Загружено: {{ totals.loaded }}</p>
        </div>
        <div
          v-for="stat in categoryStats"
          :key="stat.category"
          class="rounded-lg border border-default bg-elevated/40 p-4"
        >
          <p class="text-xs text-muted">{{ stat.category }}</p>
          <p class="text-xl font-semibold text-highlighted">{{ stat.total }}</p>
          <p class="text-xs text-muted mt-1">Свободно: {{ stat.available }} · Загружено: {{ stat.loaded }}</p>
        </div>
      </div>

      <div class="rounded-lg border border-default bg-elevated/30 p-4 space-y-2">
        <h4 class="font-semibold text-highlighted">Типы баков</h4>
        <p class="text-xs text-muted">Справочник типов и что в них можно класть.</p>
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-elevated/40">
                <th class="px-3 py-2 text-left">Тип</th>
                <th class="px-3 py-2 text-left">Описание</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-t border-default">
                <td class="px-3 py-2 font-medium">Макулатура</td>
                <td class="px-3 py-2 text-muted">Бумага, картон, архивы без пластиковых обложек.</td>
              </tr>
              <tr class="border-t border-default">
                <td class="px-3 py-2 font-medium">Пластик</td>
                <td class="px-3 py-2 text-muted">ПЭТ, плёнка, тара; без металла и стекла.</td>
              </tr>
              <tr class="border-t border-default">
                <td class="px-3 py-2 font-medium">Общее</td>
                <td class="px-3 py-2 text-muted">Смешанные отходы без сортировки.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div class="rounded-lg border border-default bg-elevated/30">
          <div class="flex items-center justify-between px-4 py-3 border-b border-default/60">
            <div>
              <h3 class="font-semibold text-highlighted leading-tight">Контейнеры</h3>
              <p class="text-xs text-muted">Создавайте, закрепляйте за объектом и меняйте статус</p>
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
                  <th class="px-3 py-2 text-left">Детали</th>
                  <th class="px-3 py-2 text-left" v-if="canManageWaste">Действия</th>
                </tr>
              </thead>
              <tbody>
                <template v-if="isLoading">
                  <tr v-for="n in 5" :key="`bin-loading-${n}`" class="border-t border-default">
                    <td class="px-3 py-3" :colspan="canManageWaste ? 9 : 8">
                      <div class="h-4 w-full bg-default/50 rounded animate-pulse" />
                    </td>
                  </tr>
                </template>
                <template v-else>
                  <tr v-for="bin in bins" :key="bin.id" class="border-t border-default">
                    <td class="px-3 py-2">#{{ bin.id }}</td>
                    <td class="px-3 py-2">
                      {{ objectNameById.get(bin.objectId ?? -1) || '—' }}
                      <div v-if="canManageWaste" class="mt-1">
                        <USelect
                          v-model="bin.objectId"
                          :items="objectOptions"
                          placeholder="Закрепить объект"
                          size="xs"
                          @update:model-value="value => updateBin(bin.id, { objectId: value as number | null })"
                        />
                      </div>
                    </td>
                    <td class="px-3 py-2">{{ bin.category }}</td>
                    <td class="px-3 py-2">{{ formatNumber(bin.volumeM3) }}</td>
                    <td class="px-3 py-2">{{ formatNumber(bin.weightKg) }}</td>
                    <td class="px-3 py-2">
                      <UBadge :label="statusLabel(bin.status)" :color="statusColor(bin.status)" variant="subtle" />
                      <div v-if="canManageWaste" class="mt-1">
                        <USelect
                          v-model="bin.status"
                          :items="[
                            { label: 'Свободен', value: 'available' },
                            { label: 'Загружен', value: 'loaded' }
                          ]"
                          size="xs"
                          @update:model-value="value => updateBin(bin.id, { status: value as BinStatus })"
                        />
                      </div>
                    </td>
                    <td class="px-3 py-2">
                      <UButton size="xs" variant="ghost" color="neutral" label="Открыть" @click="openBinDetails(bin)" />
                    </td>
                    <td v-if="canManageWaste" class="px-3 py-2 text-right text-xs text-muted">
                      {{ formatDate(bin.updatedAt) }}
                    </td>
                  </tr>
                  <tr v-if="!bins.length">
                    <td class="px-3 py-4 text-muted" :colspan="canManageWaste ? 9 : 8">
                      Контейнеры не найдены.
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <div class="rounded-lg border border-default bg-elevated/30 p-4 space-y-3">
          <h3 class="font-semibold text-highlighted">Операция (ввоз / вывоз)</h3>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Направление">
              <USelect
                v-model="operationForm.direction"
                :items="[{ label: 'Вывоз', value: 'out' }, { label: 'Ввоз', value: 'in' }]"
              />
            </UFormField>
            <UFormField label="Бак">
              <USelect
                v-model="operationForm.binId"
                :items="bins.map(b => ({ label: `#${b.id} · ${b.category}`, value: b.id }))"
                placeholder="Выберите бак"
              />
            </UFormField>
            <UFormField label="Откуда (объект)">
              <USelect
                v-model="operationForm.fromObjectId"
                :items="objectOptions"
                placeholder="Источник"
              />
            </UFormField>
            <UFormField label="Куда (объект)">
              <USelect
                v-model="operationForm.toObjectId"
                :items="objectOptions"
                placeholder="Получатель / полигон"
              />
            </UFormField>
            <UFormField label="Машина / номер">
              <UInput v-model="operationForm.vehicle" placeholder="01A777AA" />
            </UFormField>
            <UFormField label="Объём, м³">
              <UInput v-model="operationForm.amountM3" type="number" min="0" step="0.1" />
            </UFormField>
            <UFormField label="Вес, кг">
              <UInput v-model="operationForm.amountKg" type="number" min="0" step="1" />
            </UFormField>
            <UFormField label="Фото (URL)">
              <UInput v-model="operationForm.photoUrl" placeholder="https://..." />
            </UFormField>
            <UFormField label="Комментарий" class="sm:col-span-2">
              <UTextarea v-model="operationForm.comment" placeholder="Что увезли, состояние, примечание" />
            </UFormField>
        </div>
        <div class="flex items-center justify-end">
          <UButton
            v-if="canManageWaste"
            icon="i-lucide-send"
            label="Сохранить операцию"
            :loading="isLoading"
            @click="submitOperation"
          />
          <UButton
            v-if="canManageWaste"
            class="ml-2"
            icon="i-lucide-truck"
            label="Создать запись вывоза"
            color="primary"
            variant="outline"
            :loading="isLoading"
            @click="submitWasteRemoval"
          />
          <span v-else class="text-xs text-muted">Редактирование доступно только администратору</span>
        </div>
      </div>
      </div>

      <div class="rounded-lg border border-default bg-elevated/30 mt-4">
        <div class="flex items-center justify-between px-4 py-3 border-b border-default/60">
          <h3 class="font-semibold text-highlighted">История перевозок</h3>
          <UBadge :label="reports.length" variant="subtle" />
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-elevated/40">
                <th class="px-3 py-2 text-left">ID</th>
                <th class="px-3 py-2 text-left">Направление</th>
                <th class="px-3 py-2 text-left">Бак</th>
                <th class="px-3 py-2 text-left">Категория</th>
                <th class="px-3 py-2 text-left">Откуда</th>
                <th class="px-3 py-2 text-left">Куда</th>
                <th class="px-3 py-2 text-left">Машина</th>
                <th class="px-3 py-2 text-left">Объём, м³</th>
                <th class="px-3 py-2 text-left">Вес, кг</th>
                <th class="px-3 py-2 text-left">Фото</th>
                <th class="px-3 py-2 text-left">Дата</th>
              </tr>
            </thead>
            <tbody>
              <template v-if="isLoading">
                <tr v-for="n in 5" :key="`report-loading-${n}`" class="border-t border-default">
                  <td class="px-3 py-3" colspan="11">
                    <div class="h-4 w-full bg-default/50 rounded animate-pulse" />
                  </td>
                </tr>
              </template>
              <template v-else>
                <tr v-for="report in reports" :key="report.id" class="border-t border-default">
                  <td class="px-3 py-2">#{{ report.id }}</td>
                  <td class="px-3 py-2">
                    <UBadge :label="directionLabel(report.direction)" :color="report.direction === 'out' ? 'warning' : 'success'" variant="subtle" />
                  </td>
                  <td class="px-3 py-2">#{{ report.binId }}</td>
                  <td class="px-3 py-2">{{ report.category }}</td>
                  <td class="px-3 py-2">{{ objectNameById.get(report.fromObjectId ?? -1) || '—' }}</td>
                  <td class="px-3 py-2">{{ objectNameById.get(report.toObjectId ?? -1) || '—' }}</td>
                  <td class="px-3 py-2">{{ report.vehicle || '—' }}</td>
                  <td class="px-3 py-2">{{ formatNumber(report.amountM3) }}</td>
                  <td class="px-3 py-2">{{ formatNumber(report.amountKg) }}</td>
                  <td class="px-3 py-2">
                    <a
                      v-if="report.photoUrl"
                      :href="report.photoUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-primary underline"
                    >
                      Фото
                    </a>
                    <span v-else class="text-muted">—</span>
                  </td>
                  <td class="px-3 py-2">{{ formatDate(report.createdAt) }}</td>
                </tr>
                <tr v-if="!reports.length">
                  <td class="px-3 py-4 text-muted" colspan="11">
                    История пуста.
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <UModal
      v-model:open="binDetailsOpen"
      :title="selectedBin ? `Бак #${selectedBin.id}` : 'Бак'"
      :description="selectedBin ? 'Детали контейнера и его тип' : ''"
    >
      <template #body>
        <div v-if="selectedBin" class="space-y-3">
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-md border border-default p-3">
              <p class="text-xs text-muted">Тип</p>
              <p class="font-medium">{{ selectedBin.category }}</p>
            </div>
            <div class="rounded-md border border-default p-3">
              <p class="text-xs text-muted">Статус</p>
              <UBadge :label="statusLabel(selectedBin.status)" :color="statusColor(selectedBin.status)" variant="subtle" />
            </div>
            <div class="rounded-md border border-default p-3">
              <p class="text-xs text-muted">Объект</p>
              <p class="font-medium">{{ objectNameById.get(selectedBin.objectId ?? -1) || '—' }}</p>
            </div>
            <div class="rounded-md border border-default p-3">
              <p class="text-xs text-muted">Обновлён</p>
              <p class="font-medium">{{ formatDate(selectedBin.updatedAt) }}</p>
            </div>
          </div>

          <div class="rounded-md border border-default p-3">
            <p class="text-xs text-muted mb-2">Параметры</p>
            <div class="grid gap-2 sm:grid-cols-3">
              <div>
                <p class="text-xs text-muted">Объём</p>
                <p class="font-medium">{{ formatNumber(selectedBin.volumeM3) }} м³</p>
              </div>
              <div>
                <p class="text-xs text-muted">Вес (нетто)</p>
                <p class="font-medium">{{ formatNumber(selectedBin.weightKg) }} кг</p>
              </div>
              <div>
                <p class="text-xs text-muted">Создан</p>
                <p class="font-medium">{{ formatDate(selectedBin.createdAt) }}</p>
              </div>
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-muted">Выберите бак в таблице, чтобы увидеть детали.</p>
      </template>
    </UModal>

    <UModal
      v-if="canManageWaste"
      v-model:open="createModalOpen"
      title="Создать бак"
      description="Добавьте новый контейнер и привяжите к объекту."
    >
      <template #body>
        <div class="space-y-3">
          <UFormField label="Категория">
            <USelect
              v-model="createForm.category"
              :items="['Макулатура', 'Пластик', 'Общее'].map(v => ({ label: v, value: v }))"
            />
          </UFormField>
          <UFormField label="Объём, м³">
            <UInput v-model="createForm.volumeM3" type="number" min="0" step="0.1" class="w-full" />
          </UFormField>
          <UFormField label="Плотность, кг/м³">
            <UInput v-model="createForm.densityKgPerM3" type="number" min="0" step="1" class="w-full" />
          </UFormField>
          <UFormField label="Статус">
            <USelect
              v-model="createForm.status"
              :items="[
                { label: 'Свободен', value: 'available' },
                { label: 'Загружен', value: 'loaded' }
              ]"
            />
          </UFormField>
          <UFormField label="Объект">
            <USelect
              v-model="createForm.objectId"
              :items="objectOptions"
              placeholder="Не выбран"
            />
          </UFormField>
          <div class="rounded-md border border-default bg-default/60 p-3">
            <p class="text-xs text-muted mb-2">Детали создаваемого бака</p>
            <div class="grid gap-2 sm:grid-cols-3">
              <div>
                <p class="text-xs text-muted">Тип</p>
                <p class="font-medium">{{ createForm.category }}</p>
              </div>
              <div>
                <p class="text-xs text-muted">Объём · Плотность</p>
                <p class="font-medium">{{ formatNumber(createForm.volumeM3) }} м³ · {{ createForm.densityKgPerM3 }} кг/м³</p>
              </div>
              <div>
                <p class="text-xs text-muted">Ожидаемый вес</p>
                <p class="font-medium">{{ formatNumber(estimatedWeight) }} кг</p>
              </div>
            </div>
          </div>
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
  </UDashboardPanel>
</template>
