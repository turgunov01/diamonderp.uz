<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import { usePersistentNotifications } from '~/composables/usePersistentNotifications'

definePageMeta({
  title: 'Арома-диффузоры',
  ssr: true
})

type AromaDevice = {
  id: number
  name: string
  location: string
  lastRefill: string
  refillEveryDays: number
  volumeMl: number
  pricePerRefill: number
  active: boolean
}

type AromaRefill = {
  id: number
  deviceId: number
  amountMl: number
  price: number
  refilledAt: string
}

const toast = useToast()
const overdueToastIds = useLocalStorage<number[]>('aroma-overdue-toast', [])
const { canManageAroma } = useRoleAccess()
const { upsert: pushNotification, removeById: removeNotification, localNotifications } = usePersistentNotifications()
const activeObject = useState<{ id: number, name: string } | null>('active-object')

const {
  data,
  pending,
  refresh
} = await useAutoRefreshAsyncData<{ devices: AromaDevice[]; refills?: AromaRefill[] }>('aroma-devices', () => $fetch('/api/reports/aroma', {
  query: { objectId: activeObject.value?.id }
}), {
  default: () => ({ devices: [], refills: [] }),
  watch: [activeObject]
})

const reportRange = reactive({
  from: '',
  to: ''
})

const reportLoading = ref(false)

const createModalOpen = ref(false)
const creating = ref(false)
const createForm = reactive({
  name: '',
  location: '',
  refillEveryDays: 14,
  volumeMl: 300,
  pricePerRefill: 0,
  lastRefill: new Date().toISOString().slice(0, 10),
  active: true
})
const editModalOpen = ref(false)
const editingDevice = ref<AromaDevice | null>(null)
const editForm = reactive({
  id: 0,
  name: '',
  location: '',
  refillEveryDays: 14,
  volumeMl: 300,
  pricePerRefill: 0,
  lastRefill: new Date().toISOString().slice(0, 10),
  active: true
})

const devices = computed(() => data.value?.devices || [])
const refills = computed(() => data.value?.refills || [])

const activeDevices = computed(() => devices.value.filter(d => d.active))

const MS_PER_DAY = 1000 * 60 * 60 * 24

function daysSince(dateStr: string) {
  const start = new Date(dateStr)
  start.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today.getTime() - start.getTime()) / MS_PER_DAY))
}

function dailySpent(device: AromaDevice) {
  if (!device.refillEveryDays || device.refillEveryDays <= 0) return 0
  return Number(device.volumeMl || 0) / device.refillEveryDays
}

function remainingMl(device: AromaDevice) {
  const spentPerDay = dailySpent(device)
  const consumed = spentPerDay * daysSince(device.lastRefill)
  return Math.max(0, Math.round((device.volumeMl || 0) - consumed))
}

function remainingDays(device: AromaDevice) {
  const spentPerDay = dailySpent(device)
  if (!spentPerDay) return '∞'
  return Math.max(0, Math.ceil(remainingMl(device) / spentPerDay))
}

const overdueDevices = computed(() =>
  devices.value.filter(d => d.refillEveryDays > 0 && daysSince(d.lastRefill) >= d.refillEveryDays)
)

watch(overdueDevices, (list) => {
  const overdueIds = list.map(d => d.id)

  for (const device of list) {
    if (!overdueToastIds.value.includes(device.id)) {
      toast.add({
        title: 'Просрочена заправка',
        description: `${device.name} — нужно заправить`,
        color: 'warning'
      })
      overdueToastIds.value = [...overdueToastIds.value, device.id]
    }

    pushNotification({
      id: -1000 - device.id, // локальные ID, не конфликтуют с сервером
      unread: true,
      body: `Просрочена заправка: ${device.name}`,
      date: new Date().toISOString(),
      sender: {
        id: 0,
        name: 'Арома-диффузоры',
        email: 'system@local',
        status: 'subscribed',
        location: device.location || '—',
        avatar: { src: 'https://dummyimage.com/64x64/1e293b/ffffff&text=AD' }
      }
    })
  }

  // очистить уведомления для исправленных устройств
  const stillOverdueIds = new Set(overdueIds)
  overdueToastIds.value = overdueToastIds.value.filter(id => stillOverdueIds.has(id))
  const allLocalIds = (localNotifications.value || []).map(n => n.id)
  for (const nid of allLocalIds) {
    if (nid <= -1000) {
      const originalId = Math.abs(nid + 1000)
      if (!stillOverdueIds.has(originalId)) {
        removeNotification(nid)
      }
    }
  }
}, { immediate: true })

// Подтягиваем варианты локаций из объектов API + уже сохранённых устройств
const activeBuilding = useState<{ id: number, name: string } | null>('active-building')

