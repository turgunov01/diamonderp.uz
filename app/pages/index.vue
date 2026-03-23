<script setup lang="ts">
import { sub } from 'date-fns'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Period, Range } from '~/types'

const { isNotificationsSlideoverOpen } = useDashboard()

const items = [[{
  label: 'Новая заявка',
  icon: 'i-lucide-send',
  to: '/inbox'
}, {
  label: 'Новый сотрудник',
  icon: 'i-lucide-user-plus',
  to: '/hr'
}]] satisfies DropdownMenuItem[][]

const rangeState = useState<{ start: number, end: number }>('home-range', () => {
  const end = new Date()

  return {
    start: sub(end, { days: 14 }).getTime(),
    end: end.getTime()
  }
})

const range = computed<Range>({
  get: () => ({
    start: new Date(rangeState.value.start),
    end: new Date(rangeState.value.end)
  }),
  set: (value) => {
    rangeState.value = {
      start: value.start.getTime(),
      end: value.end.getTime()
    }
  }
})

const period = ref<Period>('daily')
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Home" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UTooltip text="Уведомления" :shortcuts="['N']">
            <UButton
              color="neutral"
              variant="ghost"
              square
              @click="isNotificationsSlideoverOpen = true"
            >
              <UChip color="error" inset>
                <UIcon name="i-lucide-bell" class="size-5 shrink-0" />
              </UChip>
            </UButton>
          </UTooltip>

          <UDropdownMenu :items="items">
            <UButton icon="i-lucide-plus" size="md" class="rounded-full" />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <HomeDateRangePicker v-model="range" class="-ms-1" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <HomeStats :period="period" :range="range" />
      <HomeChart :period="period" :range="range" />
    </template>
  </UDashboardPanel>
</template>
