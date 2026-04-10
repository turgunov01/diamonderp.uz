<script setup lang="ts">
import type { ObjectTaskCard, ObjectTaskEmployee, ObjectTaskOverview } from '~/types/object-tasks'
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
    title: 'Не удалось загрузить задачи сотрудника',
    description: fetchError.data?.statusMessage || fetchError.message,
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

function getItemPhotos(item: { proofPhotoUrls?: string[], proofPhotoUrl?: string | null }) {
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
                <UBadge :label="`Задач: ${snapshot.taskCount}`" color="primary" variant="outline" />
                <UBadge
                  v-if="snapshot.hasOpenTasks"
                  label="Есть открытые"
                  color="warning"
                  variant="soft"
                />
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
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                Задачи сотрудника
              </h3>
              <p class="text-xs text-muted">
                Все чек-листы и статусы выполнения.
              </p>
            </div>
            <UBadge :label="snapshot.taskCount" color="neutral" variant="subtle" />
          </div>

          <div v-if="snapshot.tasks.length" class="space-y-3">
            <div
              v-for="task in snapshot.tasks"
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
                  <p class="text-xs text-muted">
                    Срок: {{ formatDate(task.dueDate) }} · Обновлено: {{ formatDateTime(task.updatedAt || task.createdAt) }}
                  </p>
                  <p v-if="task.note" class="text-sm text-toned">
                    {{ task.note }}
                  </p>
                </div>
                <div class="text-xs text-muted text-right">
                  <p>Прогресс: {{ task.completedItems }}/{{ task.totalItems }}</p>
                  <div class="mt-1 h-2 w-36 overflow-hidden rounded-full bg-default/70">
                    <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${task.progressPercent}%` }" />
                  </div>
                </div>
              </div>

              <div v-if="task.items?.length" class="mt-3 space-y-2">
                <div
                  v-for="item in task.items"
                  :key="item.id"
                  class="rounded-lg border border-default/60 bg-default/20 p-3 text-sm text-muted"
                >
                  <div class="flex items-center justify-between gap-3">
                    <span :class="item.isDone ? 'text-success line-through' : 'text-toned'">
                      {{ item.title }}
                    </span>
                    <span :class="item.isDone ? 'text-success' : 'text-muted'">{{ item.isDone ? 'Выполнено' : 'Открыто' }}</span>
                  </div>
                  <div v-if="getItemPhotos(item).length" class="mt-2 flex flex-wrap gap-2">
                    <a
                      v-for="(photo, idx) in getItemPhotos(item)"
                      :key="`${item.id}-${idx}`"
                      :href="photo"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="block h-20 w-20 overflow-hidden rounded-md border border-default"
                    >
                      <img :src="photo" alt="Доказательство" class="h-full w-full object-cover">
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-muted">
            У сотрудника пока нет назначенных задач в этом объекте.
          </p>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
