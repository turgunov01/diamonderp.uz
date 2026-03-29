<script setup lang="ts">
definePageMeta({
  title: 'Объекты / Задачи',
  ssr: true
})

type TaskStatus = 'open' | 'in_progress' | 'completed'

type ObjectTaskEmployee = {
  id: number
  name: string
  username: string
  phone?: string
  workShift?: 'day' | 'night'
  status: string
}

type ObjectTaskItem = {
  id: number
  taskListId: number
  title: string
  isDone: boolean
  completedAt: string | null
  sortOrder: number
}

type ObjectTask = {
  id: number
  objectId: number | null
  objectName: string
  employeeId: number | null
  employeeName: string
  employeeUsername?: string
  employeePhone?: string
  employeeStatus?: string
  title: string
  note: string | null
  dueDate: string | null
  status: TaskStatus
  createdById: number | null
  createdByName: string | null
  createdByRole: string | null
  createdAt: string | null
  updatedAt: string | null
  totalItems: number
  completedItems: number
  progressPercent: number
  items: ObjectTaskItem[]
}

type ObjectTaskCard = {
  id: number
  buildingId?: number | null
  name: string
  description?: string
  address?: string
  code?: string
  isActive: boolean
  employeeCount: number
  totalTasks: number
  openTasks: number
  inProgressTasks: number
  completedTasks: number
  employees: ObjectTaskEmployee[]
  tasks: ObjectTask[]
}

type ObjectTaskOverview = {
  buildingId: number | null
  objects: ObjectTaskCard[]
}

const toast = useToast()
const activeBuilding = useState<{ id: number, name: string } | null>('active-building')
const { canManageObjectTasks } = useRoleAccess()

const search = ref('')
const createModalOpen = ref(false)
const creating = ref(false)
const selectedObject = ref<ObjectTaskCard | null>(null)
const form = reactive({
  objectId: null as number | null,
  employeeId: undefined as number | undefined,
  title: '',
  note: '',
  dueDate: '',
  items: [''] as string[]
})

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
    title: 'Не удалось загрузить задачи по объектам',
    description: fetchError.data?.statusMessage || fetchError.message,
    color: 'error'
  })
}, { immediate: true })

watch(createModalOpen, (isOpen) => {
  if (isOpen) {
    return
  }

  selectedObject.value = null
  form.objectId = null
  form.employeeId = undefined
  form.title = ''
  form.note = ''
  form.dueDate = ''
  form.items = ['']
})

const objects = computed(() => data.value?.objects || [])

const filteredObjects = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) {
    return objects.value
  }

  return objects.value.filter((object) => {
    const haystack = [
      object.name,
      object.address,
      object.description,
      object.code,
      ...object.employees.map(employee => `${employee.name} ${employee.username} ${employee.phone || ''}`),
      ...object.tasks.map(task => `${task.title} ${task.employeeName} ${task.note || ''}`)
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(term)
  })
})

const totalEmployees = computed(() => {
  const employeeIds = new Set<number>()

  for (const object of filteredObjects.value) {
    for (const employee of object.employees) {
      employeeIds.add(employee.id)
    }
  }

  return employeeIds.size
})

const totalOpenTasks = computed(() => filteredObjects.value.reduce((sum, object) => sum + object.openTasks + object.inProgressTasks, 0))
const employeeOptions = computed(() => {
  return (selectedObject.value?.employees || []).map(employee => ({
    label: `${employee.name} · @${employee.username}`,
    value: employee.id
  }))
})

function formatDate(value?: string | null) {
  if (!value) {
    return 'Без срока'
  }

  return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '—'
  }

  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getTaskStatusLabel(status: TaskStatus) {
  if (status === 'completed') {
    return 'Завершен'
  }

  if (status === 'in_progress') {
    return 'В работе'
  }

  return 'Новый'
}

function getTaskStatusColor(status: TaskStatus) {
  if (status === 'completed') {
    return 'success'
  }

  if (status === 'in_progress') {
    return 'primary'
  }

  return 'warning'
}

