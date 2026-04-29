<script setup lang="ts">
type ObjectItem = {
  id: number
  building_id?: number | null
  name: string
  description?: string | null
  address?: string | null
  code?: string | null
  is_active?: boolean
}

const router = useRouter()
const toast = useToast()
const { canManageObjects } = useRoleAccess()
const activeBuilding = useState<{ id: number, name: string } | null>('active-building')
const activeObject = useState<{ id: number, name: string } | null>('active-object')
const activeObjectIdCookie = useCookie<number | null>('active-object-id', { default: () => null })

const deleteModalOpen = ref(false)
const deleteStep = ref<1 | 2>(1)
const deleteTarget = ref<ObjectItem | null>(null)
const deleteConfirmText = ref('')
const deleting = ref(false)

const { data: objects, error, status, refresh } = await useAutoRefreshFetch<ObjectItem[]>('/api/objects', {
  default: () => [],
  query: {
    buildingId: computed(() => activeBuilding.value?.id)
  }
})

watch(error, (value) => {
  if (!value) {
    return
  }

  const fetchError = value as { data?: { statusMessage?: string }, message?: string }

  toast.add({
    title: 'Не удалось загрузить объекты',
    description: fetchError.data?.statusMessage || fetchError.message,
    color: 'error'
  })
}, { immediate: true })

watch(deleteModalOpen, (open) => {
  if (open) {
    return
  }

  deleteStep.value = 1
  deleteTarget.value = null
  deleteConfirmText.value = ''
})

function openCreatePage() {
  if (!canManageObjects.value) {
    toast.add({
      title: 'Страница доступна только для просмотра',
      description: 'Создание объектов доступно только администратору.',
      color: 'warning'
    })
    return
  }

  if (!activeBuilding.value?.id) {
    toast.add({
      title: 'Сначала выберите здание',
      color: 'warning'
    })
    return
  }

  router.push('/objects/create')
}

function setActiveObject(item: ObjectItem | null) {
  activeObject.value = item ? { id: item.id, name: item.name } : null
  activeObjectIdCookie.value = item?.id ?? null
}

function openDeleteModal(item: ObjectItem) {
  if (!canManageObjects.value) {
    return
  }

  deleteTarget.value = item
  deleteStep.value = 1
  deleteConfirmText.value = ''
  deleteModalOpen.value = true
}

function closeDeleteModal() {
  deleteModalOpen.value = false
  deleteStep.value = 1
  deleteTarget.value = null
  deleteConfirmText.value = ''
}

function continueDelete() {
  if (deleting.value) {
    return
  }

  deleteStep.value = 2
  deleteConfirmText.value = ''
}

async function deleteObject() {
  const target = deleteTarget.value
  if (!canManageObjects.value || deleting.value || !target) {
    return
  }

  const expected = (target.name || '').trim()
  if (!expected || deleteConfirmText.value.trim() !== expected) {
    return
  }

  deleting.value = true

  try {
    await $fetch(`/api/objects/${target.id}`, { method: 'DELETE' })
    await refresh()

    if (activeObject.value?.id === target.id) {
      setActiveObject(null)
    }

    toast.add({ title: 'Объект удалён', description: target.name, color: 'success' })
    closeDeleteModal()
  } catch (err: unknown) {
    const msg = (err as any)?.data?.statusMessage || (err as Error)?.message || 'Не удалось удалить объект.'
    toast.add({ title: 'Ошибка удаления', description: msg, color: 'error' })
  } finally {
    deleting.value = false
  }
}

