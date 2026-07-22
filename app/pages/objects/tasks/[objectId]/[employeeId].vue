<script setup lang="ts">
import type { ObjectTask, ObjectTaskCard, ObjectTaskEmployee, ObjectTaskItem, ObjectTaskOverview } from '~/types/object-tasks'
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
const rawEmployeeId = computed(() => route.params.employeeId)
const employeeId = computed(() => Number(rawEmployeeId.value))

if (!rawObjectId.value || !Number.isInteger(objectId.value) || objectId.value <= 0) {
  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid object id.'
  })
}

if (!rawEmployeeId.value || !Number.isInteger(employeeId.value) || employeeId.value <= 0) {
  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid employee id.'
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
    buildingId: computed(() => activeBuilding.value?.id),
    view: 'raw'
  },
  watch: [activeBuilding]
})

watch(error, (value) => {
  if (!value) {
    return
  }

  const fetchError = value as { data?: { message?: string, statusMessage?: string }, message?: string }
  toast.add({
    title: 'Не удалось загрузить задачи сотрудника',
    description: fetchError.data?.message || fetchError.message,
    color: 'error'
  })
}, { immediate: true })

const objects = computed(() => data.value?.objects || [])
const object = computed<ObjectTaskCard | null>(() => objects.value.find(item => item.id === objectId.value) || null)

const employee = computed<ObjectTaskEmployee | null>(() => {
  const target = object.value
  if (!target) {
    return null
  }

  return target.employees?.find(item => item.id === employeeId.value) || null
})

const snapshot = computed(() => {
  if (!object.value || !employee.value) {
    return {
      tasks: [],
      taskCount: 0,
      hasOpenTasks: false,
      recentCompletion: null as string | null
    }
  }

  return getEmployeeTaskSnapshot(employee.value.id, object.value.tasks || [])
})

const openTasksCount = computed(() => snapshot.value.tasks.filter(task => task.status === 'open').length)
const inProgressTasksCount = computed(() => snapshot.value.tasks.filter(task => task.status === 'in_progress').length)
const completedTasksCount = computed(() => snapshot.value.tasks.filter(task => task.status === 'completed').length)

const boardColumns = computed(() => {
  const tasks = snapshot.value.tasks || []

  return [
    {
      key: 'open',
      title: 'В процессе',
      color: 'warning',
      tasks: tasks.filter(task => task.status === 'open')
    },
    {
      key: 'in_progress',
      title: 'Частично завершено',
      color: 'primary',
      tasks: tasks.filter(task => task.status === 'in_progress')
    },
    {
      key: 'completed',
      title: 'Завершено',
      color: 'success',
      tasks: tasks.filter(task => task.status === 'completed')
    }
  ] as const
})

const taskModalOpen = ref(false)
const selectedTask = ref<ObjectTask | null>(null)

const modalItems = computed(() => {
  const task = selectedTask.value
  if (!task) {
    return [] as ObjectTaskItem[]
  }

  const items = task.items || []
  const completed = items.filter(item => item.isDone)
  return completed.length ? completed : items
})

const modalShowsOnlyCompleted = computed(() => {
  const task = selectedTask.value
  if (!task) {
    return false
  }

  return (task.items || []).some(item => item.isDone)
})

function openTaskModal(task: ObjectTask) {
  selectedTask.value = task
  taskModalOpen.value = true
}

watch(taskModalOpen, (isOpen) => {
  if (isOpen) {
    return
  }

  selectedTask.value = null
})

function getItemPhotos(item: { proofPhotoUrls?: string[], proofPhotoUrl?: string | null }) {
  if (Array.isArray(item.proofPhotoUrls) && item.proofPhotoUrls.length) {
    return item.proofPhotoUrls.filter(Boolean)
  }

  if (typeof item.proofPhotoUrl === 'string' && item.proofPhotoUrl.trim()) {
    return [item.proofPhotoUrl.trim()]
  }

  return []
}

