<script setup lang="ts">
definePageMeta({
  title: 'Кристаллизация / Полировка',
  ssr: true
})

type MarbleEvent = {
  id: number
  objectId: number | null
  type: 'crystallization' | 'polishing'
  performedAt: string
  team: string
  executors: string[]
  areaM2: number
  notes: string | null
  photos: string[]
  createdAt: string
}

const toast = useToast()
const { canManageMarble } = useRoleAccess()
const activeObject = useState<{ id: number, name: string } | null>('active-object')

const {
  data,
  pending,
  refresh
} = await useAutoRefreshAsyncData<{ events: MarbleEvent[] }>(
  'marble-events',
  () => $fetch('/api/reports/marble', { query: { objectId: activeObject.value?.id } }),
  { default: () => ({ events: [] }), watch: [activeObject] }
)

const events = computed(() => data.value?.events || [])
const crystallizationEvents = computed(() => events.value.filter(e => e.type === 'crystallization'))
const polishingEvents = computed(() => events.value.filter(e => e.type === 'polishing'))

const lastCrystallization = computed(() => crystallizationEvents.value[0] || null)
const lastPolishing = computed(() => polishingEvents.value[0] || null)

const totalArea = computed(() => events.value.reduce((s, e) => s + e.areaM2, 0))
const areaLast30 = computed(() => {
  const from = Date.now() - 30 * 24 * 60 * 60 * 1000
  return events.value
    .filter(e => new Date(e.performedAt).getTime() >= from)
    .reduce((s, e) => s + e.areaM2, 0)
})

const createModalOpen = ref(false)
const creating = ref(false)
const uploadingPhotos = ref(false)
const createForm = reactive({
  type: 'crystallization' as 'crystallization' | 'polishing',
  performedAt: new Date().toISOString().slice(0, 16),
  team: '',
  executors: [] as string[],
  areaM2: 0,
  photos: [] as string[],
  notes: ''
})

const { data: customers } = await useAutoRefreshAsyncData<{ id: number, username: string, objectPinned: string, objectPositions: string[] }[]>(
  'marble-customers',
  () => $fetch('/api/customers'),
  { default: () => [] }
)

const objectName = computed(() => activeObject.value?.name?.trim() || '')

const availableExecutors = computed(() => {
  const list = customers.value || []
  if (!objectName.value) return list
  return list.filter((c) => c.objectPinned === objectName.value || c.objectPositions?.includes(objectName.value))
})

const executorItems = computed(() =>
  availableExecutors.value.map((c) => ({
    label: `@${c.username}`,
    value: c.username
  }))
)

function formatDateTime(value?: string | Date | null) {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatNumber(n: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n)
}

async function submitEvent() {
  if (!canManageMarble.value) return
  if (creating.value) return
  creating.value = true
  try {
    await $fetch('/api/reports/marble/event', {
      method: 'POST',
      body: {
        type: createForm.type,
        performedAt: createForm.performedAt,
        team: createForm.team,
        executors: createForm.executors,
        areaM2: createForm.areaM2,
        notes: createForm.notes || null,
        photos: createForm.photos,
        objectId: activeObject.value?.id ?? null
      }
    })
    toast.add({ title: 'Запись сохранена', color: 'success' })
    createModalOpen.value = false
    createForm.team = ''
    createForm.executors = []
    createForm.areaM2 = 0
    createForm.notes = ''
    createForm.photos = []
    createForm.performedAt = new Date().toISOString().slice(0, 16)
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось сохранить',
      description: (err as any)?.data?.message || (err as Error)?.message,
      color: 'error'
    })
  } finally {
    creating.value = false
  }
}

async function uploadPhotos(event: Event) {
  if (!canManageMarble.value) return
  const target = event.target as HTMLInputElement | null
  if (!target?.files || !target.files.length) return
  if (uploadingPhotos.value) return
  uploadingPhotos.value = true
  const formData = new FormData()
  Array.from(target.files).forEach((file) => formData.append('files', file))
  try {
    const res = await $fetch<{ urls: string[] }>('/api/uploads/marble', {
      method: 'POST',
      body: formData
    })
    createForm.photos = res.urls || []
    toast.add({ title: 'Фото загружены', color: 'success' })
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось загрузить фото',
      description: (err as any)?.data?.message || (err as Error)?.message,
      color: 'error'
    })
  } finally {
    uploadingPhotos.value = false
    if (target) target.value = ''
  }
}
</script>

