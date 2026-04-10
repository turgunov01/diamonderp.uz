<script setup lang="ts">
import type { ObjectTaskCard, ObjectTaskOverview } from '~/types/object-tasks'
import { formatDate, formatDateTime, getEmployeeTaskSnapshot, getTaskStatusColor, getTaskStatusLabel, isTaskOverdue } from '~/utils/object-task-helpers'

definePageMeta({
  title: 'Объекты / Задачи',
  ssr: true
})

const toast = useToast()
const route = useRoute()
const activeBuilding = useState<{ id: number, name: string } | null>('active-building')

const rawObjectId = computed(() => route.params.objectId)
const objectId = computed(() => Number(rawObjectId.value))

if (!rawObjectId.value || !Number.isInteger(objectId.value) || objectId.value <= 0) {
  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid object id.'
  })
}

const {
  data,
  error,
  status,
  refresh
} = await useAutoRefreshFetch<ObjectTaskOverview>('/api/object-tasks', {
  default: () => ({ buildingId: null, objects: [] }),
  query: {
    buildingId: computed(() => activeBuilding.value?.id)
  },
  watch: [activeBuilding]
})

watch(error, (value) => {
  if (!value) {
    return
  }

  const fetchError = value as { data?: { statusMessage?: string }, message?: string }
  toast.add({
    title: 'Не удалось загрузить задачи по объекту',
    description: fetchError.data?.statusMessage || fetchError.message,
    color: 'error'
  })
}, { immediate: true })

const objects = computed(() => data.value?.objects || [])
const object = computed<ObjectTaskCard | null>(() => objects.value.find(item => item.id === objectId.value) || null)

const employeeInfo = computed(() => {
  const target = object.value
  if (!target) {
    return []
  }

  return (target.employees || [])
    .map(employee => ({
      ...employee,
      ...getEmployeeTaskSnapshot(employee.id, target.tasks || [])
    }))
    .sort((a, b) => {
      if (a.hasOpenTasks !== b.hasOpenTasks) return a.hasOpenTasks ? -1 : 1
      if (b.taskCount !== a.taskCount) return b.taskCount - a.taskCount
      const aTs = a.recentCompletion ? new Date(a.recentCompletion).getTime() : 0
      const bTs = b.recentCompletion ? new Date(b.recentCompletion).getTime() : 0
      return bTs - aTs
    })
})

const employeesWithTasks = computed(() => employeeInfo.value.filter(employee => employee.taskCount > 0))
const recentTasks = computed(() => object.value?.tasks?.slice(0, 10) || [])
</script>