function getReviewPhotos(task: { reviewPhotoUrls?: string[], reviewPhotoUrl?: string | null }) {
  if (Array.isArray(task.reviewPhotoUrls) && task.reviewPhotoUrls.length) {
    return task.reviewPhotoUrls.filter(Boolean)
  }

  if (typeof task.reviewPhotoUrl === 'string' && task.reviewPhotoUrl.trim()) {
    return [task.reviewPhotoUrl.trim()]
  }

  return []
}

function reviewStatusLabel(status?: string | null) {
  if (status === 'approved') return 'Проверено'
  if (status === 'rejected') return 'Отклонено'
  if (status === 'pending') return 'Ожидает проверки'
  return 'Без проверки'
}

function reviewStatusColor(status?: string | null) {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'error'
  if (status === 'pending') return 'warning'
  return 'neutral'
}

// Show a verification badge only once the employee has finished the task.
function hasReviewState(task: { reviewStatus?: string | null }) {
  return task.reviewStatus === 'pending' || task.reviewStatus === 'approved' || task.reviewStatus === 'rejected'
}

function getTaskPhotos(task: { items?: { isDone?: boolean, proofPhotoUrls?: string[], proofPhotoUrl?: string | null }[] }) {
  const photos: string[] = []
  const items = Array.isArray(task.items) ? task.items : []

  for (const item of items) {
    if (!item?.isDone) {
      continue
    }

    for (const photo of getItemPhotos(item)) {
      photos.push(photo)
      if (photos.length >= 6) {
        return photos
      }
    }
  }

  return photos
}
</script>