<template>
  <UDashboardPanel id="marble">
    <template #header>
      <UDashboardNavbar title="Кристаллизация / Полировка мрамора">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UBadge
            v-if="!canManageMarble"
            label="Только чтение"
            color="neutral"
            variant="subtle"
          />
          <UButton
            v-if="canManageMarble"
            icon="i-lucide-plus"
            label="Новая запись"
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
          <UPageCard icon="i-lucide-diamond" title="Последняя кристаллизация" variant="subtle">
            <p class="text-lg font-semibold text-highlighted">{{ formatDateTime(lastCrystallization?.performedAt) }}</p>
            <p class="text-xs text-muted">{{ lastCrystallization?.team || 'данных нет' }}</p>
          </UPageCard>
          <UPageCard icon="i-lucide-sparkles" title="Последняя полировка" variant="subtle">
            <p class="text-lg font-semibold text-highlighted">{{ formatDateTime(lastPolishing?.performedAt) }}</p>
            <p class="text-xs text-muted">{{ lastPolishing?.team || 'данных нет' }}</p>
          </UPageCard>
          <UPageCard icon="i-lucide-ruler" title="Объём" variant="subtle">
            <p class="text-lg font-semibold text-highlighted">{{ formatNumber(areaLast30) }} м² / 30 дн.</p>
            <p class="text-xs text-muted">Всего учтено: {{ formatNumber(totalArea) }} м²</p>
          </UPageCard>
        </div>

        <div class="rounded-lg border border-default bg-elevated/30">
          <div class="flex items-center justify-between px-4 py-3 border-b border-default/60">
            <div>
              <h3 class="font-semibold text-highlighted leading-tight">История работ</h3>
              <p class="text-xs text-muted">Дата, команда, исполнители и объём в м²</p>
            </div>
            <UBadge :label="events.length" variant="subtle" />
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-elevated/40">
                  <th class="px-3 py-2 text-left">Тип</th>
                  <th class="px-3 py-2 text-left">Дата</th>
                  <th class="px-3 py-2 text-left">Команда</th>
                  <th class="px-3 py-2 text-left">Исполнители</th>
                  <th class="px-3 py-2 text-left">Площадь</th>
                  <th class="px-3 py-2 text-left">Фото</th>
                  <th class="px-3 py-2 text-left">Заметки</th>
                </tr>
              </thead>
              <tbody>
                <template v-if="pending">
                  <tr v-for="n in 5" :key="`marble-loading-${n}`" class="border-t border-default">
                    <td class="px-3 py-3" colspan="7">
                      <div class="h-4 w-full bg-default/50 rounded animate-pulse" />
                    </td>
                  </tr>
                </template>
                <template v-else>
                  <tr
                    v-for="event in events"
                    :key="event.id"
                    class="border-t border-default"
                  >
                    <td class="px-3 py-2 font-semibold text-highlighted">
                      {{ event.type === 'crystallization' ? 'Кристаллизация' : 'Полировка' }}
                    </td>
                    <td class="px-3 py-2">{{ formatDateTime(event.performedAt) }}</td>
                    <td class="px-3 py-2">{{ event.team }}</td>
                    <td class="px-3 py-2">
                      <UBadge
                        v-for="exec in event.executors"
                        :key="exec"
                        label=" "
                        variant="subtle"
                        class="mr-1"
                      >
                        {{ exec }}
                      </UBadge>
                      <span v-if="!event.executors.length" class="text-muted text-xs">—</span>
                    </td>
                    <td class="px-3 py-2">{{ formatNumber(event.areaM2) }} м²</td>
                    <td class="px-3 py-2 space-x-1">
                      <template v-if="event.photos.length">
                        <UButton
                          v-for="(photo, idx) in event.photos"
                          :key="idx"
                          :href="photo"
                          target="_blank"
                          variant="ghost"
                          size="xs"
                          icon="i-lucide-image"
                          :label="`Фото ${idx + 1}`"
                        />
                      </template>
                      <span v-else class="text-muted text-xs">—</span>
                    </td>
                    <td class="px-3 py-2">{{ event.notes || '—' }}</td>
                  </tr>
                  <tr v-if="!events.length">
                    <td class="px-3 py-4 text-muted text-center" colspan="7">
                      Пока нет записей. Добавьте первую обработку мрамора.
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <UModal
        v-if="canManageMarble"
        v-model:open="createModalOpen"
        title="Новая обработка"
        description="Зафиксируйте кристаллизацию или полировку: команда и площадь."
      >
        <template #body>
          <div class="space-y-3">
            <UFormField label="Тип работы">
              <USelect
                v-model="createForm.type"
                :items="[
                  { label: 'Кристаллизация', value: 'crystallization' },
                  { label: 'Полировка', value: 'polishing' }
                ]"
              />
            </UFormField>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Дата и время">
                <UInput v-model="createForm.performedAt" type="datetime-local" class="w-full" />
              </UFormField>
              <UFormField label="Команда">
                <UInput v-model="createForm.team" class="w-full" placeholder="Например: MarblePro Crew" />
              </UFormField>
            </div>
            <UFormField label="Площадь, м²">
              <UInput v-model.number="createForm.areaM2" type="number" min="0.1" step="0.1" class="w-full" />
            </UFormField>
            <UFormField label="Исполнители (через запятую)">
              <USelectMenu
                v-model="createForm.executors"
                :items="executorItems"
                multiple
                searchable
                value-key="value"
                label-key="label"
                placeholder="Выберите сотрудников"
                class="w-full"
              />
              <p v-if="!executorItems.length" class="text-xs text-muted mt-1">
                Нет сотрудников для этого объекта. Добавьте их в разделе «Документы» или снимите фильтр по объекту.
              </p>
            </UFormField>
            <UFormField label="Ссылки на фото (новая строка или запятая)">
              <div class="space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  class="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-3 file:rounded-md file:border file:border-default file:bg-elevated/50 file:text-sm file:cursor-pointer"
                  @change="uploadPhotos"
                />
                <div v-if="createForm.photos.length" class="flex flex-wrap gap-2 text-xs text-muted">
                  <UBadge
                    v-for="(url, idx) in createForm.photos"
                    :key="idx"
                    :label="`Фото ${idx + 1}`"
                    variant="subtle"
                    color="neutral"
                  />
                </div>
                <p class="text-xs text-muted">Загрузите фото — ссылки сохранятся автоматически.</p>
              </div>
            </UFormField>
            <UFormField label="Заметки">
              <UTextarea v-model="createForm.notes" class="w-full" rows="3" placeholder="Что делали, материалы" />
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
                icon="i-lucide-check"
                :loading="creating"
                @click="submitEvent"
              />
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
