<script setup lang="ts">
type BuildingItem = {
  id: number
  name: string
  logo?: string | null
  description?: string | null
}

interface BuildingFormState {
  name: string
  logo: string
  description: string
}

const BUILDING_NAME_MAX_LENGTH = 40

const toast = useToast()
const { canManageBuildings } = useRoleAccess()
const activeBuilding = useState<BuildingItem | null>('active-building')
const activeBuildingIdCookie = useCookie<number | null>('active-building-id', { default: () => null })

const { data: buildings, error, status, refresh } = await useAutoRefreshFetch<BuildingItem[]>('/api/buildings', {
  default: () => []
})

const selectedBuildingIds = ref<Record<number, boolean>>({})

const formModalOpen = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const editTarget = ref<BuildingItem | null>(null)
const saving = ref(false)
const form = reactive<BuildingFormState>({ name: '', logo: '', description: '' })

const deleteModalOpen = ref(false)
const deleteStep = ref<1 | 2>(1)
const deleteTarget = ref<BuildingItem | null>(null)
const deleteConfirmText = ref('')
const deleting = ref(false)
const keepEmployees = ref(false)

const bulkDeleteModalOpen = ref(false)
const bulkDeleting = ref(false)

const selectedBuildings = computed(() =>
  (buildings.value || []).filter(item => selectedBuildingIds.value[item.id])
)
const selectedBuildingCount = computed(() => selectedBuildings.value.length)
const selectAllModel = computed<boolean | 'indeterminate'>(() => {
  const total = buildings.value?.length || 0
  if (!total) {
    return false
  }

  const selected = selectedBuildingCount.value
  if (!selected) {
    return false
  }

  return selected === total ? true : 'indeterminate'
})

watch(buildings, (items) => {
  const allowedIds = new Set((items || []).map(item => Number(item.id)))
  const nextSelection: Record<number, boolean> = {}
  for (const [idRaw, selected] of Object.entries(selectedBuildingIds.value)) {
    const id = Number(idRaw)
    if (selected && allowedIds.has(id)) {
      nextSelection[id] = true
    }
  }
  selectedBuildingIds.value = nextSelection
}, { immediate: true })

