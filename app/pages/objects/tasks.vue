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
  proofPhotoUrl?: string | null
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
const form = reactive({
  objectId: undefined as number | undefined,
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

  form.objectId = undefined
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
const objectOptions = computed(() => {
  return objects.value.map(object => ({
    label: object.name,
    value: object.id
  }))
})
const selectedObject = computed(() => {
  return objects.value.find(object => object.id === form.objectId) || null
})
const employeeOptions = computed(() => {
  return (selectedObject.value?.employees || []).map(employee => ({
    label: `${employee.name} · @${employee.username}`,
    value: employee.id
  }))
})

watch(() => form.objectId, (objectId) => {
  if (!objectId) {
    form.employeeId = undefined
    return
  }

  const availableEmployeeIds = new Set((selectedObject.value?.employees || []).map(employee => employee.id))
  if (!form.employeeId || !availableEmployeeIds.has(form.employeeId)) {
    form.employeeId = selectedObject.value?.employees[0]?.id
  }
})

const expandedObjectId = ref<number | null>(null)
const employeeModalOpen = ref(false)
const selectedEmployee = ref<{
  employee: ObjectTaskEmployee & { taskCount?: number, hasOpenTasks?: boolean, recentCompletion?: string | null }
  tasks: ObjectTask[]
  objectName: string
} | null>(null)

function toggleObject(id: number) {
  expandedObjectId.value = expandedObjectId.value === id ? null : id
}

function getEmployeeTaskSnapshot(employeeId: number, tasks: ObjectTask[]) {
  const myTasks = tasks.filter(task => task.employeeId === employeeId)
  const recentTimestamps: number[] = []

  myTasks.forEach(task => {
    if (task.updatedAt) recentTimestamps.push(new Date(task.updatedAt).getTime())
    else if (task.createdAt) recentTimestamps.push(new Date(task.createdAt).getTime())

    task.items?.forEach(item => {
      if (item.completedAt) {
        recentTimestamps.push(new Date(item.completedAt).getTime())
      }
    })
  })

  const recentCompletion = recentTimestamps.length
    ? new Date(Math.max(...recentTimestamps)).toISOString()
    : null

  const hasOpenTasks = myTasks.some(task => task.status !== 'completed')

  return {
    tasks: myTasks,
    taskCount: myTasks.length,
    hasOpenTasks,
    recentCompletion
  }
}

const objectList = computed(() => {
  return filteredObjects.value.map(object => {
    const employeeInfo = (object.employees || []).map(employee => {
      const snapshot = getEmployeeTaskSnapshot(employee.id, object.tasks || [])
      return {
        ...employee,
        ...snapshot
      }
    }).sort((a, b) => {
      if (a.hasOpenTasks !== b.hasOpenTasks) return a.hasOpenTasks ? -1 : 1
      if (b.taskCount !== a.taskCount) return b.taskCount - a.taskCount
      const aTs = a.recentCompletion ? new Date(a.recentCompletion).getTime() : 0
      const bTs = b.recentCompletion ? new Date(b.recentCompletion).getTime() : 0
      return bTs - aTs
    })

    return {
      ...object,
      employeeInfo
    }
  })
})

function openEmployeeModal(employee: any, object: any) {
  selectedEmployee.value = {
    employee,
    tasks: employee.tasks || [],
    objectName: object.name
  }
  employeeModalOpen.value = true
}

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

function openCreateModal(object?: ObjectTaskCard | null) {
  if (!canManageObjectTasks.value) {
    return
  }

  if (object && !object.employees.length) {
    toast.add({
      title: 'Нет доступных сотрудников',
      description: 'У выбранного объекта нет активных сотрудников с мобильным доступом.',
      color: 'warning'
    })
    return
  }

  form.objectId = object?.id
  form.employeeId = object?.employees[0]?.id
  form.title = object ? `${object.name}: новый чек-лист` : ''
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
  if (!canManageObjectTasks.value || creating.value) {
    return
  }

  const items = form.items.map(item => item.trim()).filter(Boolean)
  if (!selectedObject.value || !form.objectId) {
    toast.add({
      title: 'Выберите объект',
      color: 'warning'
    })
    return
  }

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
              v-if="canManageObjectTasks"
              icon="i-lucide-plus"
              label="Новый to-do"
              @click="openCreateModal()"
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
            <h2 class="text-lg font-semibold text-highlighted">Список объектов и задач</h2>
            <p class="text-sm text-muted">Нажмите на объект, чтобы раскрыть сотрудников и их чек-листы.</p>
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

        <div v-else class="space-y-4">
          <section
            v-for="object in objectList"
            :key="object.id"
            class="rounded-2xl border border-default bg-elevated/40 shadow-sm"
          >
            <div
              class="w-full text-left cursor-pointer"
              role="button"
              tabindex="0"
              @click="toggleObject(object.id)"
              @keydown.enter.prevent="toggleObject(object.id)"
              @keydown.space.prevent="toggleObject(object.id)"
            >
              <div class="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-lg font-semibold text-highlighted">{{ object.name }}</h3>
                    <UBadge
                      :label="object.isActive ? 'Активен' : 'Неактивен'"
                      :color="object.isActive ? 'success' : 'neutral'"
                      variant="subtle"
                    />
                    <UBadge :label="`${object.employeeCount} сотрудников`" color="neutral" variant="subtle" />
                    <UBadge :label="`Задач: ${object.totalTasks}`" color="primary" variant="outline" />
                  </div>
                  <p class="text-sm text-muted">{{ object.address || object.description || 'Адрес не указан' }}</p>
                  <p class="text-xs text-muted">{{ object.code ? `Код: ${object.code}` : 'Без кода' }}</p>
                </div>

                <div class="flex items-center gap-2">
                  <div class="flex items-center gap-1 text-xs text-muted">
                    <span>Открыто:</span>
                    <UBadge :label="object.openTasks + object.inProgressTasks" color="warning" variant="soft" />
                    <span>Закрыто:</span>
                    <UBadge :label="object.completedTasks" color="success" variant="soft" />
                  </div>

                  <UButton
                    v-if="canManageObjectTasks"
                    icon="i-lucide-plus"
                    color="neutral"
                    variant="ghost"
                    @click.stop="openCreateModal(object)"
                  />

                  <UButton
                    :icon="expandedObjectId === object.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    aria-label="Показать сотрудников"
                    @click.stop="toggleObject(object.id)"
                  />
                </div>
              </div>
            </div>

            <transition name="fade">
              <div v-if="expandedObjectId === object.id" class="border-t border-default/70 bg-default/20 p-5">
                <div class="flex flex-wrap items-center gap-3">
                  <h4 class="text-sm font-semibold text-highlighted">Сотрудники объекта</h4>
                  <UBadge
                    :label="`${object.employeeInfo.filter(emp => emp.taskCount > 0).length} с задачами`"
                    color="primary"
                    variant="subtle"
                  />
                  <UBadge
                    :label="`${object.employeeInfo.length} всего`"
                    color="neutral"
                    variant="subtle"
                  />
                </div>

                <div v-if="object.employeeInfo.length" class="mt-3 divide-y divide-default/70 rounded-xl border border-default/70 bg-default/30">
                  <div
                    v-for="employee in object.employeeInfo"
                    :key="employee.id"
                    class="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between cursor-pointer rounded-lg hover:bg-default/50 transition-colors"
                    role="button"
                    tabindex="0"
                    @click="openEmployeeModal(employee, object)"
                    @keydown.enter.prevent="openEmployeeModal(employee, object)"
                    @keydown.space.prevent="openEmployeeModal(employee, object)"
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
                      <p class="text-xs text-muted">
                        {{ employee.phone || 'Телефон не указан' }} · Статус: {{ employee.status || '—' }}
                      </p>
                    </div>

                    <div class="text-right text-xs text-muted w-full sm:w-52">
                      <p v-if="employee.recentCompletion">Последняя активность: {{ formatDateTime(employee.recentCompletion) }}</p>
                      <p v-else>Активность не найдена</p>
                    </div>
                  </div>
                </div>
                <p v-else class="mt-3 text-sm text-muted">У объекта нет сотрудников с мобильным доступом.</p>

                <div class="mt-4 space-y-2">
                  <div class="flex items-center justify-between">
                    <p class="text-sm font-semibold text-highlighted">Недавние задачи</p>
                    <UBadge :label="object.totalTasks" color="neutral" variant="subtle" />
                  </div>

                  <div v-if="object.tasks.length" class="space-y-2">
                    <div
                      v-for="task in object.tasks.slice(0, 4)"
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
                          <p class="text-sm text-muted">
                            {{ task.employeeName }}<span v-if="task.employeeUsername"> · @{{ task.employeeUsername }}</span>
                          </p>
                          <p v-if="task.note" class="text-sm text-toned">{{ task.note }}</p>
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
                  <p v-else class="text-sm text-muted">Для этого объекта еще не назначены to-do листы.</p>
                </div>
              </div>
            </transition>
          </section>
        </div>
      </div>

      <UModal
        v-model:open="employeeModalOpen"
        :title="selectedEmployee ? `${selectedEmployee.employee.name} · @${selectedEmployee.employee.username}` : 'Сотрудник'"
        :description="selectedEmployee ? `Объект: ${selectedEmployee.objectName}` : ''"
        size="xl"
      >
        <template #body>
          <div v-if="selectedEmployee" class="space-y-4">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :label="selectedEmployee.employee.status || '—'" color="neutral" variant="subtle" />
              <UBadge :label="selectedEmployee.employee.phone || 'Телефон не указан'" color="neutral" variant="subtle" />
              <UBadge :label="`Задач: ${selectedEmployee.tasks.length}`" color="primary" variant="outline" />
              <UBadge
                v-if="selectedEmployee.employee.hasOpenTasks"
                label="Есть открытые"
                color="warning"
                variant="soft"
              />
              <span v-if="selectedEmployee.employee.recentCompletion" class="text-xs text-muted">
                Последняя активность: {{ formatDateTime(selectedEmployee.employee.recentCompletion) }}
              </span>
            </div>

            <div v-if="selectedEmployee.tasks.length" class="space-y-3">
              <div
                v-for="task in selectedEmployee.tasks"
                :key="task.id"
                class="rounded-xl border border-default/70 bg-default/30 p-4"
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
                    <p class="text-xs text-muted">Срок: {{ formatDate(task.dueDate) }} · Обновлено: {{ formatDateTime(task.updatedAt || task.createdAt) }}</p>
                    <p v-if="task.note" class="text-sm text-toned">{{ task.note }}</p>
                  </div>
                  <div class="text-xs text-muted text-right">
                    <p>Прогресс: {{ task.completedItems }}/{{ task.totalItems }}</p>
                    <div class="mt-1 h-2 overflow-hidden rounded-full bg-default/70 w-36">
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
                    <div class="flex items-center justify-between">
                      <span :class="item.isDone ? 'text-success line-through' : 'text-toned'">
                        {{ item.title }}
                      </span>
                      <span :class="item.isDone ? 'text-success' : 'text-muted'">{{ item.isDone ? 'Выполнено' : 'Открыто' }}</span>
                    </div>
                    <div v-if="item.proofPhotoUrls?.length" class="mt-2 flex flex-wrap gap-2">
                      <a
                        v-for="(photo, idx) in item.proofPhotoUrls"
                        :key="`${item.id}-${idx}`"
                        :href="photo"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="block w-20 h-20 overflow-hidden rounded-md border border-default"
                      >
                        <img :src="photo" alt="Доказательство" class="h-full w-full object-cover" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-muted">У сотрудника пока нет назначенных задач.</p>
          </div>
          <div v-else class="text-sm text-muted">Выберите сотрудника из списка.</div>
        </template>
      </UModal>

      <UModal
        v-model:open="createModalOpen"
        :title="selectedObject ? `Новый to-do для ${selectedObject.name}` : 'Новый to-do'"
        description="Список будет доступен сотруднику в мобильном приложении и обновляться по мере выполнения пунктов."
      >
        <template #body>
          <div class="space-y-4">
            <UFormField label="Объект" required>
              <USelect
                v-model="form.objectId"
                :items="objectOptions"
                class="w-full"
                placeholder="Выберите объект"
              />
            </UFormField>

            <UFormField label="Сотрудник" required>
              <USelect
                v-model="form.employeeId"
                :items="employeeOptions"
                class="w-full"
                :disabled="!selectedObject"
                placeholder="Сначала выберите объект"
              />
            </UFormField>

            <p v-if="selectedObject && !employeeOptions.length" class="text-sm text-warning">
              У выбранного объекта нет сотрудников с мобильным доступом. Назначить такой список сейчас нельзя.
            </p>

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

