<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

type BuildingItem = {
  id: number
  name: string
  logo?: string | null
  description?: string | null
}

defineProps<{
  collapsed?: boolean
}>()

const router = useRouter()
const toast = useToast()
const creating = ref(false)
const createBuildingOpen = ref(false)
const activeBuilding = useState<BuildingItem | null>('active-building', () => null)
const BUILDING_NAME_MAX_LENGTH = 40

const form = reactive({
  name: '',
  logo: '',
  description: ''
})

const { data: buildings, refresh } = await useFetch<BuildingItem[]>('/api/buildings', {
  default: () => []
})

const selectedBuilding = computed(() => activeBuilding.value || buildings.value[0] || null)

function resetForm() {
  form.name = ''
  form.logo = ''
  form.description = ''
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    return err.data?.statusMessage || err.message
  }

  return undefined
}

function limitBuildingName(name: string) {
  const normalized = name.trim()

  if (normalized.length <= BUILDING_NAME_MAX_LENGTH) {
    return normalized
  }

  return `${normalized.slice(0, BUILDING_NAME_MAX_LENGTH - 1)}…`
}

async function createBuilding() {
  if (creating.value) {
    return
  }

  if (!form.name.trim()) {
    toast.add({
      title: 'Название здания обязательно',
      color: 'warning'
    })
    return
  }

  creating.value = true

  try {
    const created = await $fetch<BuildingItem>('/api/buildings', {
      method: 'POST',
      body: {
        name: form.name.trim().slice(0, BUILDING_NAME_MAX_LENGTH),
        logo: form.logo,
        description: form.description
      }
    })

    await refresh()
    await refreshNuxtData('/api/buildings')
    activeBuilding.value = created
    createBuildingOpen.value = false
    resetForm()

    toast.add({
      title: 'Здание создано',
      description: created.name,
      color: 'success'
    })
  } catch (error: unknown) {
    toast.add({
      title: 'Не удалось создать здание',
      description: getErrorMessage(error) || 'Проверьте данные здания и повторите попытку.',
      color: 'error'
    })
  } finally {
    creating.value = false
  }
}

const items = computed<DropdownMenuItem[][]>(() => {
  const buildingItems = (buildings.value || []).map(building => ({
    label: limitBuildingName(building.name),
    avatar: building.logo
      ? {
          src: building.logo,
          alt: building.name
        }
      : undefined,
    onSelect() {
      activeBuilding.value = building
    }
  }))

  return [buildingItems, [{
    label: 'Создать здание',
    icon: 'i-lucide-building-2',
    onSelect() {
      createBuildingOpen.value = true
    }
  }, {
    label: 'Создать объект',
    icon: 'i-lucide-circle-plus',
    onSelect() {
      router.push('/objects/create')
    }
  }, {
    label: 'Мои объекты',
    icon: 'i-lucide-list',
    onSelect() {
      router.push('/objects')
    }
  }]]
})
</script>

<template>
  <div class="space-y-2">
    <UDropdownMenu
      :items="items"
      :content="{ align: 'center', collisionPadding: 12 }"
      :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
    >
      <UButton
        :label="collapsed ? undefined : limitBuildingName(selectedBuilding?.name || 'Выбрать здание')"
        :avatar="selectedBuilding?.logo ? { src: selectedBuilding.logo, alt: selectedBuilding.name } : undefined"
        :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
        color="neutral"
        variant="ghost"
        block
        :square="collapsed"
        class="data-[state=open]:bg-elevated"
        :class="[!collapsed && 'py-2']"
        :ui="{ trailingIcon: 'text-dimmed' }"
      />
    </UDropdownMenu>

    <UModal
      v-model:open="createBuildingOpen"
      title="Создать здание"
      description="Добавьте здание и используйте его как верхний уровень рабочего пространства."
    >
      <template #body>
        <div class="space-y-4">
          <UFormField label="Название" required>
            <UInput
              v-model="form.name"
              class="w-full"
              :maxlength="BUILDING_NAME_MAX_LENGTH"
              placeholder="Ташкент Сити Молл"
            />
          </UFormField>

          <UFormField label="URL логотипа">
            <UInput
              v-model="form.logo"
              class="w-full"
              placeholder="https://..."
            />
          </UFormField>

          <UFormField label="Описание">
            <UTextarea
              v-model="form.description"
              class="w-full"
              :rows="3"
              placeholder="Краткое описание здания"
            />
          </UFormField>

          <div class="flex justify-end gap-2">
            <UButton
              label="Отмена"
              color="neutral"
              variant="subtle"
              :disabled="creating"
              @click="createBuildingOpen = false"
            />
            <UButton
              label="Создать"
              :loading="creating"
              @click="createBuilding"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
