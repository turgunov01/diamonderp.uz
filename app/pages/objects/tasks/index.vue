<script setup lang="ts">
import type { ObjectTask, ObjectTaskCard, ObjectTaskOverview } from '~/types/object-tasks'
import { formatDateTime } from '~/utils/object-task-helpers'

definePageMeta({
  title: 'Объекты / Задачи',
  ssr: true
})

const toast = useToast()
const activeBuilding = useState<{ id: number, name: string } | null>('active-building')
const { canManageObjectTasks } = useRoleAccess()

const search = ref('')
const createModalOpen = ref(false)
const creating = ref(false)
const form = reactive({
  objectId: undefined as number | undefined,
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
  form.title = ''
  form.note = ''
  form.dueDate = ''
  form.items = ['']
})

const objects = computed(() => data.value?.objects || [])
const objectsWithTasks = computed(() => objects.value.filter(object => object.totalTasks > 0))

const filteredObjects = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) {
    return objectsWithTasks.value
  }

  return objectsWithTasks.value.filter((object) => {
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

const totalOpenTasks = computed(() => objectsWithTasks.value.reduce((sum, object) => sum + object.openTasks + object.inProgressTasks, 0))
const lastUpdatedAt = computed(() => {
  const timestamps: number[] = []
  objectsWithTasks.value.forEach((object) => {
    object.tasks.forEach((task) => {
      if (task.updatedAt) timestamps.push(new Date(task.updatedAt).getTime())
      else if (task.createdAt) timestamps.push(new Date(task.createdAt).getTime())
    })
  })
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null
})

const objectOptions = computed(() => {
  return objects.value.map(object => ({
    label: object.name,
    value: object.id
  }))
})
const selectedObject = computed(() => {
  return objects.value.find(object => object.id === form.objectId) || null
})

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

  if (!selectedObject.value.employees?.length) {
    toast.add({
      title: 'Нет доступных сотрудников',
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
  <UDashboardPanel id="object-tasks-list">
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
          <UPageCard icon="i-lucide-building-2" title="Объекты с задачами" variant="subtle">
            <p class="text-2xl font-semibold text-highlighted">
              {{ objectsWithTasks.length }}
            </p>
            <p class="text-xs text-muted">
              {{ activeBuilding?.name ? `Здание: ${activeBuilding.name}` : 'Все здания' }}
            </p>
          </UPageCard>
          <UPageCard icon="i-lucide-list-todo" title="Активные задачи" variant="subtle">
            <p class="text-2xl font-semibold text-highlighted">
              {{ totalOpenTasks }}
            </p>
            <p class="text-xs text-muted">
              Новые и в работе
            </p>
          </UPageCard>
          <UPageCard icon="i-lucide-clock-3" title="Последнее обновление" variant="subtle">
            <p class="text-2xl font-semibold text-highlighted">
              {{ lastUpdatedAt ? formatDateTime(lastUpdatedAt) : '—' }}
            </p>
            <p class="text-xs text-muted">
              По задачам в списке
            </p>
          </UPageCard>
        </div>

        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              Объекты с назначенными задачами
            </h2>
            <p class="text-sm text-muted">
              Нажмите «Подробнее», чтобы открыть объект и список сотрудников.
            </p>
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
          <p class="text-sm text-muted">
            Объекты с задачами не найдены.
          </p>
        </div>

        <div v-else class="space-y-4">
          <section
            v-for="object in filteredObjects"
            :key="object.id"
            class="rounded-2xl border border-default bg-elevated/40 shadow-sm"
          >
            <div class="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="text-lg font-semibold text-highlighted">
                    {{ object.name }}
                  </h3>
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

              <div class="flex flex-col items-start gap-2 sm:items-end">
                <div class="flex items-center gap-1 text-xs text-muted">
                  <span>Открыто:</span>
                  <UBadge :label="object.openTasks + object.inProgressTasks" color="warning" variant="soft" />
                  <span>Закрыто:</span>
                  <UBadge :label="object.completedTasks" color="success" variant="soft" />
                </div>

                <div class="flex items-center gap-2">
                  <UButton
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-arrow-right"
                    label="Подробнее"
                    :to="`/objects/tasks/${object.id}`"
                  />
                  <UButton
                    v-if="canManageObjectTasks"
                    icon="i-lucide-plus"
                    color="neutral"
                    variant="ghost"
                    @click="openCreateModal(object)"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <UModal
        v-model:open="createModalOpen"
        :title="selectedObject ? `Новый to-do для ${selectedObject.name}` : 'Новый to-do'"
        description="Список будет доступен сотрудникам объекта в мобильном приложении и обновляться по мере выполнения пунктов."
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

            <p v-if="selectedObject && !selectedObject.employees?.length" class="text-sm text-warning">
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
                  <p class="font-medium text-highlighted">
                    Чек-лист
                  </p>
                  <p class="text-xs text-muted">
                    Каждый пункт сотрудник сможет отмечать в мобильном приложении.
                  </p>
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