<template>
  <UDashboardPanel id="object-tasks-object">
    <template #header>
      <UDashboardNavbar :title="object?.name || 'Объект'">
        <template #leading>
          <div class="flex items-center gap-2">
            <UButton
              icon="i-lucide-arrow-left"
              color="neutral"
              variant="ghost"
              to="/objects/tasks"
              label="Назад"
            />
          </div>
        </template>

        <template #right>
          <UButton
            icon="i-lucide-refresh-ccw"
            color="neutral"
            variant="outline"
            :loading="status === 'pending'"
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="status === 'pending' && !object" class="rounded-2xl border border-default bg-elevated/30 p-6 text-sm text-muted">
        Загрузка объекта...
      </div>

      <div v-else-if="!object" class="rounded-2xl border border-dashed border-default bg-elevated/20 p-8 text-center">
        <p class="text-sm text-muted">
          Объект не найден или недоступен.
        </p>
        <div class="mt-4">
          <UButton
            to="/objects/tasks"
            label="К списку объектов"
            color="neutral"
            variant="outline"
          />
        </div>
      </div>

      <div v-else class="space-y-5">
        <div class="rounded-2xl border border-default bg-elevated/40 p-5 shadow-sm">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-lg font-semibold text-highlighted">
                  {{ object.name }}
                </h2>
                <UBadge
                  :label="object.isActive ? 'Активен' : 'Неактивен'"
                  :color="object.isActive ? 'success' : 'neutral'"
                  variant="subtle"
                />
                <UBadge :label="`Сотрудников: ${object.employeeCount}`" color="neutral" variant="subtle" />
                <UBadge :label="`Задач: ${object.totalTasks}`" color="primary" variant="outline" />
              </div>
              <p class="text-sm text-muted">
                {{ object.address || object.description || 'Адрес не указан' }}
              </p>
              <p class="text-xs text-muted">
                {{ object.code ? `Код: ${object.code}` : 'Без кода' }}
              </p>
            </div>

            <div class="flex items-center gap-1 text-xs text-muted">
              <span>Открыто:</span>
              <UBadge :label="object.openTasks + object.inProgressTasks" color="warning" variant="soft" />
              <span>Закрыто:</span>
              <UBadge :label="object.completedTasks" color="success" variant="soft" />
            </div>
          </div>
        </div>

        <section class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                Сотрудники
              </h3>
              <p class="text-xs text-muted">
                Нажмите на сотрудника, чтобы увидеть его задачи и статусы.
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UBadge :label="`${employeesWithTasks.length} с задачами`" color="primary" variant="subtle" />
              <UBadge :label="`${employeeInfo.length} всего`" color="neutral" variant="subtle" />
            </div>
          </div>

          <div v-if="employeeInfo.length" class="divide-y divide-default/70 rounded-2xl border border-default bg-elevated/30">
            <NuxtLink
              v-for="employee in employeeInfo"
              :key="employee.id"
              :to="`/objects/tasks/${object.id}/${employee.id}`"
              class="flex flex-col gap-2 p-4 transition-colors hover:bg-default/40 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium text-highlighted">{{ employee.name }}</span>
                  <UBadge :label="`@${employee.username}`" color="neutral" variant="subtle" />
                  <UBadge
                    :label="employee.taskCount ? `Задач: ${employee.taskCount}` : 'Без задач'"
                    :color="employee.taskCount ? 'primary' : 'neutral'"
                    variant="soft"
                  />
                  <UBadge
                    v-if="employee.hasOpenTasks"
                    label="Есть открытые"
                    color="warning"
                    variant="outline"
                  />
                </div>
                <p class="text-xs text-muted">{{ employee.phone || 'Телефон не указан' }} · Статус: {{ employee.status || '—' }}</p>
              </div>

              <div class="text-left text-xs text-muted sm:text-right">
                <p v-if="employee.recentCompletion">Последняя активность: {{ formatDateTime(employee.recentCompletion) }}</p>
                <p v-else>Активность не найдена</p>
              </div>
            </NuxtLink>
          </div>
          <p v-else class="text-sm text-muted">
            У объекта нет сотрудников с мобильным доступом.
          </p>
        </section>

        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                Недавние задачи
              </h3>
              <p class="text-xs text-muted">
                Последние обновления по чек-листам.
              </p>
            </div>
            <UBadge :label="object.totalTasks" color="neutral" variant="subtle" />
          </div>

          <div v-if="recentTasks.length" class="space-y-2">
            <div
              v-for="task in recentTasks"
              :key="task.id"
              class="rounded-xl border border-default/70 bg-default/25 p-4"
            >
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="font-medium text-highlighted">
                      {{ task.title }}
                    </p>
                    <UBadge
                      :label="getTaskStatusLabel(task.status)"
                      :color="getTaskStatusColor(task.status)"
                      variant="subtle"
                    />
                    <UBadge
                      v-if="isTaskOverdue(task)"
                      label="Просрочено"
                      color="error"
                      variant="soft"
                    />
                  </div>
                  <p class="text-sm text-muted">
                    <NuxtLink
                      v-if="typeof task.employeeId === 'number' && task.employeeId > 0"
                      :to="`/objects/tasks/${object.id}/${task.employeeId}`"
                      class="hover:underline"
                    >
                      {{ task.employeeName }}<span v-if="task.employeeUsername"> · @{{ task.employeeUsername }}</span>
                    </NuxtLink>
                    <span v-else>
                      {{ task.employeeName }}<span v-if="task.employeeUsername"> · @{{ task.employeeUsername }}</span>
                    </span>
                  </p>
                  <p v-if="task.note" class="text-sm text-toned">
                    {{ task.note }}
                  </p>
                </div>

                <div class="text-left text-xs text-muted sm:text-right">
                  <p>Срок: {{ formatDate(task.dueDate) }}</p>
                  <p>Обновлено: {{ formatDateTime(task.updatedAt || task.createdAt) }}</p>
                </div>
              </div>

              <div class="mt-3 flex items-center justify-between text-xs text-muted">
                <span>Прогресс</span>
                <span>{{ task.completedItems }}/{{ task.totalItems }}</span>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-default/70">
                <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${task.progressPercent}%` }" />
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-muted">
            Для этого объекта еще не назначены to-do листы.
          </p>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
