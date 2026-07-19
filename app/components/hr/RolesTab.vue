<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

type CustomerRole = {
  id: number
  buildingId: number | null
  code: string
  label: string
  isActive: boolean
  createdAt: string | null
  scope: 'global' | 'building' | 'fallback'
  isSystem: boolean
  isReadonly: boolean
}

const toast = useToast()
const activeBuilding = useState<{ id: number, name: string } | null>('active-building')

const q = ref('')
const buildingId = computed(() => activeBuilding.value?.id)

const { data: roles, status, error, refresh } = await useAutoRefreshFetch<CustomerRole[]>('/api/customer-roles', {
  default: () => [],
  query: {
    buildingId
  }
})

const safeRoles = computed(() => roles.value || [])
const isLoading = computed(() => status.value === 'pending' || status.value === 'idle')

const filteredRoles = computed(() => {
  const query = q.value.trim().toLowerCase()
  if (!query) return safeRoles.value

  return safeRoles.value.filter((role) => {
    return role.label.toLowerCase().includes(query) || role.code.toLowerCase().includes(query)
  })
})

function getErrorMessage(err: unknown) {
  if (err && typeof err === 'object') {
    const anyErr = err as { data?: { message?: string, statusMessage?: string }, message?: string }
    return anyErr.data?.message || anyErr.message
  }
  return undefined
}

function isReadonlyRole(role: CustomerRole) {
  return role.isReadonly || role.id < 0
}

function scopeLabel(role: CustomerRole) {
  if (role.scope === 'fallback') return 'Дефолт'
  return role.scope === 'building' ? 'Здание' : 'Глобальная'
}

const createOpen = ref(false)
const createSubmitting = ref(false)
const createSchema = z.object({
  scope: z.enum(['building', 'global']),
  code: z.string().min(2, 'Код обязателен').regex(/^[a-z0-9._-]+$/i, 'Только латиница/цифры/._-'),
  label: z.string().min(2, 'Название обязательно')
})
type CreateState = z.infer<typeof createSchema>
const createState = reactive<CreateState>({
  scope: 'building',
  code: '',
  label: ''
})

const createScopeItems = computed(() => {
  const items = [{ label: 'Глобальная', value: 'global' as const }]
  if (buildingId.value) {
    items.unshift({ label: 'Текущее здание', value: 'building' as const })
  }
  return items
})

watch(buildingId, (next) => {
  if (!next && createState.scope === 'building') {
    createState.scope = 'global'
  }
})

function openCreate() {
  createState.scope = buildingId.value ? 'building' : 'global'
  createState.code = ''
  createState.label = ''
  createOpen.value = true
}

async function submitCreate(event?: FormSubmitEvent<CreateState>) {
  if (!event || createSubmitting.value) return

  const scope = event.data.scope
  const resolvedBuildingId = scope === 'building' ? buildingId.value : null

  if (scope === 'building' && !resolvedBuildingId) {
    toast.add({ title: 'Выберите здание', description: 'Для роли уровня "Здание" выберите активное здание.', color: 'warning' })
    return
  }

  createSubmitting.value = true
  try {
    await $fetch('/api/customer-roles', {
      method: 'POST',
      body: {
        buildingId: resolvedBuildingId,
        code: event.data.code,
        label: event.data.label
      }
    })

    toast.add({ title: 'Роль создана', color: 'success' })
    createOpen.value = false
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось создать роль',
      description: getErrorMessage(err) || 'Проверьте данные и повторите попытку.',
      color: 'error'
    })
  } finally {
    createSubmitting.value = false
  }
}

const editOpen = ref(false)
const editSubmitting = ref(false)
const editingRole = ref<CustomerRole | null>(null)
const editSchema = z.object({
  code: z.string().min(2, 'Код обязателен').regex(/^[a-z0-9._-]+$/i, 'Только латиница/цифры/._-'),
  label: z.string().min(2, 'Название обязательно')
})
type EditState = z.infer<typeof editSchema>
const editState = reactive<EditState>({
  code: '',
  label: ''
})

function canEditCode(role: CustomerRole) {
  return !isReadonlyRole(role) && !role.isSystem && role.scope === 'building'
}

function openEdit(role: CustomerRole) {
  if (isReadonlyRole(role)) return

  editingRole.value = role
  editState.code = role.code
  editState.label = role.label
  editOpen.value = true
}

async function submitEdit(event?: FormSubmitEvent<EditState>) {
  if (!event || editSubmitting.value || !editingRole.value) return

  const role = editingRole.value
  editSubmitting.value = true

  try {
    const payload: Record<string, unknown> = {
      label: event.data.label
    }

    if (canEditCode(role) && event.data.code.trim() !== role.code.trim()) {
      payload.code = event.data.code
    }

    await $fetch(`/api/customer-roles/${role.id}`, {
      method: 'PATCH',
      body: payload
    })

    toast.add({ title: 'Роль обновлена', color: 'success' })
    editOpen.value = false
    editingRole.value = null
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось обновить роль',
      description: getErrorMessage(err) || 'Проверьте данные и повторите попытку.',
      color: 'error'
    })
  } finally {
    editSubmitting.value = false
  }
}

const deleteOpen = ref(false)
const deleteSubmitting = ref(false)
const deletingRole = ref<CustomerRole | null>(null)

function openDelete(role: CustomerRole) {
  if (isReadonlyRole(role)) return
  deletingRole.value = role
  deleteOpen.value = true
}