<template>
  <UDashboardPanel id="object-tasks-employee">
    <template #header>
      <UDashboardNavbar :title="employee ? `${employee.name}` : 'Сотрудник'">
        <template #leading>
          <div class="flex items-center gap-2">
            <UButton
              icon="i-lucide-arrow-left"
              color="neutral"
              variant="ghost"
              :to="`/objects/tasks/${objectId}`"
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
      <div v-if="status === 'pending' && (!object || !employee)" class="rounded-2xl border border-default bg-elevated/30 p-6 text-sm text-muted">
        Загрузка данных...
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

      <div v-else-if="!employee" class="rounded-2xl border border-dashed border-default bg-elevated/20 p-8 text-center">
        <p class="text-sm text-muted">
          Сотрудник не найден в этом объекте.
        </p>
        <div class="mt-4">
          <UButton
            :to="`/objects/tasks/${object.id}`"
            label="К объекту"
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
                  {{ employee.name }}
                </h2>
                <UBadge :label="`@${employee.username}`" color="neutral" variant="subtle" />
                <UBadge :label="employee.status || '—'" color="neutral" variant="subtle" />
                <UBadge :label="employee.phone || 'Телефон не указан'" color="neutral" variant="subtle" />
                <UBadge :label="`Всего: ${snapshot.taskCount}`" color="neutral" variant="subtle" />
                <UBadge v-if="openTasksCount" :label="`В процессе: ${openTasksCount}`" color="warning" variant="soft" />
                <UBadge v-if="inProgressTasksCount" :label="`Частично: ${inProgressTasksCount}`" color="primary" variant="soft" />
                <UBadge v-if="completedTasksCount" :label="`Завершено: ${completedTasksCount}`" color="success" variant="soft" />
              </div>
              <p class="text-sm text-muted">
                Объект: <NuxtLink :to="`/objects/tasks/${object.id}`" class="hover:underline">{{ object.name }}</NuxtLink>
              </p>
            </div>

            <div class="text-left text-xs text-muted sm:text-right">
              <p v-if="snapshot.recentCompletion">
                Последняя активность: {{ formatDateTime(snapshot.recentCompletion) }}
              </p>
              <p v-else>
                Активность не найдена
              </p>
            </div>
          </div>
        </div>

        <section class="space-y-3">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                Доска задач сотрудника
              </h3>
              <p class="text-xs text-muted">
                Как в Jira: три колонки по прогрессу выполнения (фото в выполненных пунктах).
              </p>
            </div>
            <UBadge :label="`Всего: ${snapshot.taskCount}`" color="neutral" variant="subtle" />
          </div>

          <div v-if="snapshot.tasks.length" class="flex gap-4 overflow-x-auto pb-2">
            <div
              v-for="column in boardColumns"
              :key="column.key"
              class="min-w-[320px] flex-1"
            >
              <div class="rounded-2xl border border-default bg-elevated/30">
                <div class="flex items-center justify-between border-b border-default/70 p-4">
                  <div class="flex items-center gap-2">
                    <h4 class="text-sm font-semibold text-highlighted">
                      {{ column.title }}
                    </h4>
                    <UBadge :label="column.tasks.length" :color="column.color" variant="subtle" />
                  </div>
                </div>

                <div class="space-y-2 p-3">
                  <div
                    v-if="!column.tasks.length"
                    class="rounded-xl border border-dashed border-default/70 bg-default/10 p-4 text-sm text-muted"
                  >
                    Нет задач
                  </div>

                  <div
                    v-for="task in column.tasks"
                    :key="task.id"
                    class="cursor-pointer rounded-xl border border-default/70 bg-default/25 p-4 transition-colors hover:bg-default/35"
                    role="button"
                    tabindex="0"
                    @click="openTaskModal(task)"
                    @keydown.enter.prevent="openTaskModal(task)"
                  >
                    <div class="space-y-1">
                      <div class="flex flex-wrap items-start gap-2">
                        <p class="font-medium leading-snug text-highlighted">
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
                        <UBadge
                          v-if="hasReviewState(task)"
                          :label="reviewStatusLabel(task.reviewStatus)"
                          :color="reviewStatusColor(task.reviewStatus)"
                          variant="soft"
                          icon="i-lucide-shield-check"
                        />
                      </div>

                      <p class="text-xs text-muted">
                        Срок: {{ formatDate(task.dueDate) }} · Обновлено: {{ formatDateTime(task.updatedAt || task.createdAt) }}
                      </p>

                      <p v-if="task.note" class="text-sm text-toned">
                        {{ task.note }}
                      </p>

                      <div class="mt-2 flex items-center justify-between text-xs text-muted">
                        <span>Прогресс</span>
                        <span>{{ task.completedItems }}/{{ task.totalItems }}</span>
                      </div>
                      <div class="h-2 overflow-hidden rounded-full bg-default/70">
                        <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${task.progressPercent}%` }" />
                      </div>

                      <div v-if="getTaskPhotos(task).length" class="mt-3 flex flex-wrap gap-2">
                        <a
                          v-for="(photo, idx) in getTaskPhotos(task)"
                          :key="`${task.id}-${idx}`"
                          :href="photo"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="block h-20 w-20 overflow-hidden rounded-md border border-default"
                          @click.stop
                        >
                          <img :src="photo" alt="Доказательство" class="h-full w-full object-cover">
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-muted">
            У сотрудника пока нет задач в этом объекте.
          </p>
        </section>
      </div>

      <UModal
        v-model:open="taskModalOpen"
        :title="selectedTask ? selectedTask.title : 'Задача'"
        :description="selectedTask ? `${object?.name || 'Объект'} · ${employee?.name || ''}` : undefined"
        :ui="{ content: 'sm:max-w-3xl' }"
      >
        <template #body>
          <div v-if="selectedTask" class="space-y-4">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :label="getTaskStatusLabel(selectedTask.status)"
                :color="getTaskStatusColor(selectedTask.status)"
                variant="subtle"
              />
              <UBadge
                v-if="isTaskOverdue(selectedTask)"
                label="Просрочено"
                color="error"
                variant="soft"
              />
              <UBadge :label="`Срок: ${formatDate(selectedTask.dueDate)}`" color="neutral" variant="outline" />
              <UBadge
                :label="`Обновлено: ${formatDateTime(selectedTask.updatedAt || selectedTask.createdAt)}`"
                color="neutral"
                variant="subtle"
              />
            </div>

            <p v-if="selectedTask.note" class="text-sm text-toned">
              {{ selectedTask.note }}
            </p>

            <div
              v-if="hasReviewState(selectedTask)"
              class="rounded-lg border border-default/70 bg-elevated/40 p-3 space-y-2"
            >
              <div class="flex flex-wrap items-center gap-2">
                <UIcon name="i-lucide-shield-check" class="size-4 text-muted" />
                <p class="text-sm font-semibold text-highlighted">
                  Проверка менеджера
                </p>
                <UBadge
                  :label="reviewStatusLabel(selectedTask.reviewStatus)"
                  :color="reviewStatusColor(selectedTask.reviewStatus)"
                  variant="soft"
                />
                <UBadge
                  v-if="selectedTask.reviewedAt"
                  :label="formatDateTime(selectedTask.reviewedAt)"
                  color="neutral"
                  variant="subtle"
                />
              </div>

              <p v-if="selectedTask.reviewComment" class="text-sm text-toned">
                Комментарий: {{ selectedTask.reviewComment }}
              </p>

              <div v-if="getReviewPhotos(selectedTask).length" class="flex flex-wrap gap-2">
                <a
                  v-for="(photo, idx) in getReviewPhotos(selectedTask)"
                  :key="`review-${selectedTask.id}-${idx}`"
                  :href="photo"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block h-20 w-20 overflow-hidden rounded-md border border-default"
                  @click.stop
                >
                  <img :src="photo" alt="Фото проверки" class="h-full w-full object-cover">
                </a>
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between text-xs text-muted">
                <span>Прогресс</span>
                <span>{{ selectedTask.completedItems }}/{{ selectedTask.totalItems }}</span>
              </div>
              <div class="mt-1 h-2 overflow-hidden rounded-full bg-default/70">
                <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${selectedTask.progressPercent}%` }" />
              </div>
            </div>

            <div class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <p class="text-sm font-semibold text-highlighted">
                  {{ modalShowsOnlyCompleted ? 'Выполненные пункты' : 'Пункты задачи' }}
                </p>
                <UBadge :label="modalItems.length" color="neutral" variant="subtle" />
              </div>

              <div v-if="modalShowsOnlyCompleted" class="text-xs text-muted">
                Показаны только выполненные пункты (с фотофиксациями, если они есть).
              </div>

              <div v-for="item in modalItems" :key="item.id" class="rounded-lg border border-default/60 bg-default/15 p-3">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p :class="item.isDone ? 'text-success line-through' : 'text-toned'">
                      {{ item.title }}
                    </p>
                    <p v-if="item.completedAt" class="mt-1 text-xs text-muted">
                      {{ formatDateTime(item.completedAt) }}
                    </p>
                  </div>
                  <UBadge
                    :label="item.isDone ? 'Завершено' : 'В процессе'"
                    :color="item.isDone ? 'success' : 'warning'"
                    variant="soft"
                  />
                </div>

                <div v-if="getItemPhotos(item).length" class="mt-2 flex flex-wrap gap-2">
                  <a
                    v-for="(photo, idx) in getItemPhotos(item)"
                    :key="`${item.id}-${idx}`"
                    :href="photo"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block h-20 w-20 overflow-hidden rounded-md border border-default"
                    @click.stop
                  >
                    <img :src="photo" alt="Доказательство" class="h-full w-full object-cover">
                  </a>
                </div>
              </div>
            </div>
          </div>
        </template>

        <template #footer>
          <div class="flex w-full justify-end">
            <UButton
              label="Закрыть"
              color="neutral"
              variant="subtle"
              @click="taskModalOpen = false"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
