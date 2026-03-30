<script setup lang="ts">
import type { AuthRole } from '~~/shared/types/auth'

definePageMeta({
  title: 'Дезинфекция и дератизация',
  ssr: true
})

type WorkShift = 'day' | 'night'
type SanitationRoleFilter = 'all' | AuthRole

type SanitationEvent = {
  id: number
  objectId: number | null
  type: 'disinfection' | 'deratization'
  performedAt: string
  team: string
  executors: string[]
  notes: string | null
  photos: string[]
  createdAt: string
}

type SanitationCustomer = {
  id: number
  buildingId?: number | null
  username: string
  role?: string
  status?: 'pending' | 'active' | 'inactive' | 'archived'
  workShift: WorkShift
  objectPinned: string
  objectPositions: string[]
}

const toast = useToast()
const { canManageSanitation } = useRoleAccess()
const activeBuilding = useState<{ id: number, name: string } | null>('active-building')
const activeObject = useState<{ id: number, name: string } | null>('active-object')

const {
  data,
  pending,
  refresh
} = await useAutoRefreshAsyncData<{ events: SanitationEvent[] }>(
  'sanitation-events',
  () => $fetch('/api/reports/sanitation', {
    query: { objectId: activeObject.value?.id }
  }),
  { default: () => ({ events: [] }), watch: [activeObject] }
)

const { data: customers } = await useAutoRefreshAsyncData<SanitationCustomer[]>(
  'sanitation-customers',
  () => $fetch('/api/customers', {
    query: {
      buildingId: activeBuilding.value?.id
    }
  }),
  {
    default: () => [],
    watch: [activeBuilding]
  }
)

const events = computed(() => data.value?.events || [])
const disinfectionEvents = computed(() => events.value.filter(e => e.type === 'disinfection'))
const deratizationEvents = computed(() => events.value.filter(e => e.type === 'deratization'))

const lastDisinfection = computed(() => disinfectionEvents.value[0] || null)
const lastDeratization = computed(() => deratizationEvents.value[0] || null)

const createModalOpen = ref(false)
const creating = ref(false)
const createForm = reactive({
  type: 'disinfection' as 'disinfection' | 'deratization',
  performedAt: new Date().toISOString().slice(0, 16),
  team: 'day' as WorkShift,
  roleFilter: 'all' as SanitationRoleFilter,
  executors: [] as string[],
  notes: '',
  photos: ''
})

const shiftItems: Array<{ label: string, value: WorkShift }> = [
  { label: 'День', value: 'day' },
  { label: 'Ночь', value: 'night' }
]

function getRoleLabel(role?: string | null) {
  if (role === 'admin') return 'Админ'
  if (role === 'hr') return 'HR'
  if (role === 'procurement') return 'Закупщик'
  if (role === 'manager') return 'Менеджер'
  if (role === 'supervisor') return 'Супервайзер'
  if (role === 'cleaner') return 'Клинер'
  if (role === 'customer') return 'Сотрудник'
  return 'Без роли'
}

const buildingName = computed(() => activeBuilding.value?.name?.trim() || '')

const availableExecutors = computed(() => {
  if (!buildingName.value) {
    return []
  }

  return (customers.value || []).filter((customer) => {
    if (customer.workShift !== createForm.team) {
      return false
    }

    if (customer.status === 'inactive' || customer.status === 'archived') {
      return false
    }

    return true
  })
})

const roleFilterItems = computed(() => {
  const roles = Array.from(new Set(
    availableExecutors.value
      .map(customer => customer.role)
      .filter((role): role is AuthRole => typeof role === 'string' && role.trim().length > 0)
  ))

  return [
    { label: 'Все роли', value: 'all' as SanitationRoleFilter },
    ...roles.map(role => ({
      label: getRoleLabel(role),
      value: role as SanitationRoleFilter
    }))
  ]
})

const filteredExecutors = computed(() => {
  if (createForm.roleFilter === 'all') {
    return availableExecutors.value
  }

  return availableExecutors.value.filter(customer => customer.role === createForm.roleFilter)
})