watch(error, (value) => {
  if (!value) {
    return
  }

  const fetchError = value as { data?: { message?: string, statusMessage?: string }, message?: string }
  toast.add({
    title: 'Не удалось загрузить здания',
    description: fetchError.data?.message || fetchError.message,
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
  keepEmployees.value = false
})

function getErrorMessage(err: unknown, fallback: string) {
  if (err && typeof err === 'object') {
    const payload = err as { data?: { message?: string, statusMessage?: string }, message?: string }
    return payload.data?.message || payload.message || fallback
  }

  return fallback
}

function buildingWord(count: number) {
  const mod10 = count % 10
  const mod100 = count % 100

  if (mod10 === 1 && mod100 !== 11) {
    return 'здание'
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'здания'
  }

  return 'зданий'
}

function buildingInitial(item: BuildingItem) {
  return (item.name || '?').trim().charAt(0).toUpperCase() || '?'
}

function resetForm() {
  form.name = ''
  form.logo = ''
  form.description = ''
}

function openCreateModal() {
  if (!canManageBuildings.value) {
    return
  }

  formMode.value = 'create'
  editTarget.value = null
  resetForm()
  formModalOpen.value = true
}

function openEditModal(item: BuildingItem) {
  if (!canManageBuildings.value) {
    return
  }

  formMode.value = 'edit'
  editTarget.value = item
  form.name = item.name || ''
  form.logo = item.logo || ''
  form.description = item.description || ''
  formModalOpen.value = true
}

async function saveBuilding() {
  if (!canManageBuildings.value || saving.value) {
    return
  }

  if (!form.name.trim()) {
    toast.add({ title: 'Название здания обязательно', color: 'warning' })
    return
  }

  saving.value = true

  const payload = {
    name: form.name.trim().slice(0, BUILDING_NAME_MAX_LENGTH),
    logo: form.logo.trim(),
    description: form.description.trim()
  }

  try {
    if (formMode.value === 'edit' && editTarget.value) {
      const updated = await $fetch<BuildingItem>(`/api/buildings/${editTarget.value.id}`, {
        method: 'PATCH',
        body: payload
      })

      if (activeBuilding.value?.id === updated.id) {
        activeBuilding.value = updated
      }

      toast.add({ title: 'Здание обновлено', description: updated.name, color: 'success' })
    } else {
      const created = await $fetch<BuildingItem>('/api/buildings', {
        method: 'POST',
        body: payload
      })

      toast.add({ title: 'Здание создано', description: created.name, color: 'success' })
    }

    await refresh()
    await refreshNuxtData('/api/buildings')
    formModalOpen.value = false
    resetForm()
    editTarget.value = null
  } catch (err: unknown) {
    const msg = getErrorMessage(err, 'Проверьте данные здания и повторите попытку.')
    toast.add({
      title: formMode.value === 'edit' ? 'Не удалось обновить здание' : 'Не удалось создать здание',
      description: msg,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

function setBuildingSelected(id: number, checked: boolean) {
  if (!canManageBuildings.value) {
    return
  }

  selectedBuildingIds.value[id] = checked
}

function toggleAllBuildings(checked: boolean) {
  if (!canManageBuildings.value || !checked) {
    selectedBuildingIds.value = {}
    return
  }

  const next: Record<number, boolean> = {}
  for (const item of buildings.value || []) {
    next[item.id] = true
  }
  selectedBuildingIds.value = next
}

function clearSelection() {
  selectedBuildingIds.value = {}
}

function openDeleteModal(item: BuildingItem) {
  if (!canManageBuildings.value) {
    return
  }

  deleteTarget.value = item
  deleteStep.value = 1
  deleteConfirmText.value = ''
  keepEmployees.value = false
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

function clearActiveIfMatch(ids: number[]) {
  if (activeBuilding.value && ids.includes(activeBuilding.value.id)) {
    activeBuilding.value = null
    activeBuildingIdCookie.value = null
  }
}

async function deleteBuilding() {
  const target = deleteTarget.value
  if (!canManageBuildings.value || deleting.value || !target) {
    return
  }

  const expected = (target.name || '').trim()
  if (!expected || deleteConfirmText.value.trim() !== expected) {
    return
  }

  deleting.value = true

  try {
    await $fetch(`/api/buildings/${target.id}`, {
      method: 'DELETE',
      query: { keepEmployees: keepEmployees.value ? 'true' : 'false' }
    })
    await refresh()
    await refreshNuxtData('/api/buildings')

    clearActiveIfMatch([target.id])
    selectedBuildingIds.value[target.id] = false

    toast.add({ title: 'Здание удалено', description: target.name, color: 'success' })
    closeDeleteModal()
  } catch (err: unknown) {
    const msg = getErrorMessage(err, 'Не удалось удалить здание.')
    toast.add({ title: 'Ошибка удаления', description: msg, color: 'error' })
  } finally {
    deleting.value = false
  }
}

function openBulkDeleteModal() {
  if (!canManageBuildings.value || !selectedBuildingCount.value || deleting.value || bulkDeleting.value) {
    return
  }

  keepEmployees.value = false
  bulkDeleteModalOpen.value = true
}

function closeBulkDeleteModal() {
  if (bulkDeleting.value) {
    return
  }

  bulkDeleteModalOpen.value = false
}

async function deleteSelectedBuildings() {
  if (!canManageBuildings.value || deleting.value || bulkDeleting.value || !selectedBuildingCount.value) {
    return
  }

  const targetIds = selectedBuildings.value.map(item => item.id)

  bulkDeleting.value = true

  try {
    const result = await $fetch<{ count: number }>('/api/buildings/bulk-delete', {
      method: 'POST',
      body: { ids: targetIds, keepEmployees: keepEmployees.value }
    })

    await refresh()
    await refreshNuxtData('/api/buildings')

    clearActiveIfMatch(targetIds)
    clearSelection()
    bulkDeleteModalOpen.value = false

    toast.add({
      title: 'Здания удалены',
      description: `Удалено: ${result.count}`,
      color: 'success'
    })
  } catch (err: unknown) {
    const msg = getErrorMessage(err, 'Не удалось удалить выбранные здания.')
    toast.add({ title: 'Ошибка массового удаления', description: msg, color: 'error' })
  } finally {
    bulkDeleting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="buildings">
    <template #header>
      <UDashboardNavbar title="Здания">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UBadge
              v-if="!canManageBuildings"
              label="Только чтение"
              color="neutral"
              variant="subtle"
            />
            <UButton
              v-if="canManageBuildings && selectedBuildingCount"
              icon="i-lucide-trash-2"
              :label="`Удалить (${selectedBuildingCount})`"
              color="error"
              variant="subtle"
              :loading="bulkDeleting"
              :disabled="deleting"
              @click="openBulkDeleteModal"
            />
            <UButton
              v-if="canManageBuildings"
              icon="i-lucide-building-2"
              label="Создать здание"
              @click="openCreateModal"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="rounded-lg border border-default overflow-x-auto">
        <div class="border-b border-default px-3 py-2 text-sm text-muted">
          {{ buildings.length }} {{ buildingWord(buildings.length) }}
        </div>

        <table class="min-w-full text-sm">
          <thead>
            <tr class="bg-elevated/50">
              <th v-if="canManageBuildings" class="w-10 px-3 py-2 text-left">
                <UCheckbox
                  :model-value="selectAllModel"
                  :disabled="!buildings.length || deleting || bulkDeleting"
                  aria-label="Выбрать все здания"
                  @update:model-value="(value: boolean | 'indeterminate') => toggleAllBuildings(!!value)"
                />
              </th>
              <th class="px-3 py-2 text-left">
                ID
              </th>
              <th class="px-3 py-2 text-left">
                Логотип
              </th>
              <th class="px-3 py-2 text-left">
                Название
              </th>
              <th class="px-3 py-2 text-left">
                Описание
              </th>
              <th class="px-3 py-2 text-right">
                Действие
              </th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="item in buildings"
              :key="item.id"
              class="border-t border-default"
            >
              <td v-if="canManageBuildings" class="px-3 py-2">
                <UCheckbox
                  :model-value="!!selectedBuildingIds[item.id]"
                  :disabled="deleting || bulkDeleting"
                  :aria-label="`Выбрать здание ${item.name}`"
                  @update:model-value="(value: boolean | 'indeterminate') => setBuildingSelected(item.id, !!value)"
                />
              </td>
              <td class="px-3 py-2">
                {{ item.id }}
              </td>
              <td class="px-3 py-2">
                <UAvatar
                  :src="item.logo || undefined"
                  :alt="item.name"
                  :text="buildingInitial(item)"
                  size="sm"
                />
              </td>
              <td class="px-3 py-2 font-medium">
                {{ item.name }}
              </td>
              <td class="px-3 py-2 text-muted">
                {{ item.description || '-' }}
              </td>
              <td class="px-3 py-2 text-right">
                <div class="flex justify-end items-center gap-2">
                  <template v-if="canManageBuildings">
                    <UButton
                      icon="i-lucide-pencil"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :disabled="deleting || bulkDeleting"
                      @click="openEditModal(item)"
                    />
                    <UButton
                      icon="i-lucide-trash"
                      color="error"
                      variant="ghost"
                      size="xs"
                      :disabled="deleting || bulkDeleting"
                      @click="openDeleteModal(item)"
                    />
                  </template>
                  <span v-else class="text-xs text-muted">Только просмотр</span>
                </div>
              </td>
            </tr>

            <tr v-if="status === 'pending'">
              <td class="px-3 py-4 text-muted" :colspan="canManageBuildings ? 6 : 5">
                Загрузка зданий...
              </td>
            </tr>

            <tr v-else-if="!buildings.length">
              <td class="px-3 py-4 text-muted" :colspan="canManageBuildings ? 6 : 5">
                Здания не найдены.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <UModal
        v-model:open="formModalOpen"
        :title="formMode === 'edit' ? 'Редактировать здание' : 'Создать здание'"
        :description="formMode === 'edit'
          ? 'Измените данные здания.'
          : 'Добавьте здание и используйте его как верхний уровень рабочего пространства.'"
        :prevent-close="saving"
      >
        <template #body>
          <div class="space-y-4">
            <UFormField label="Название" required>
              <UInput
                v-model="form.name"
                class="w-full"
                :maxlength="BUILDING_NAME_MAX_LENGTH"
                :disabled="saving"
                placeholder="Ташкент Сити Молл"
              />
            </UFormField>

            <UFormField label="URL логотипа">
              <UInput
                v-model="form.logo"
                class="w-full"
                :disabled="saving"
                placeholder="https://..."
              />
            </UFormField>

            <UFormField label="Описание">
              <UTextarea
                v-model="form.description"
                class="w-full"
                :rows="3"
                :disabled="saving"
                placeholder="Краткое описание здания"
              />
            </UFormField>

            <div class="flex justify-end gap-2">
              <UButton
                label="Отмена"
                color="neutral"
                variant="subtle"
                :disabled="saving"
                @click="formModalOpen = false"
              />
              <UButton
                :label="formMode === 'edit' ? 'Сохранить' : 'Создать'"
                :loading="saving"
                @click="saveBuilding"
              />
            </div>
          </div>
        </template>
      </UModal>

      <UModal
        v-model:open="deleteModalOpen"
        title="Удалить здание"
        :description="deleteTarget ? `Здание: ${deleteTarget.name}` : 'Подтверждение удаления здания.'"
        :prevent-close="deleting"
      >
        <template #body>
          <div v-if="deleteTarget" class="space-y-4">
            <template v-if="deleteStep === 1">
              <UAlert
                color="warning"
                variant="subtle"
                title="Это действие безвозвратно"
                description="Здание будет удалено навсегда вместе со всеми его объектами и связанными данными объектов."
              />

              <USwitch
                v-model="keepEmployees"
                label="Сохранить сотрудников"
                :description="keepEmployees
                  ? 'Сотрудники будут отвязаны от здания, но останутся в системе.'
                  : 'Выключено: все сотрудники этого здания будут удалены вместе со зданием.'"
                :disabled="deleting"
              />
            </template>

            <div v-else class="space-y-3">
              <UAlert
                color="error"
                variant="subtle"
                title="Финальное подтверждение"
                description="Введите точное название здания, чтобы подтвердить удаление."
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
              @click="deleteBuilding"
            />
          </div>
        </template>
      </UModal>

      <UModal
        v-model:open="bulkDeleteModalOpen"
        title="Удалить выбранные здания"
        :description="`Выбрано ${selectedBuildingCount} ${buildingWord(selectedBuildingCount)}.`"
        :prevent-close="bulkDeleting"
      >
        <template #body>
          <div class="space-y-4">
            <UAlert
              color="warning"
              variant="subtle"
              title="Массовое удаление"
              description="Выбранные здания будут удалены вместе со всеми их объектами."
            />

            <USwitch
              v-model="keepEmployees"
              label="Сохранить сотрудников"
              :description="keepEmployees
                ? 'Сотрудники будут отвязаны от зданий, но останутся в системе.'
                : 'Выключено: все сотрудники выбранных зданий будут удалены.'"
              :disabled="bulkDeleting"
            />

            <div class="max-h-56 overflow-y-auto rounded-md border border-default">
              <div
                v-for="item in selectedBuildings"
                :key="item.id"
                class="flex items-center justify-between gap-3 border-b border-default px-3 py-2 last:border-b-0"
              >
                <span class="truncate font-medium">{{ item.name }}</span>
                <span class="shrink-0 text-xs text-muted">ID {{ item.id }}</span>
              </div>
            </div>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              label="Отмена"
              color="neutral"
              variant="subtle"
              :disabled="bulkDeleting"
              @click="closeBulkDeleteModal"
            />
            <UButton
              label="Удалить выбранные"
              color="error"
              icon="i-lucide-trash-2"
              :loading="bulkDeleting"
              :disabled="!selectedBuildingCount"
              @click="deleteSelectedBuildings"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
