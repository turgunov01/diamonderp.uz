<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { breakpointsTailwind } from '@vueuse/core'
import type { Mail } from '~/types'

const tabItems = [{
  label: 'Все',
  value: 'all'
}, {
  label: 'Непрочитанные',
  value: 'unread'
}]
const selectedTab = ref('all')

const { data: mails, status } = await useAutoRefreshFetch<Mail[]>('/api/mails', { default: () => [] })
const safeMails = computed(() => mails.value || [])
const isLoading = computed(() => status.value === 'pending' || status.value === 'idle')

// Filter mails based on the selected tab
const filteredMails = computed(() => {
  if (selectedTab.value === 'unread') {
    return safeMails.value.filter(mail => !!mail.unread)
  }

  return safeMails.value
})

const selectedMail = ref<Mail | null>(null)

const isMailPanelOpen = computed({
  get() {
    return !!selectedMail.value
  },
  set(value: boolean) {
    if (!value) {
      selectedMail.value = null
    }
  }
})

// Reset selected mail if it's not in the filtered mails
watch(filteredMails, () => {
  if (!filteredMails.value.find(mail => mail.id === selectedMail.value?.id)) {
    selectedMail.value = null
  }
})

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('lg')
</script>

<template>
  <UDashboardPanel
    id="inbox-1"
    :default-size="25"
    :min-size="20"
    :max-size="30"
    resizable
  >
    <UDashboardNavbar title="Входящие">
      <template #leading>
        <UDashboardSidebarCollapse />
      </template>
      <template #trailing>
        <UBadge :label="isLoading ? '...' : filteredMails.length" variant="subtle" />
      </template>

      <template #right>
        <UTabs
          v-model="selectedTab"
          :items="tabItems"
          :content="false"
          size="xs"
        />
      </template>
    </UDashboardNavbar>
    <div v-if="isLoading" class="space-y-3 px-3 py-3">
      <div
        v-for="n in 7"
        :key="`mail-skeleton-${n}`"
        class="flex items-center gap-3 rounded-lg border border-default/60 px-3 py-3 animate-pulse"
      >
        <div class="h-10 w-10 rounded-full bg-default/60" />
        <div class="min-w-0 flex-1 space-y-2">
          <div class="flex items-center justify-between gap-3">
            <div class="h-4 w-28 rounded bg-default/70" />
            <div class="h-3 w-12 rounded bg-default/50" />
          </div>
          <div class="h-3 w-3/4 rounded bg-default/50" />
        </div>
      </div>
    </div>

    <InboxList v-else v-model="selectedMail" :mails="filteredMails" />
  </UDashboardPanel>

  <InboxMail v-if="selectedMail" :mail="selectedMail" @close="selectedMail = null" />
  <div v-else-if="isLoading" class="hidden lg:flex flex-1 items-center justify-center px-8">
    <div class="w-full max-w-2xl space-y-4 animate-pulse">
      <div class="h-8 w-48 rounded bg-default/60" />
      <div class="h-28 rounded-2xl bg-default/40" />
      <div class="h-28 rounded-2xl bg-default/40" />
      <div class="h-28 rounded-2xl bg-default/40" />
    </div>
  </div>
  <div v-else class="hidden lg:flex flex-1 items-center justify-center">
    <UIcon name="i-lucide-inbox" class="size-32 text-dimmed" />
  </div>

  <ClientOnly>
    <USlideover v-if="isMobile" v-model:open="isMailPanelOpen">
      <template #content>
        <InboxMail v-if="selectedMail" :mail="selectedMail" @close="selectedMail = null" />
      </template>
    </USlideover>
  </ClientOnly>
</template>