async function toggleObject(item: ObjectItem, enabled: boolean) {
  if (!canManageObjects.value) {
    return
  }

  try {
    await $fetch(`/api/objects/${item.id}`, {
      method: 'PATCH',
      body: { isActive: enabled }
    })

    await refresh()

    if (enabled) {
      setActiveObject(item)
      toast.add({ title: 'Объект активирован', description: item.name, color: 'success' })
    } else {
      if (activeObject.value?.id === item.id) {
        setActiveObject(null)
      }
      toast.add({ title: 'Объект деактивирован', description: item.name, color: 'info' })
    }
  } catch (err: unknown) {
    const msg = (err as any)?.data?.statusMessage || (err as Error)?.message || 'Не удалось обновить объект'
    toast.add({ title: 'Ошибка', description: msg, color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="objects">
    <template #header>
      <UDashboardNavbar title="Объекты">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UBadge
              v-if="!canManageObjects"
              label="Только чтение"
              color="neutral"
              variant="subtle"
            />
            <UButton
              v-if="canManageObjects"
              icon="i-lucide-plus"
              label="Создать объект"
              @click="openCreatePage"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="rounded-lg border border-default overflow-x-auto">
        <div class="border-b border-default px-3 py-2 text-sm text-muted">
          {{ activeBuilding?.name ? `Здание: ${activeBuilding.name}` : 'Здание не выбрано' }}
        </div>

        <table class="min-w-full text-sm">
          <thead>
            <tr class="bg-elevated/50">
              <th class="px-3 py-2 text-left">
                ID
              </th>
              <th class="px-3 py-2 text-left">
                Название
              </th>
              <th class="px-3 py-2 text-left">
                Адрес
              </th>
              <th class="px-3 py-2 text-left">
                Описание
              </th>
              <th class="px-3 py-2 text-left">
                Код
              </th>
              <th class="px-3 py-2 text-left">
                Статус
              </th>
              <th class="px-3 py-2 text-right">
                Действие
              </th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="item in objects"
              :key="item.id"
              class="border-t border-default"
            >
              <td class="px-3 py-2">
                {{ item.id }}
              </td>
              <td class="px-3 py-2 font-medium">
                {{ item.name }}
              </td>
              <td class="px-3 py-2">
                {{ item.address || '-' }}
              </td>
              <td class="px-3 py-2">
                {{ item.description || '-' }}
              </td>
              <td class="px-3 py-2">
                {{ item.code || '-' }}
              </td>
              <td class="px-3 py-2">
                <UBadge
                  :label="item.is_active ? 'Активен' : 'Неактивен'"
                  :color="item.is_active ? 'primary' : 'neutral'"
                  variant="subtle"
                />
              </td>
              <td class="px-3 py-2 text-right">
                <div class="flex justify-end items-center gap-2">
                  <template v-if="canManageObjects">
                    <USwitch
                      :model-value="!!item.is_active"
                      @update:model-value="toggleObject(item, $event)"
                    />
                    <UButton
                      icon="i-lucide-trash"
                      color="error"
                      variant="ghost"
                      size="xs"
                      :disabled="deleting"
                      @click="openDeleteModal(item)"
                    />
                  </template>
                  <span v-else class="text-xs text-muted">Только просмотр</span>
                </div>
              </td>
            </tr>

            <tr v-if="status === 'pending'">
              <td class="px-3 py-4 text-muted" colspan="7">
                Загрузка объектов...
              </td>
            </tr>

            <tr v-else-if="!objects.length">
              <td class="px-3 py-4 text-muted" colspan="7">
                {{ activeBuilding?.name ? 'Для этого здания объекты не найдены.' : 'Выберите здание, чтобы увидеть объекты.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <UModal
        v-model:open="deleteModalOpen"
        title="Удалить объект"
        :description="deleteTarget ? `Объект: ${deleteTarget.name}` : 'Подтверждение удаления объекта.'"
        :prevent-close="deleting"
      >
        <template #body>
          <div v-if="deleteTarget" class="space-y-4">
            <UAlert
              v-if="deleteStep === 1"
              color="warning"
              variant="subtle"
              title="Это действие безвозвратно"
              description="Объект будет удалён навсегда. Восстановить его через панель невозможно. Если есть связанные данные (документы/отчёты), удаление может быть заблокировано."
            />

            <div v-else class="space-y-3">
              <UAlert
                color="error"
                variant="subtle"
                title="Финальное подтверждение"
                description="Введите точное название объекта, чтобы подтвердить удаление."
              />

              <UFormField :label="`Введите: ${deleteTarget.name}`">
                <UInput
                  v-model="deleteConfirmText"
                  class="w-full"
                  autocomplete="off"
                  :disabled="deleting"
                />
              </UFormField>
            </div>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              label="Отмена"
              color="neutral"
              variant="subtle"
              :disabled="deleting"
              @click="closeDeleteModal"
            />

            <UButton
              v-if="deleteStep === 1"
              label="Продолжить"
              color="warning"
              @click="continueDelete"
            />

            <UButton
              v-else
              label="Удалить навсегда"
              color="error"
              :loading="deleting"
              :disabled="!deleteTarget || deleteConfirmText.trim() !== deleteTarget.name.trim()"
              @click="deleteObject"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