async function confirmDelete() {
  if (!deletingRole.value || deleteSubmitting.value) return

  deleteSubmitting.value = true
  try {
    await $fetch(`/api/customer-roles/${deletingRole.value.id}`, {
      method: 'DELETE'
    })
    toast.add({ title: 'Роль удалена', color: 'success' })
    deleteOpen.value = false
    deletingRole.value = null
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось удалить роль',
      description: getErrorMessage(err) || 'Проверьте данные и повторите попытку.',
      color: 'error'
    })
  } finally {
    deleteSubmitting.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="text-sm text-muted">
      {{ activeBuilding?.name ? `Здание: ${activeBuilding.name}` : 'Здание не выбрано' }}
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <UInput
        v-model="q"
        icon="i-lucide-search"
        placeholder="Поиск ролей..."
        class="max-w-sm"
      />

      <UButton
        label="Добавить роль"
        icon="i-lucide-plus"
        color="primary"
        @click="openCreate"
      />
    </div>

    <div
      v-if="error"
      class="rounded-lg border border-error/40 bg-error/5 p-3 text-sm"
    >
      <p class="font-medium text-highlighted">
        Не удалось загрузить роли
      </p>
      <p class="text-muted">
        {{ getErrorMessage(error) || 'Проверьте API /api/customer-roles и наличие таблицы customer_roles в Postgres.' }}
      </p>
    </div>

    <div class="rounded-lg border border-default bg-elevated/30 overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="bg-elevated/50">
            <th class="px-3 py-2 text-left">
              Название
            </th>
            <th class="px-3 py-2 text-left">
              Код
            </th>
            <th class="px-3 py-2 text-left">
              Источник
            </th>
            <th class="px-3 py-2 text-right" />
          </tr>
        </thead>
        <tbody>
          <tr v-if="isLoading">
            <td class="px-3 py-3 text-muted" colspan="4">
              Загрузка...
            </td>
          </tr>

          <tr v-else-if="!filteredRoles.length">
            <td class="px-3 py-3 text-muted" colspan="4">
              Роли не найдены.
            </td>
          </tr>

          <tr
            v-for="role in filteredRoles"
            :key="role.id"
            class="border-t border-default"
            :class="!role.isActive ? 'opacity-60' : undefined"
          >
            <td class="px-3 py-2">
              <div class="flex items-center gap-2">
                <span class="font-medium text-highlighted">
                  {{ role.label }}
                </span>
                <UBadge
                  v-if="role.isSystem"
                  label="Системная"
                  color="neutral"
                  variant="subtle"
                />
              </div>
            </td>
            <td class="px-3 py-2">
              <code class="text-xs">{{ role.code }}</code>
            </td>
            <td class="px-3 py-2">
              <UBadge
                :label="scopeLabel(role)"
                color="neutral"
                variant="subtle"
              />
            </td>
            <td class="px-3 py-2 text-right">
              <div class="flex justify-end gap-2">
                <UButton
                  label="Изменить"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  :disabled="isReadonlyRole(role)"
                  @click="openEdit(role)"
                />
                <UButton
                  label="Удалить"
                  size="sm"
                  color="error"
                  variant="outline"
                  :disabled="isReadonlyRole(role)"
                  @click="openDelete(role)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal
      v-model:open="createOpen"
      title="Новая роль"
      description="Создайте роль для выбранного здания."
    >
      <template #body>
        <UForm
          :schema="createSchema"
          :state="createState"
          :on-submit="submitCreate"
          class="space-y-4"
        >
          <UFormField label="Источник" name="scope">
            <USelect
              v-model="createState.scope"
              :items="createScopeItems"
            />
          </UFormField>

          <UFormField
            label="Код"
            name="code"
            help="Используется как значение в поле role у сотрудников."
          >
            <UInput v-model="createState.code" placeholder="security" />
          </UFormField>

          <UFormField label="Название" name="label">
            <UInput v-model="createState.label" placeholder="Охрана" />
          </UFormField>

          <div class="flex justify-end gap-2">
            <UButton
              label="Отмена"
              color="neutral"
              variant="subtle"
              :disabled="createSubmitting"
              @click="createOpen = false"
            />
            <UButton
              label="Создать"
              color="primary"
              type="submit"
              :loading="createSubmitting"
            />
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      v-model:open="editOpen"
      title="Редактировать роль"
      description="Измените название роли."
    >
      <template #body>
        <UForm
          :schema="editSchema"
          :state="editState"
          :on-submit="submitEdit"
          class="space-y-4"
        >
          <UFormField label="Код" name="code">
            <UInput
              v-model="editState.code"
              :disabled="editingRole ? !canEditCode(editingRole) : true"
            />
          </UFormField>

          <UFormField label="Название" name="label">
            <UInput v-model="editState.label" />
          </UFormField>

          <div class="flex justify-end gap-2">
            <UButton
              label="Отмена"
              color="neutral"
              variant="subtle"
              :disabled="editSubmitting"
              @click="editOpen = false; editingRole = null"
            />
            <UButton
              label="Сохранить"
              color="primary"
              type="submit"
              :loading="editSubmitting"
            />
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      v-model:open="deleteOpen"
      :title="deletingRole ? `Удалить роль «${deletingRole.label}»` : 'Удалить роль'"
      description="Действие нельзя отменить."
    >
      <template #body>
        <div class="flex justify-end gap-2">
          <UButton
            label="Отмена"
            color="neutral"
            variant="subtle"
            :disabled="deleteSubmitting"
            @click="deleteOpen = false"
          />
          <UButton
            label="Удалить"
            color="error"
            variant="solid"
            :loading="deleteSubmitting"
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