const { data: objectsData, refresh: refreshObjects } = await useAutoRefreshAsyncData<{ id: number; name: string }[]>(
  'aroma-objects',
  () => $fetch('/api/objects', {
    query: {
      buildingId: activeBuilding.value?.id
    }
  }),
  { default: () => [], watch: [activeBuilding] }
)
const locationOptions = computed(() => {
  const set = new Set<string>()
  devices.value.forEach(d => {
    if (d.location && d.location.trim()) set.add(d.location.trim())
  })
  ;(objectsData.value || []).forEach(o => {
    if (o.name && o.name.trim()) set.add(o.name.trim())
  })
  return Array.from(set).map(l => ({ label: l, value: l }))
})

function nextRefill(device: AromaDevice) {
  const next = new Date(device.lastRefill)
  next.setDate(next.getDate() + device.refillEveryDays)
  return next
}

const nextRefillSoon = computed(() => {
  return activeDevices.value
    .map(d => nextRefill(d))
    .sort((a, b) => a.getTime() - b.getTime())[0] || null
})

const totalMonthlyCost = computed(() => {
  return activeDevices.value.reduce((sum, d) => sum + d.pricePerRefill, 0)
})

function formatDate(value?: string | Date | null) {
  if (!value) return '-'
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'UZS', maximumFractionDigits: 0 }).format(amount)
}

async function generateReport() {
  if (reportLoading.value) return
  reportLoading.value = true
  try {
    const res = await fetch('/api/reports/aroma/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: reportRange.from || null,
        to: reportRange.to || null,
        objectId: activeObject.value?.id ?? null
      })
    })
    if (!res.ok) throw new Error('Не удалось сформировать отчёт')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'aroma-report.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast.add({ title: 'Отчёт сформирован', description: 'CSV файл скачан', color: 'success' })
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось сформировать отчёт',
      description: (err as any)?.data?.statusMessage || (err as Error)?.message,
      color: 'error'
    })
  } finally {
    reportLoading.value = false
  }
}

async function createDevice() {
  if (!canManageAroma.value) return
  if (creating.value) return
  creating.value = true
  try {
    await $fetch('/api/reports/aroma/device', {
      method: 'POST',
      body: {
        name: createForm.name,
        location: createForm.location || null,
        refill_every_days: createForm.refillEveryDays,
        volume_ml: createForm.volumeMl,
        price_per_refill: createForm.pricePerRefill,
        last_refill: createForm.lastRefill,
        active: createForm.active,
        object_id: activeObject.value?.id ?? null
      }
    })
    toast.add({ title: 'Устройство добавлено', color: 'success' })
    createModalOpen.value = false
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось добавить устройство',
      description: (err as any)?.data?.message || (err as Error)?.message,
      color: 'error'
    })
  } finally {
    creating.value = false
  }
}

function openEditDevice(device: AromaDevice) {
  editingDevice.value = device
  Object.assign(editForm, {
    id: device.id,
    name: device.name,
    location: device.location,
    refillEveryDays: device.refillEveryDays,
    volumeMl: device.volumeMl,
    pricePerRefill: device.pricePerRefill,
    lastRefill: device.lastRefill,
    active: device.active
  })
  editModalOpen.value = true
}

async function saveDevice() {
  if (!editingDevice.value || !canManageAroma.value) return
  try {
    await $fetch('/api/reports/aroma/device', {
      method: 'PATCH',
      body: {
        id: editForm.id,
        name: editForm.name,
        location: editForm.location || null,
        refill_every_days: editForm.refillEveryDays,
        volume_ml: editForm.volumeMl,
        price_per_refill: editForm.pricePerRefill,
        last_refill: editForm.lastRefill,
        active: editForm.active,
        object_id: activeObject.value?.id ?? null
      }
    })
    toast.add({ title: 'Изменения сохранены', color: 'success' })
    editModalOpen.value = false
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось сохранить устройство',
      description: (err as any)?.data?.message || (err as Error)?.message,
      color: 'error'
    })
  }
}

async function markRefilledToday(device: AromaDevice) {
  const today = new Date().toISOString().slice(0, 10)
  try {
    await $fetch('/api/reports/aroma/device', {
      method: 'PATCH',
      body: {
        id: device.id,
        last_refill: today
      }
    })
    toast.add({ title: 'Заправка отмечена', description: `Последняя заправка: ${formatDate(today)}`, color: 'success' })
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось отметить заправку',
      description: (err as any)?.data?.message || (err as Error)?.message,
      color: 'error'
    })
  }
}
</script>