function isTaskOverdue(task: ObjectTask) {
  if (!task.dueDate || task.status === 'completed') {
    return false
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(`${task.dueDate}T00:00:00`).getTime() < today.getTime()
}

function openCreateModal(object: ObjectTaskCard) {
  if (!canManageObjectTasks.value) {
    return
  }

  if (!object.employees.length) {
    toast.add({
      title: 'Нет доступных сотрудников',
      description: 'У выбранного объекта нет активных сотрудников с мобильным доступом.',
      color: 'warning'
    })
    return
  }

  selectedObject.value = object
  form.objectId = object.id
  form.employeeId = object.employees[0]?.id
  form.title = `${object.name}: новый чек-лист`
  form.note = ''
  form.dueDate = ''
  form.items = ['']
  createModalOpen.value = true
}

function addTodoItem() {
  form.items.push('')
}

function removeTodoItem(index: number) {
  if (form.items.length === 1) {
    form.items[0] = ''
    return
  }

  form.items.splice(index, 1)
}

async function submitTaskList() {
  if (!canManageObjectTasks.value || creating.value || !selectedObject.value) {
    return
  }

  const items = form.items.map(item => item.trim()).filter(Boolean)
  if (!form.employeeId) {
    toast.add({
      title: 'Выберите сотрудника',
      color: 'warning'
    })
    return
  }

  if (!form.title.trim()) {
    toast.add({
      title: 'Название списка обязательно',
      color: 'warning'
    })
    return
  }

  if (!items.length) {
    toast.add({
      title: 'Добавьте хотя бы один пункт',
      color: 'warning'
    })
    return
  }

  creating.value = true

  try {
    const created = await $fetch<ObjectTask>('/api/object-tasks', {
      method: 'POST',
      body: {
        objectId: form.objectId,
        employeeId: form.employeeId,
        title: form.title,
        note: form.note || null,
        dueDate: form.dueDate || null,
        items
      }
    })

    toast.add({
      title: 'To-do лист создан',
      description: `${created.employeeName} · ${created.title}`,
      color: 'success'
    })

    createModalOpen.value = false
    await refresh()
  } catch (err: unknown) {
    const fetchError = err as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: 'Не удалось создать список задач',
      description: fetchError.data?.statusMessage || fetchError.message,
      color: 'error'
    })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="object-tasks">
    <template #header>
      <UDashboardNavbar title="Объекты / Задачи">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UBadge
              v-if="!canManageObjectTasks"
              label="Только чтение"
              color="neutral"
              variant="subtle"
            />
            <UButton
              icon="i-lucide-refresh-ccw"
              color="neutral"
              variant="outline"
              :loading="status === 'pending'"
              @click="() => refresh()"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-5">
        <div class="grid gap-3 md:grid-cols-3">
          <UPageCard icon="i-lucide-building-2" title="Объекты" variant="subtle">
            <p class="text-2xl font-semibold text-highlighted">{{ filteredObjects.length }}</p>
            <p class="text-xs text-muted">{{ activeBuilding?.name ? `Здание: ${activeBuilding.name}` : 'Все здания' }}</p>
          </UPageCard>
          <UPageCard icon="i-lucide-list-todo" title="Активные задачи" variant="subtle">
            <p class="text-2xl font-semibold text-highlighted">{{ totalOpenTasks }}</p>
            <p class="text-xs text-muted">Новые и в работе</p>
          </UPageCard>
          <UPageCard icon="i-lucide-smartphone" title="Сотрудники" variant="subtle">
            <p class="text-2xl font-semibold text-highlighted">{{ totalEmployees }}</p>
            <p class="text-xs text-muted">С мобильным доступом по объектам</p>
          </UPageCard>
        </div>

        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">Карточки объектов</h2>
            <p class="text-sm text-muted">Назначайте сотрудникам чек-листы, которые будут доступны в мобильном приложении.</p>
          </div>

          <UInput
            v-model="search"
            class="w-full lg:max-w-sm"
            icon="i-lucide-search"
            placeholder="Поиск по объекту, сотруднику или задаче"
          />
        </div>

        <div v-if="status === 'pending' && !filteredObjects.length" class="rounded-2xl border border-default bg-elevated/30 p-6 text-sm text-muted">
          Загрузка карточек объектов...
        </div>

        <div v-else-if="!filteredObjects.length" class="rounded-2xl border border-dashed border-default bg-elevated/20 p-8 text-center">
          <p class="text-sm text-muted">По текущему фильтру объекты и задачи не найдены.</p>
        </div>

        <div v-else class="grid gap-4 xl:grid-cols-2">
          <section
            v-for="object in filteredObjects"
            :key="object.id"
            class="rounded-2xl border border-default bg-gradient-to-br from-elevated via-elevated/95 to-primary/5 shadow-sm"
          >
            <div class="flex flex-col gap-4 p-5">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-lg font-semibold text-highlighted">{{ object.name }}</h3>
                    <UBadge
                      :label="object.isActive ? 'Активен' : 'Неактивен'"
                      :color="object.isActive ? 'success' : 'neutral'"
                      variant="subtle"
                    />
                  </div>
                  <p class="text-sm text-muted">{{ object.address || object.description || 'Адрес не указан' }}</p>
                  <p class="text-xs text-muted">{{ object.code ? `Код: ${object.code}` : 'Без кода' }}</p>
                </div>

                <UButton
                  v-if="canManageObjectTasks"
                  icon="i-lucide-plus"
                  label="Создать to-do"
                  @click="openCreateModal(object)"
                />
              </div>

              <div class="grid gap-3 sm:grid-cols-3">
                <div class="rounded-xl border border-default/70 bg-default/40 p-3">
                  <p class="text-xs uppercase tracking-wide text-muted">Сотрудники</p>
                  <p class="mt-1 text-xl font-semibold text-highlighted">{{ object.employeeCount }}</p>
                </div>
                <div class="rounded-xl border border-default/70 bg-default/40 p-3">
                  <p class="text-xs uppercase tracking-wide text-muted">В работе</p>
                  <p class="mt-1 text-xl font-semibold text-highlighted">{{ object.openTasks + object.inProgressTasks }}</p>
                </div>
                <div class="rounded-xl border border-default/70 bg-default/40 p-3">
                  <p class="text-xs uppercase tracking-wide text-muted">Закрыто</p>
                  <p class="mt-1 text-xl font-semibold text-highlighted">{{ object.completedTasks }}</p>
                </div>
              </div>

              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <p class="text-xs font-medium uppercase tracking-wide text-muted">Мобильная команда</p>
                  <span class="text-xs text-muted">{{ object.employees.length }} чел.</span>
                </div>
                <div v-if="object.employees.length" class="flex flex-wrap gap-2">
                  <UBadge
                    v-for="employee in object.employees.slice(0, 5)"
                    :key="employee.id"
                    :label="`${employee.name} · @${employee.username}`"
                    color="neutral"
                    variant="subtle"
                  />
                  <UBadge
                    v-if="object.employees.length > 5"
                    :label="`+${object.employees.length - 5}`"
                    color="primary"
                    variant="soft"
                  />
                </div>
                <p v-else class="text-sm text-muted">Нет сотрудников с мобильным доступом для этого объекта.</p>
              </div>

              <div class="space-y-3 border-t border-default/70 pt-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-semibold text-highlighted">Последние списки задач</p>
                    <p class="text-xs text-muted">Статус, срок и прогресс по чек-листу</p>
                  </div>
                  <UBadge :label="object.totalTasks" color="neutral" variant="subtle" />
                </div>

                <div v-if="object.tasks.length" class="space-y-3">
                  <div
                    v-for="task in object.tasks.slice(0, 3)"
                    :key="task.id"
                    class="rounded-xl border border-default/70 bg-default/35 p-4"
                  >
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div class="space-y-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <p class="font-medium text-highlighted">{{ task.title }}</p>
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
                        <p class="text-sm text-muted">{{ task.employeeName }}<span v-if="task.employeeUsername"> · @{{ task.employeeUsername }}</span></p>
                        <p v-if="task.note" class="text-sm text-toned">{{ task.note }}</p>
                      </div>

                      <div class="text-left text-xs text-muted sm:text-right">
                        <p>Срок: {{ formatDate(task.dueDate) }}</p>
                        <p>Обновлено: {{ formatDateTime(task.updatedAt || task.createdAt) }}</p>
                      </div>
                    </div>

                    <div class="mt-3 space-y-2">
                      <div class="flex items-center justify-between text-xs text-muted">
                        <span>Прогресс</span>
                        <span>{{ task.completedItems }}/{{ task.totalItems }}</span>
                      </div>
                      <div class="h-2 overflow-hidden rounded-full bg-default/70">
                        <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${task.progressPercent}%` }" />
                      </div>
                      <ul class="space-y-1 pt-1 text-sm text-muted">
                        <li v-for="item in task.items.slice(0, 3)" :key="item.id" class="flex items-center gap-2">
                          <span :class="item.isDone ? 'text-success' : 'text-muted'">{{ item.isDone ? '[x]' : '[ ]' }}</span>
                          <span :class="item.isDone ? 'line-through text-muted' : 'text-toned'">{{ item.title }}</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <p v-if="object.tasks.length > 3" class="text-xs text-muted">
                    Еще {{ object.tasks.length - 3 }} списк{{ object.tasks.length - 3 === 1 ? 'а' : 'ов' }} задач на объекте.
                  </p>
                </div>

                <div v-else class="rounded-xl border border-dashed border-default/70 bg-default/20 p-4 text-sm text-muted">
                  Для этого объекта еще не назначены to-do листы.
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <UModal
        v-model:open="createModalOpen"
        :title="selectedObject ? `Новый to-do для ${selectedObject.name}` : 'Новый to-do'"
        description="Список будет доступен сотруднику в мобильном приложении и обновляться по мере выполнения пунктов."
      >
        <template #body>
          <div class="space-y-4">
            <UFormField label="Объект">
              <UInput :model-value="selectedObject?.name || ''" class="w-full" disabled />
            </UFormField>

            <UFormField label="Сотрудник" required>
              <USelect
                v-model="form.employeeId"
                :items="employeeOptions"
                class="w-full"
                placeholder="Выберите сотрудника"
              />
            </UFormField>

            <UFormField label="Название списка" required>
              <UInput
                v-model="form.title"
                class="w-full"
                placeholder="Например: Открытие смены"
              />
            </UFormField>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Срок">
                <UInput v-model="form.dueDate" class="w-full" type="date" />
              </UFormField>
              <UFormField label="Комментарий">
                <UInput
                  v-model="form.note"
                  class="w-full"
                  placeholder="Короткая инструкция"
                />
              </UFormField>
            </div>

            <div class="space-y-3 rounded-xl border border-default/70 bg-default/20 p-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-medium text-highlighted">Чек-лист</p>
                  <p class="text-xs text-muted">Каждый пункт сотрудник сможет отмечать в мобильном приложении.</p>
                </div>
                <UButton
                  icon="i-lucide-plus"
                  label="Добавить пункт"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  @click="addTodoItem"
                />
              </div>

              <div class="space-y-2">
                <div
                  v-for="(item, index) in form.items"
                  :key="`todo-${index}`"
                  class="flex items-center gap-2"
                >
                  <UInput
                    v-model="form.items[index]"
                    class="flex-1"
                    :placeholder="`Пункт ${index + 1}`"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    @click="removeTodoItem(index)"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>

        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton
              label="Отмена"
              color="neutral"
              variant="subtle"
              :disabled="creating"
              @click="createModalOpen = false"
            />
            <UButton
              label="Создать список"
              :loading="creating"
              @click="submitTaskList"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

