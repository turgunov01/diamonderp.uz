<script setup lang="ts">
import { formatTimeAgo } from '@vueuse/core'
import type { Notification } from '~/types'
import { usePersistentNotifications } from '~/composables/usePersistentNotifications'

const { isNotificationsSlideoverOpen } = useDashboard()

const { data: notifications, status } = await useFetch<Notification[]>('/api/notifications', {
  default: () => []
})
const isMounted = ref(false)
const { localNotifications } = usePersistentNotifications()

const combinedNotifications = computed(() => {
  const remote = notifications.value || []
  const local = localNotifications.value || []
  return [...local, ...remote].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
})

onMounted(() => {
  isMounted.value = true
})

function formatNotificationDate(value: string) {
  const date = new Date(value)

  if (!isMounted.value) {
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return formatTimeAgo(date)
}
</script>

<template>
  <USlideover
    v-model:open="isNotificationsSlideoverOpen"
    title="Уведомления"
  >
    <template #body>
      <div v-if="status === 'pending' || status === 'idle'" class="space-y-3">
        <div
          v-for="n in 5"
          :key="`notification-skeleton-${n}`"
          class="flex items-center gap-3 rounded-md px-3 py-2.5 animate-pulse"
        >
          <div class="h-10 w-10 rounded-full bg-default/60" />
          <div class="min-w-0 flex-1 space-y-2">
            <div class="flex items-center justify-between gap-3">
              <div class="h-4 w-28 rounded bg-default/70" />
              <div class="h-3 w-16 rounded bg-default/50" />
            </div>
            <div class="h-3 w-3/4 rounded bg-default/50" />
          </div>
        </div>
      </div>

      <NuxtLink
        v-for="notification in combinedNotifications"
        :key="notification.id"
        :to="notification.id > 0 ? `/inbox?id=${notification.id}` : undefined"
        class="px-3 py-2.5 rounded-md hover:bg-elevated/50 flex items-center gap-3 relative -mx-3 first:-mt-3 last:-mb-3"
      >
        <UChip
          color="error"
          :show="!!notification.unread"
          inset
        >
          <UAvatar
            v-bind="notification.sender.avatar"
            :alt="notification.sender.name"
            size="md"
          />
        </UChip>

        <div class="text-sm flex-1">
          <p class="flex items-center justify-between">
            <span class="text-highlighted font-medium">{{ notification.sender.name }}</span>

            <time
              :datetime="notification.date"
              class="text-muted text-xs"
              v-text="formatNotificationDate(notification.date)"
            />
          </p>

          <p class="text-dimmed">
            {{ notification.body }}
          </p>
        </div>
      </NuxtLink>
    </template>
  </USlideover>
</template>