const executorItems = computed(() =>
  filteredExecutors.value.map((customer) => ({
    label: `${getRoleLabel(customer.role)} · @${customer.username}`,
    value: customer.username
  }))
)

watch(roleFilterItems, () => {
  const allowedRoles = new Set(roleFilterItems.value.map(item => item.value))
  if (!allowedRoles.has(createForm.roleFilter)) {
    createForm.roleFilter = 'all'
  }
}, { immediate: true })

watch(filteredExecutors, () => {
  const allowedUsernames = new Set(filteredExecutors.value.map(customer => customer.username))
  createForm.executors = createForm.executors.filter(username => allowedUsernames.has(username))
}, { immediate: true })

function addDays(date: Date, days: number) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function nextDueDate(last: SanitationEvent | null, days: number) {
  if (!last) return null
  return addDays(new Date(last.performedAt), days)
}

const nextDisinfection = computed(() => nextDueDate(lastDisinfection.value, 30))
const nextDeratization = computed(() => nextDueDate(lastDeratization.value, 90))

function formatDate(value?: string | Date | null) {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

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

function formatTeamLabel(team?: string | null) {
  if (!team) return '—'
  if (team === 'day') return 'День'
  if (team === 'night') return 'Ночь'
  return team
}

function statusForDate(target: Date | null) {
  if (!target) return { label: 'Назначьте', color: 'neutral', variant: 'subtle' }
  const now = new Date()
  if (target.getTime() < now.getTime()) return { label: 'Просрочено', color: 'warning', variant: 'subtle' }
  const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return { label: `Через ${diffDays} дн.`, color: diffDays <= 7 ? 'warning' : 'success', variant: 'subtle' }
}

async function submitEvent() {
  if (!canManageSanitation.value) return
  if (creating.value) return

  creating.value = true

  try {
    await $fetch('/api/reports/sanitation/event', {
      method: 'POST',
      body: {
        type: createForm.type,
        performedAt: createForm.performedAt,
        team: createForm.team,
        executors: createForm.executors,
        notes: createForm.notes || null,
        photos: createForm.photos
          .split(/\n|,/)
          .map(photo => photo.trim())
          .filter(Boolean),
        objectId: activeObject.value?.id ?? null
      }
    })

    toast.add({ title: 'Запись сохранена', color: 'success' })
    createModalOpen.value = false
    createForm.team = 'day'
    createForm.roleFilter = 'all'
    createForm.executors = []
    createForm.notes = ''
    createForm.photos = ''
    createForm.performedAt = new Date().toISOString().slice(0, 16)
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось сохранить',
      description: (err as any)?.data?.statusMessage || (err as Error)?.message,
      color: 'error'
    })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="sanitation">
    <template #header>
      <UDashboardNavbar title="Дезинфекция / Дератизация">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UBadge
            v-if="!canManageSanitation"
            label="Только чтение"
            color="neutral"
            variant="subtle"
          />
          <UButton
            v-if="canManageSanitation"
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
          <UPageCard icon="i-lucide-bug" title="Последняя дезинфекция" variant="subtle">
            <p class="text-lg font-semibold text-highlighted">{{ formatDate(lastDisinfection?.performedAt) }}</p>
            <p class="text-xs text-muted">{{ lastDisinfection ? formatTeamLabel(lastDisinfection.team) : 'данных нет' }}</p>
          </UPageCard>
          <UPageCard icon="i-lucide-shield-check" title="Последняя дератизация" variant="subtle">
            <p class="text-lg font-semibold text-highlighted">{{ formatDate(lastDeratization?.performedAt) }}</p>
            <p class="text-xs text-muted">{{ lastDeratization ? formatTeamLabel(lastDeratization.team) : 'данных нет' }}</p>
          </UPageCard>
          <UPageCard icon="i-lucide-calendar-clock" title="График" variant="subtle">
            <p class="text-sm text-muted">
              Дезинфекция: {{ formatDate(nextDisinfection) }}
              <UBadge v-bind="statusForDate(nextDisinfection)" class="ml-2" />
            </p>
            <p class="text-sm text-muted">
              Дератизация: {{ formatDate(nextDeratization) }}
              <UBadge v-bind="statusForDate(nextDeratization)" class="ml-2" />
            </p>
            <p class="text-xs text-muted mt-1">Частота: 1 раз/мес · 1 раз/квартал</p>
          </UPageCard>
        </div>

        <div class="rounded-lg border border-default bg-elevated/30">
          <div class="flex items-center justify-between px-4 py-3 border-b border-default/60">
            <div>
              <h3 class="font-semibold text-highlighted leading-tight">История проведений</h3>
              <p class="text-xs text-muted">Смена, исполнители, фотоотчёты</p>
            </div>
            <UBadge :label="events.length" variant="subtle" />
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-elevated/40">
                  <th class="px-3 py-2 text-left">Тип</th>
                  <th class="px-3 py-2 text-left">Дата</th>
                  <th class="px-3 py-2 text-left">Смена</th>
                  <th class="px-3 py-2 text-left">Исполнители</th>
                  <th class="px-3 py-2 text-left">Фото</th>
                  <th class="px-3 py-2 text-left">Заметки</th>
                </tr>
              </thead>
              <tbody>
                <template v-if="pending">
                  <tr v-for="n in 5" :key="`sanitation-loading-${n}`" class="border-t border-default">
                    <td class="px-3 py-3" colspan="6">
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
                      {{ event.type === 'disinfection' ? 'Дезинфекция' : 'Дератизация' }}
                    </td>
                    <td class="px-3 py-2">{{ formatDateTime(event.performedAt) }}</td>
                    <td class="px-3 py-2">{{ formatTeamLabel(event.team) }}</td>
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
                    <td class="px-3 py-4 text-muted text-center" colspan="6">
                      Пока нет записей. Добавьте первую обработку.
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <UModal
        v-if="canManageSanitation"
        v-model:open="createModalOpen"
        title="Новая обработка"
        description="Запишите факт дезинфекции или дератизации: выберите смену и исполнителей по текущему объекту."
      >
        <template #body>
          <div class="space-y-3">
            <UFormField label="Тип">
              <USelect
                v-model="createForm.type"
                :items="[
                  { label: 'Дезинфекция (1 раз в месяц)', value: 'disinfection' },
                  { label: 'Дератизация (1 раз в квартал)', value: 'deratization' }
                ]"
              />
            </UFormField>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Дата и время проведения">
                <UInput v-model="createForm.performedAt" type="datetime-local" class="w-full" />
              </UFormField>
              <UFormField label="Смена">
                <USelect v-model="createForm.team" :items="shiftItems" class="w-full" />
              </UFormField>
            </div>
            <UFormField label="Роль сотрудников">
              <USelect
                v-model="createForm.roleFilter"
                :items="roleFilterItems"
                :disabled="!buildingName"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="`Сотрудники смены${buildingName ? ` (${buildingName})` : ''}`">
              <USelectMenu
                v-model="createForm.executors"
                :items="executorItems"
                :disabled="!buildingName"
                multiple
                searchable
                value-key="value"
                label-key="label"
                placeholder="Выберите сотрудников"
                class="w-full"
              />
              <p v-if="!buildingName" class="text-xs text-muted mt-1">
                Сначала выберите здание, чтобы получить состав смены.
              </p>
              <p v-else-if="!executorItems.length" class="text-xs text-muted mt-1">
                Для здания «{{ buildingName }}» нет сотрудников
                <template v-if="createForm.roleFilter !== 'all'">
                  с ролью «{{ getRoleLabel(createForm.roleFilter).toLowerCase() }}»
                </template>
                на смене «{{ formatTeamLabel(createForm.team).toLowerCase() }}».
              </p>
            </UFormField>
            <UFormField label="Ссылки на фото (каждая с новой строки или через запятую)">
              <UTextarea v-model="createForm.photos" class="w-full" rows="3" placeholder="https://...jpg" />
            </UFormField>
            <UFormField label="Заметки">
              <UTextarea v-model="createForm.notes" class="w-full" rows="3" placeholder="Что обрабатывали, препараты" />
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
