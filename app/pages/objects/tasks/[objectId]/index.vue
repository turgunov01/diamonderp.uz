<script setup lang="ts">
import type { ObjectTask, ObjectTaskCard, ObjectTaskItem, ObjectTaskOverview } from '~/types/object-tasks'
import { formatDate, formatDateTime, getTaskStatusColor, getTaskStatusLabel, isTaskOverdue } from '~/utils/object-task-helpers'

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
    buildingId: computed(() => activeBuilding.value?.id),
    view: 'grouped'
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

const historyEmployeeId = ref<number | null>(null)
const historyEmployeeOptions = computed(() => {
  const employees = object.value?.employees || []
  return employees.map((employee) => ({
    label: `${employee.name}${employee.username ? ` · @${employee.username}` : ''}`,
    value: employee.id
  }))
})

watch(historyEmployeeId, (value) => {
  if (typeof value === 'number' && value > 0) {
    navigateTo(`/objects/tasks/${objectId.value}/${value}`)
    historyEmployeeId.value = null
  }
})

const boardColumns = computed(() => {
  const tasks = object.value?.tasks || []

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

function getItemPhotos(item: Pick<ObjectTaskItem, 'proofPhotoUrls' | 'proofPhotoUrl'>) {
  if (Array.isArray(item.proofPhotoUrls) && item.proofPhotoUrls.length) {
    return item.proofPhotoUrls.filter(Boolean)
  }

  if (typeof item.proofPhotoUrl === 'string' && item.proofPhotoUrl.trim()) {
    return [item.proofPhotoUrl.trim()]
  }

  return []
}
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
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                Доска задач
              </h3>
              <p class="text-xs text-muted">
                Как в Jira: три колонки по прогрессу выполнения.
              </p>
            </div>
            <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
              <USelect
                v-if="historyEmployeeOptions.length"
                v-model="historyEmployeeId"
                :items="historyEmployeeOptions"
                placeholder="История сотрудника"
                class="w-full sm:w-72"
              />
              <UBadge :label="`Всего: ${object.totalTasks}`" color="neutral" variant="subtle" />
            </div>
          </div>

          <div class="flex gap-4 overflow-x-auto pb-2">
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
                          v-if="isTaskOverdue(task)"
                          label="Просрочено"
                          color="error"
                          variant="soft"
                        />
                      </div>

                      <p class="text-xs text-muted">
                        <NuxtLink
                          v-if="typeof task.employeeId === 'number' && task.employeeId > 0"
                          :to="`/objects/tasks/${object.id}/${task.employeeId}`"
                          class="hover:underline"
                          @click.stop
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

                      <div class="mt-2 flex items-center justify-between text-xs text-muted">
                        <span>Срок: {{ formatDate(task.dueDate) }}</span>
                        <span>{{ task.completedItems }}/{{ task.totalItems }}</span>
                      </div>
                      <div class="h-2 overflow-hidden rounded-full bg-default/70">
                        <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${task.progressPercent}%` }" />
                      </div>

                      <p class="mt-2 text-xs text-muted">
                        Обновлено: {{ formatDateTime(task.updatedAt || task.createdAt) }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <UModal
        v-model:open="taskModalOpen"
        :title="selectedTask ? selectedTask.title : 'Задача'"
        :description="selectedTask ? `${selectedTask.employeeName}${selectedTask.employeeUsername ? ' · @' + selectedTask.employeeUsername : ''}` : undefined"
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

