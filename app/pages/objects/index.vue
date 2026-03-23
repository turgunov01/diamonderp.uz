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
const activeBuilding = useState<{ id: number, name: string } | null>('active-building')
const activeObject = useState<{ id: number, name: string } | null>('active-object')
const activeObjectIdCookie = useCookie<number | null>('active-object-id', { default: () => null })

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

function openCreatePage() {
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

async function toggleObject(item: ObjectItem, enabled: boolean) {
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
          <UButton
            icon="i-lucide-plus"
            label="Создать объект"
            @click="openCreatePage"
          />
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
                <div class="flex justify-end">
                  <USwitch
                    :model-value="!!item.is_active"
                    @update:model-value="toggleObject(item, $event)"
                  />
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
    </template>
  </UDashboardPanel>
</template>