<template>
  <UDashboardPanel id="aroma">
    <template #header>
      <UDashboardNavbar title="Арома-диффузоры">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UBadge
            v-if="!canManageAroma"
            label="Только чтение"
            color="neutral"
            variant="subtle"
          />
          <UButton
            v-if="canManageAroma"
            icon="i-lucide-plus"
            label="Добавить"
            color="primary"
            @click="createModalOpen = true"
          />
          <UButton
            icon="i-lucide-refresh-ccw"
            color="neutral"
            variant="outline"
            :loading="pending"
            @click="refresh"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-3">
          <UPageCard icon="i-lucide-flame" title="Активные" variant="subtle">
            <p class="text-2xl font-semibold text-highlighted">{{ activeDevices.length }}</p>
            <p class="text-xs text-muted">Устройства, требующие обязательных заправок</p>
          </UPageCard>
          <UPageCard icon="i-lucide-calendar-range" title="Ближайшая заправка" variant="subtle">
            <p class="text-lg font-semibold text-highlighted">
              {{ nextRefillSoon ? formatDate(nextRefillSoon) : '—' }}
            </p>
            <p class="text-xs text-muted">Смотрим по графику refillEveryDays</p>
          </UPageCard>
          <UPageCard icon="i-lucide-wallet" title="Оценка за месяц" variant="subtle">
            <p class="text-lg font-semibold text-highlighted">{{ formatCurrency(totalMonthlyCost) }}</p>
            <p class="text-xs text-muted">Сумма по активным устройствам</p>
          </UPageCard>
        </div>

        <div class="rounded-lg border border-default bg-elevated/40 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-highlighted">График заправок</h3>
            <UBadge :label="devices.length" variant="subtle" />
          </div>
          <div class="overflow-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-elevated/60">
                  <th class="px-3 py-2 text-left">Устройство</th>
                  <th class="px-3 py-2 text-left">Локация</th>
                  <th class="px-3 py-2 text-left">Последняя</th>
                  <th class="px-3 py-2 text-left">Следующая</th>
                  <th class="px-3 py-2 text-left">Интервал</th>
                  <th class="px-3 py-2 text-left">Объём</th>
                  <th class="px-3 py-2 text-left">Расход/день</th>
                  <th class="px-3 py-2 text-left">Осталось</th>
                  <th class="px-3 py-2 text-left">Цена</th>
                  <th class="px-3 py-2 text-left">Статус</th>
                  <th class="px-3 py-2 text-left" v-if="canManageAroma">Действия</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="device in devices"
                  :key="device.id"
                  class="border-t border-default"
                >
                  <td class="px-3 py-2 font-semibold text-highlighted">
                    {{ device.name }}
                  </td>
                  <td class="px-3 py-2 text-muted">{{ device.location }}</td>
                  <td class="px-3 py-2">{{ formatDate(device.lastRefill) }}</td>
                  <td class="px-3 py-2">{{ formatDate(nextRefill(device)) }}</td>
                  <td class="px-3 py-2 text-muted">{{ device.refillEveryDays }} дн.</td>
                  <td class="px-3 py-2 text-muted">{{ device.volumeMl }} мл</td>
                  <td class="px-3 py-2 text-muted">{{ Math.round(dailySpent(device)) }} мл/день</td>
                  <td class="px-3 py-2">
                    <div class="space-y-0.5">
                      <span class="font-medium text-highlighted">{{ remainingMl(device) }} мл</span>
                      <p class="text-xs text-muted">~ {{ remainingDays(device) }} дн.</p>
                    </div>
                  </td>
                  <td class="px-3 py-2 text-muted">{{ formatCurrency(device.pricePerRefill) }}</td>
                  <td class="px-3 py-2">
                    <UBadge :label="device.active ? 'Активен' : 'Выключен'" :color="device.active ? 'success' : 'neutral'" variant="subtle" />
                  </td>
                  <td v-if="canManageAroma" class="px-3 py-2 space-x-2">
                    <UButton size="xs" variant="ghost" color="primary" label="Редактировать" @click="openEditDevice(device)" />
                    <UButton size="xs" variant="outline" color="success" label="Заправка сегодня" @click="markRefilledToday(device)" />
                  </td>
                </tr>
                <tr v-if="!devices.length">
                  <td :colspan="canManageAroma ? 10 : 9" class="px-3 py-3 text-center text-muted text-sm">
                    Нет данных по диффузорам.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="rounded-lg border border-default bg-elevated/30 p-4 space-y-3">
          <div class="flex flex-wrap items-center gap-3 justify-between">
            <h3 class="font-semibold text-highlighted">Генерация отчёта</h3>
            <div class="flex flex-wrap gap-2">
              <UFormField label="С">
                <UInput v-model="reportRange.from" type="date" class="w-full" />
              </UFormField>
              <UFormField label="По">
                <UInput v-model="reportRange.to" type="date" class="w-full" />
              </UFormField>
              <UButton
                icon="i-lucide-file-text"
                label="Сформировать"
                :loading="reportLoading"
                @click="generateReport"
              />
            </div>
          </div>
          <p class="text-xs text-muted">Рекомендуем формировать 1–2 раза в месяц или по выбранному диапазону.</p>
        </div>

        <div class="rounded-lg border border-default bg-elevated/40 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-highlighted">Последние заправки</h3>
            <UBadge :label="refills.length" variant="subtle" />
          </div>
          <div v-if="!refills.length" class="text-sm text-muted">Пока нет записей о заправках.</div>
          <div v-else class="overflow-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-elevated/60">
                  <th class="px-3 py-2 text-left">Устройство</th>
                  <th class="px-3 py-2 text-left">Объём</th>
                  <th class="px-3 py-2 text-left">Цена</th>
                  <th class="px-3 py-2 text-left">Дата</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="refill in refills"
                  :key="refill.id"
                  class="border-t border-default"
                >
                  <td class="px-3 py-2">
                    #{{ refill.deviceId }}
                  </td>
                  <td class="px-3 py-2 text-muted">{{ refill.amountMl }} мл</td>
                  <td class="px-3 py-2 text-muted">{{ formatCurrency(refill.price) }}</td>
                  <td class="px-3 py-2">{{ formatDate(refill.refilledAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p v-if="pending" class="text-sm text-muted">Загрузка данных...</p>
      </div>

      <UModal
        v-if="canManageAroma"
        v-model:open="createModalOpen"
        title="Добавить диффузор"
        description="Создайте устройство, чтобы отслеживать график заправок."
      >
        <template #body>
          <div class="space-y-3">
            <UFormField label="Название">
              <UInput v-model="createForm.name" class="w-full" placeholder="Например: Lobby Diffuser" />
            </UFormField>
            <UFormField label="Локация">
              <USelect
                v-model="createForm.location"
                :items="locationOptions"
                class="w-full"
                placeholder="Выберите локацию"
                :disabled="!locationOptions.length"
              />
              <p v-if="!locationOptions.length" class="text-xs text-muted mt-1">
                Нет сохранённых локаций для выбранного объекта. Создайте устройство с локацией через другой объект, чтобы появился список.
              </p>
            </UFormField>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Интервал заправки, дней">
                <UInput v-model="createForm.refillEveryDays" type="number" min="1" step="1" class="w-full" />
              </UFormField>
              <UFormField label="Объём, мл">
                <UInput v-model="createForm.volumeMl" type="number" min="0" step="10" class="w-full" />
              </UFormField>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Цена за заправку">
                <UInput v-model="createForm.pricePerRefill" type="number" min="0" step="1000" class="w-full" />
              </UFormField>
              <UFormField label="Дата последней заправки">
                <UInput v-model="createForm.lastRefill" type="date" class="w-full" />
              </UFormField>
            </div>
            <UFormField>
              <UCheckbox v-model="createForm.active" label="Активно" />
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
                label="Добавить"
                icon="i-lucide-check"
                :loading="creating"
                @click="createDevice"
              />
            </div>
          </div>
        </template>
      </UModal>

      <UModal
        v-if="canManageAroma"
        v-model:open="editModalOpen"
        title="Редактировать диффузор"
        description="Обновите параметры устройства"
      >
        <template #body>
          <div class="space-y-3">
            <UFormField label="Название">
              <UInput v-model="editForm.name" class="w-full" />
            </UFormField>
            <UFormField label="Локация">
              <USelect
                v-model="editForm.location"
                :items="locationOptions"
                class="w-full"
                placeholder="Выберите локацию"
              />
            </UFormField>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Интервал заправки, дней">
                <UInput v-model="editForm.refillEveryDays" type="number" min="1" step="1" class="w-full" />
              </UFormField>
              <UFormField label="Объём, мл">
                <UInput v-model="editForm.volumeMl" type="number" min="0" step="10" class="w-full" />
              </UFormField>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Цена за заправку">
                <UInput v-model="editForm.pricePerRefill" type="number" min="0" step="1000" class="w-full" />
              </UFormField>
              <UFormField label="Дата последней заправки">
                <UInput v-model="editForm.lastRefill" type="date" class="w-full" />
              </UFormField>
            </div>
            <UFormField>
              <UCheckbox v-model="editForm.active" label="Активно" />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex items-center justify-end gap-2">
            <UButton label="Отмена" color="neutral" variant="subtle" @click="editModalOpen = false" />
            <UButton label="Сохранить" icon="i-lucide-check" @click="saveDevice" />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
