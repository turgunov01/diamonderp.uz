<script setup lang="ts">
import type { Member } from '~/types'

const { data: members, status } = await useAutoRefreshFetch<Member[]>('/api/members', { default: () => [] })

const q = ref('')
const safeMembers = computed(() => members.value || [])
const isLoading = computed(() => status.value === 'pending' || status.value === 'idle')

const filteredMembers = computed(() => {
  return safeMembers.value.filter((member) => {
    return member.name.search(new RegExp(q.value, 'i')) !== -1 || member.username.search(new RegExp(q.value, 'i')) !== -1
  })
})
</script>

<template>
  <div>
    <UPageCard
      title="Пользователи"
      description="Приглашайте новых пользователей по адресу электронной почты."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <UButton
        label="Пригласить"
        color="neutral"
        class="w-fit lg:ms-auto"
      />
    </UPageCard>

    <UPageCard variant="subtle" :ui="{ container: 'p-0 sm:p-0 gap-y-0', wrapper: 'items-stretch', header: 'p-4 mb-0 border-b border-default' }">
      <template #header>
        <UInput
          v-model="q"
          icon="i-lucide-search"
          placeholder="Поиск пользователей"
          autofocus
          class="w-full"
        />
      </template>

      <div v-if="isLoading" class="divide-y divide-default">
        <div
          v-for="n in 6"
          :key="`member-skeleton-${n}`"
          class="flex items-center gap-3 px-4 py-4 animate-pulse"
        >
          <div class="h-10 w-10 rounded-full bg-default/60" />
          <div class="min-w-0 flex-1 space-y-2">
            <div class="h-4 w-40 rounded bg-default/70" />
            <div class="h-3 w-28 rounded bg-default/50" />
          </div>
        </div>
      </div>

      <SettingsMembersList v-else :members="filteredMembers" />
    </UPageCard>
  </div>
</template>
