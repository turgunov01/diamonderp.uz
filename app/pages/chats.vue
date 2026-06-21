<script setup lang="ts">
type ActiveBuilding = {
  id: number
  name: string
}

type ObjectItem = {
  id: number
  name: string
}

interface ChatItem {
  id: number
  title: string
  isGroup: boolean
  updatedAt: string
  objectId?: number | null
  objectName?: string
  tgChatId?: number
  tgType?: string
  lastMessage?: string
  lastTime?: string
  unread?: number
}

interface ChatMessage {
  id: number | string
  authorId: string
  text: string
  createdAt: string
  direction: 'in' | 'out'
  status: 'pending' | 'sent' | 'delivered' | 'error'
  imageUrl?: string
  mediaKind?: 'image' | 'video'
}

interface ChatDetail {
  id: number
  title: string
  isGroup: boolean
  updatedAt: string
  objectId?: number | null
  messages: ChatMessage[]
}

const toast = useToast()

const activeBuilding = useState<ActiveBuilding | null>('active-building', () => null)

const search = ref('')
const selectedChatId = ref<number | null>(null)
const messageText = ref('')
const newChatOpen = ref(false)
const newChatTitle = ref('')
const creatingChat = ref(false)
const sendingMessage = ref(false)
const deletingChat = ref(false)
const contextMenu = reactive({
  open: false,
  chatId: null as number | null,
  x: 0,
  y: 0
})
const messagesContainer = ref<HTMLElement | null>(null)
const stream = ref<EventSource | null>(null)
const streamReconnect = ref<ReturnType<typeof setTimeout> | null>(null)
const refreshTimer = ref<ReturnType<typeof setInterval> | null>(null)
const chatListTimer = ref<ReturnType<typeof setInterval> | null>(null)
const imageRequested = reactive<Record<string | number, boolean>>({})
const imageLoaded = reactive<Record<string | number, boolean>>({})
const previewSrc = ref<string | null>(null)
const previewOpen = ref(false)

const buildingId = computed(() => activeBuilding.value?.id ?? null)

const {
  data: objects,
  status: objectsStatus
} = await useAutoRefreshAsyncData<ObjectItem[]>(
  'chat-objects-flat',
  () => {
    if (!buildingId.value) {
      return Promise.resolve([])
    }

    return $fetch('/api/objects', {
      query: {
        buildingId: buildingId.value
      }
    })
  },
  {
    default: () => [],
    watch: [buildingId]
  }
)

const defaultObjectId = computed(() => objects.value?.[0]?.id ?? null)
const isObjectsLoading = computed(() => objectsStatus.value === 'pending')

const {
  data: chatList,
  error: chatListError,
  status: chatListStatus,
  refresh: refreshChats
} = await useAutoRefreshAsyncData<ChatItem[]>(
  'chats-list',
  () => {
    if (!buildingId.value) {
      return Promise.resolve([])
    }

    return $fetch('/api/chats', {
      query: { buildingId: buildingId.value }
    })
  },
  { default: () => [], watch: [buildingId] }
)

const safeChatList = computed(() => chatList.value || [])
const isChatListLoading = computed(() => chatListStatus.value === 'pending' || chatListStatus.value === 'idle')

watch(chatListError, (value) => {
  if (!value) {
    return
  }

  toast.add({
    title: 'Не удалось загрузить чаты',
    description: value.statusMessage || 'Проверьте интеграцию Telegram и API чатов.',
    color: 'error'
  })
}, { immediate: true })

const filteredChats = computed(() => {
  const normalizedSearch = search.value.toLowerCase().trim()

  return safeChatList.value
    .filter(chat => {
      if (!normalizedSearch) return true
      const titleMatch = chat.title.toLowerCase().includes(normalizedSearch)
      const objectMatch = chat.objectName?.toLowerCase().includes(normalizedSearch)
      return titleMatch || objectMatch
    })
})

watch(filteredChats, (list) => {
  if (!list.length) {
    selectedChatId.value = null
    return
  }

  if (!selectedChatId.value || !list.some(chat => chat.id === selectedChatId.value)) {
    selectedChatId.value = list[0]?.id ?? null
  }
}, { immediate: true })

const selectedChatMeta = computed(() => safeChatList.value.find(chat => chat.id === selectedChatId.value) || null)

watch(buildingId, () => {
  selectedChatId.value = null
  messageText.value = ''
  if (chatListTimer.value) {
    clearInterval(chatListTimer.value)
    chatListTimer.value = null
  }
})

const {
  data: selectedConversation,
  status: chatDetailStatus,
  refresh: refreshConversation
} = await useAutoRefreshAsyncData<ChatDetail | null>(
  'chat-detail',
  () => {
    if (!selectedChatId.value) {
      return Promise.resolve(null)
    }

    return $fetch(`/api/chats/${selectedChatId.value}`)
  },
  {
    default: () => null,
    watch: [selectedChatId]
  }
)

const isChatDetailLoading = computed(() =>
  Boolean(selectedChatId.value) && (chatDetailStatus.value === 'pending' || chatDetailStatus.value === 'idle')
)

function closeStream() {
  if (streamReconnect.value) {
    clearTimeout(streamReconnect.value)
    streamReconnect.value = null
  }

  stream.value?.close()
  stream.value = null
}

function updateChatListMeta(chatId: number, message: ChatMessage) {
  const entry = safeChatList.value.find(chat => chat.id === chatId)
  if (!entry) return

  entry.lastMessage = message.imageUrl ? '📷 Фото' : message.text
  entry.lastTime = message.createdAt
  entry.updatedAt = message.createdAt
}

function upsertMessage(chatId: number, incoming: ChatMessage) {
  incoming = normalizeMessage(incoming)

  if (selectedConversation.value?.id !== chatId) {
    // Update list meta even if another chat is open
    updateChatListMeta(chatId, incoming)
    return
  }

  const messages = selectedConversation.value.messages

  const pendingIdx = messages.findIndex(msg =>
    msg.status === 'pending' &&
    msg.direction === incoming.direction &&
    msg.text === incoming.text
  )

  if (pendingIdx !== -1) {
    messages[pendingIdx] = incoming
  } else if (!messages.some(msg => msg.id === incoming.id)) {
    messages.push(incoming)
  }

  updateChatListMeta(chatId, incoming)
}

function openStream(chatId: number) {
  closeStream()
  const since = selectedConversation.value?.messages?.[selectedConversation.value.messages.length - 1]?.createdAt
  const url = since
    ? `/api/chats/${chatId}/stream?since=${encodeURIComponent(since)}`
    : `/api/chats/${chatId}/stream`

  const es = new EventSource(url)

  es.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data)
      if (payload?.type === 'message' && payload.message) {
        upsertMessage(payload.chatId, payload.message as ChatMessage)
        scrollToBottomSoon()
      }
    } catch (err) {
      console.error('Stream parse error', err)
    }
  }

  es.onerror = () => {
    es.close()
    streamReconnect.value = setTimeout(() => openStream(chatId), 2000)
  }

  stream.value = es
}

function mergeChatDetail(detail: ChatDetail) {
  if (!detail) return

  if (!selectedConversation.value || selectedConversation.value.id !== detail.id) {
    selectedConversation.value = {
      ...detail,
      messages: detail.messages.map(normalizeMessage)
    }
    return
  }

  const existing = selectedConversation.value.messages
  const byId = new Map<string | number, ChatMessage>()
  for (const msg of existing) {
    byId.set(msg.id, msg)
  }

  for (const incomingRaw of detail.messages) {
    const incoming = normalizeMessage(incomingRaw)
    const prev = byId.get(incoming.id)
    if (prev) {
      byId.set(incoming.id, { ...prev, ...incoming })
    } else {
      byId.set(incoming.id, incoming)
    }
  }

  const merged = Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const latestExistingId = selectedConversation.value.messages[selectedConversation.value.messages.length - 1]?.id
  const latestMergedId = merged[merged.length - 1]?.id
  if (latestExistingId === latestMergedId && selectedConversation.value.updatedAt === detail.updatedAt) {
    return
  }

  selectedConversation.value = {
    ...selectedConversation.value,
    ...detail,
    messages: merged
  }

  const latest = merged[merged.length - 1]
  if (latest) {
    updateChatListMeta(detail.id, latest)
  }
}

async function fetchAndMergeSelectedConversation() {
  if (!selectedChatId.value) return
  try {
    const detail = await $fetch<ChatDetail>(`/api/chats/${selectedChatId.value}`)
    mergeChatDetail(detail)
  } catch (err) {
    console.error('refresh conversation failed', err)
  }
}

async function fetchAndMergeChatList() {
  if (!buildingId.value) return
  try {
    const rows = await $fetch<ChatItem[]>('/api/chats', { query: { buildingId: buildingId.value } })
    const current = new Map(safeChatList.value.map(item => [item.id, item]))
    const merged: ChatItem[] = []

    for (const row of rows) {
      const existing = current.get(row.id)
      const hasImage = detectImageUrl(row.lastMessage)
      const displayLastMessage = hasImage ? '📷 Фото' : row.lastMessage
      const keepExisting = existing && existing.updatedAt === row.updatedAt
      merged.push({
        ...existing,
        ...row,
        lastMessage: keepExisting ? existing!.lastMessage : displayLastMessage,
        lastTime: row.lastTime || row.updatedAt
      })
    }

    chatList.value = merged
  } catch (err) {
    console.error('refresh chat list failed', err)
  }
}

function scrollToBottomSoon() {
  if (!process.client) return
  requestAnimationFrame(() => {
    const el = messagesContainer.value
    if (!el) return
    el.scrollTop = el.scrollHeight
  })
}

if (process.client) {
  watch(selectedChatId, (id) => {
    closeStream()
    if (refreshTimer.value) {
      clearInterval(refreshTimer.value)
    }
    if (id) {
      openStream(id)
      refreshTimer.value = setInterval(() => {
        fetchAndMergeSelectedConversation()
      }, 1000)
      fetchAndMergeSelectedConversation()
    }
  })

  watch(buildingId, () => {
    if (chatListTimer.value) {
      clearInterval(chatListTimer.value)
      chatListTimer.value = null
    }
    if (buildingId.value) {
      fetchAndMergeChatList()
      chatListTimer.value = setInterval(() => {
        fetchAndMergeChatList()
      }, 1000)
    }
  }, { immediate: true })

  onBeforeUnmount(() => {
    closeStream()
    if (refreshTimer.value) {
      clearInterval(refreshTimer.value)
    }
    if (chatListTimer.value) {
      clearInterval(chatListTimer.value)
    }
  })

  watch(() => selectedConversation.value?.messages.length, () => {
    scrollToBottomSoon()
  })

  watch(selectedConversation, () => {
    scrollToBottomSoon()
  })
}

function formatListTime(value?: string) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()

  return date.toLocaleString('ru-RU', sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit' })
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function detectImageUrl(text?: string) {
  if (!text) return undefined
  const urlMatch = text.match(/https?:\/\/\S+/)
  if (!urlMatch) return undefined
  const url = urlMatch[0]
  const lower = url.toLowerCase()
  const hasImgExt = /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif)$/i.test(lower)
  const hasVideoExt = /\.(mp4|webm)$/i.test(lower)
  const isTgFile = lower.includes('/file/bot')
  return (hasImgExt || hasVideoExt || isTgFile) ? url : undefined
}

function normalizeMessage(message: ChatMessage): ChatMessage {
  const detected = detectImageUrl(message.text)
  const isVideo = detected ? /\.(mp4|webm|gif)$/i.test(detected.toLowerCase()) : false
  return {
    ...message,
    imageUrl: message.imageUrl || detected,
    mediaKind: isVideo ? 'video' : 'image'
  }
}

function getDisplayName(message: ChatMessage) {
  if (message.authorId === 'dashboard-user') return 'Вы'
  if (/^\d+$/.test(message.authorId)) return `Пользователь ${message.authorId}`
  return message.authorId || 'Неизвестно'
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'U'
  const firstPart = parts[0] || ''
  const first = firstPart[0] || ''
  const second = parts[1]?.[0] || firstPart[1] || ''
  return (first + second).toUpperCase()
}

function openPreview(src: string) {
  previewSrc.value = src
  previewOpen.value = true
}

function getImageUrl(message: ChatMessage) {
  return message.imageUrl || detectImageUrl(message.text)
}

function handleVideoLoaded(e: Event, id: string | number) {
  const el = e.target as HTMLVideoElement
  imageLoaded[id] = true
  try {
    el.play()
  } catch {}
}

function isVideoMedia(message: ChatMessage) {
  const url = getImageUrl(message)
  if (!url) return false
  const clean = (url.split('?')[0] || '').toLowerCase()
  return /\.(mp4|webm|gif)$/.test(clean) || message.mediaKind === 'video'
}

function getErrorMessage(fetchError: unknown) {
  if (fetchError && typeof fetchError === 'object') {
    const err = fetchError as { data?: { statusMessage?: string }, message?: string }
    return err.data?.statusMessage || err.message
  }

  return undefined
}

async function sendMessage() {

  if (!selectedConversation.value || sendingMessage.value) {
    return
  }

  const content = messageText.value.trim()
  if (!content) {
    return
  }

  messageText.value = ''

  sendingMessage.value = true

  const tempId = `temp-${Date.now()}`
  const optimistic: ChatMessage = {
    id: tempId,
    authorId: 'dashboard-user',
    text: content,
    createdAt: new Date().toISOString(),
    direction: 'out',
    status: 'pending'
  }
  selectedConversation.value.messages.push(optimistic)
  updateChatListMeta(selectedConversation.value.id, optimistic)
  scrollToBottomSoon()

  try {
    const saved = await $fetch<ChatMessage>(`/api/chats/${selectedConversation.value.id}/messages`, {
      method: 'POST',
      body: {
        authorId: 'dashboard-user',
        content
      }
    })

    const idx = selectedConversation.value.messages.findIndex(msg => msg.id === tempId)
    if (idx !== -1) {
      selectedConversation.value.messages[idx] = saved
    } else {
      selectedConversation.value.messages.push(saved)
    }
    updateChatListMeta(selectedConversation.value.id, saved)
  } catch (fetchError: unknown) {
    const pending = selectedConversation.value.messages.find(msg => msg.id === tempId)
    if (pending) {
      pending.status = 'error'
    }
    messageText.value = ''
    toast.add({
      title: 'Не удалось отправить сообщение',
      description: getErrorMessage(fetchError) || 'Повторите попытку.',
      color: 'error'
    })
  } finally {
    messageText.value = ''
    sendingMessage.value = false
  }
}

async function createChat() {
  if (creatingChat.value) {
    return
  }

  if (!buildingId.value) {
    toast.add({
      title: 'Выберите здание',
      description: 'Создание чата доступно после выбора здания в Team menu.',
      color: 'warning'
    })
    return
  }

  const title = newChatTitle.value.trim()
  if (!title) {
    toast.add({
      title: 'Введите название чата',
      color: 'warning'
    })
    return
  }

  creatingChat.value = true

  try {
    const created = await $fetch<{ id: number }>('/api/chats', {
      method: 'POST',
      body: {
        title,
        isGroup: true,
        objectId: defaultObjectId.value || undefined
      }
    })

    newChatTitle.value = ''
    newChatOpen.value = false
    await refreshChats()
    selectedChatId.value = created.id
  } catch (fetchError: unknown) {
    toast.add({
      title: 'Не удалось создать чат',
      description: getErrorMessage(fetchError) || 'Повторите попытку.',
      color: 'error'
    })
  } finally {
    creatingChat.value = false
  }
}

function openContextMenu(event: MouseEvent, chatId: number) {
  event.preventDefault()
  contextMenu.chatId = chatId
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.open = true
}

function closeContextMenu() {
  contextMenu.open = false
  contextMenu.chatId = null
}

async function deleteChat(chatId?: number | null) {
  const targetId = chatId ?? selectedChatId.value
  const numericId = Number(targetId)

  if (!Number.isInteger(numericId) || numericId <= 0 || deletingChat.value) {
    return
  }

  deletingChat.value = true

  try {
    await $fetch(`/api/chats/${numericId}`, {
      method: 'DELETE'
    })

    toast.add({
      title: 'Чат удалён',
      color: 'success'
    })

    if (selectedChatId.value === numericId) {
      selectedChatId.value = null
    }
    closeContextMenu()
    chatList.value = safeChatList.value.filter(chat => chat.id !== numericId)
  } catch (err) {
    toast.add({
      title: 'Не удалось удалить чат',
      description: getErrorMessage(err) || 'Попробуйте ещё раз.',
      color: 'error'
    })
  } finally {
    deletingChat.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="chats">
    <template #header>
      <UDashboardNavbar title="Чаты">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UBadge v-if="activeBuilding" :label="activeBuilding.name" color="neutral" variant="subtle" />
          <UButton v-if="selectedChatId" icon="i-lucide-trash" color="error" variant="ghost" :loading="deletingChat"
            @click="deleteChat()" />
          <UButton icon="i-lucide-plus" label="Новый чат" :disabled="!activeBuilding" @click="newChatOpen = true" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UAlert v-if="!activeBuilding" color="warning" variant="subtle" title="Здание не выбрано"
          description="Выберите здание в Team menu, чтобы увидеть связанные с ним чаты." />

        <div class="grid gap-4 lg:grid-cols-[360px_1fr] h-[calc(100vh-160px)]">
          <div class="rounded-xl border border-default bg-elevated/50 flex flex-col overflow-hidden">
            <div class="p-3 space-y-3" @click="closeContextMenu">
              <UInput v-model="search" icon="i-lucide-search" placeholder="Поиск" size="sm" />

              <p class="text-xs text-muted">
                Всего чатов: {{ isChatListLoading ? '—' : safeChatList.length }}
              </p>
            </div>

            <div v-if="isChatListLoading" class="divide-y divide-default overflow-y-auto">
              <div v-for="n in 8" :key="`chat-skeleton-${n}`" class="px-3 py-3 flex gap-3 animate-pulse">
                <div class="h-10 w-10 rounded-full bg-default/70" />
                <div class="min-w-0 flex-1 space-y-2">
                  <div class="flex items-center justify-between gap-3">
                    <div class="h-4 w-3/4 bg-default/70 rounded" />
                    <div class="h-3 w-14 bg-default/60 rounded" />
                  </div>
                  <div class="h-3 w-1/2 bg-default/50 rounded" />
                  <div class="h-3 w-1/3 bg-default/40 rounded" />
                </div>
              </div>
            </div>

            <div v-else class="divide-y divide-default overflow-y-auto">
              <button v-for="chat in filteredChats" :key="chat.id"
                class="w-full text-left px-3 py-3 hover:bg-elevated/70 transition flex gap-3"
                :class="chat.id === selectedChatId ? 'bg-primary/10 ring-1 ring-primary/30' : ''"
                @click="selectedChatId = chat.id; closeContextMenu()" @contextmenu="openContextMenu($event, chat.id)">
                <UAvatar :alt="chat.title" :text="chat.title.slice(0, 1).toUpperCase()" size="md" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-3">
                    <p class="font-medium truncate">
                      {{ chat.title }}
                    </p>
                    <span class="text-xs text-muted">{{ formatListTime(chat.lastTime || chat.updatedAt) }}</span>
                  </div>
                  <div class="flex items-center gap-2 text-[11px] text-muted mt-0.5">
                    <UBadge v-if="chat.objectName" :label="chat.objectName" color="neutral" variant="subtle" />
                  </div>
                  <p class="text-sm text-muted truncate">
                    {{ chat.lastMessage || 'Сообщений пока нет' }}
                  </p>
                </div>
                <UBadge v-if="chat.unread" :label="chat.unread" color="primary" variant="solid" class="self-center" />
              </button>

              <div v-if="!filteredChats.length && !isChatListLoading" class="px-4 py-6 text-sm text-muted">
                Чатов пока нет.
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-default bg-elevated/30 flex flex-col overflow-hidden">
            <div class="px-4 py-3 flex items-center gap-3 border-b border-default">
              <UAvatar v-if="selectedConversation" :alt="selectedConversation.title"
                :text="selectedConversation.title.slice(0, 1).toUpperCase()" size="md" />
              <div class="min-w-0 flex-1">
                <p class="font-semibold truncate">
                  {{ selectedConversation?.title || 'Выберите чат' }}
                </p>
                <p class="text-xs text-muted flex items-center gap-2">
                  <span>
                    {{ selectedConversation?.isGroup ? 'Групповой чат' : 'Личный чат' }}
                  </span>
                  <UBadge v-if="selectedChatMeta?.objectName" :label="selectedChatMeta.objectName" color="neutral"
                    variant="subtle" />
                </p>
              </div>
              <UButton v-if="selectedChatId" icon="i-lucide-trash" color="error" variant="ghost" size="sm"
                :loading="deletingChat" @click="deleteChat(selectedChatId)" />
            </div>

            <div ref="messagesContainer"
              class="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-[radial-gradient(circle_at_10%_20%,rgba(255,255,255,0.05),transparent_25%),radial-gradient(circle_at_90%_10%,rgba(255,255,255,0.05),transparent_20%)]">
              <template v-if="isChatDetailLoading">
                <div v-for="n in 6" :key="`msg-skeleton-${n}`" class="flex"
                  :class="n % 2 === 0 ? 'justify-end' : 'justify-start'">
                  <div class="max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm animate-pulse" :class="n % 2 === 0
                    ? 'bg-primary/50 text-white rounded-br-none'
                    : 'bg-elevated text-highlighted rounded-bl-none border border-default/60'">
                    <div class="h-3 w-32 bg-default/60 rounded" />
                    <div class="h-3 w-24 bg-default/50 rounded mt-1" />
                  </div>
                </div>
              </template>
              <template v-else>
                <div v-for="msg in selectedConversation?.messages || []" :key="msg.id" class="flex items-start gap-2"
                  :class="msg.direction === 'out' ? 'justify-end text-right' : 'justify-start text-left'">
                  <UAvatar v-if="msg.direction !== 'out'" :alt="getDisplayName(msg)"
                    :text="getInitials(getDisplayName(msg))" size="md" />
                  <div class="relative max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm" :class="msg.direction === 'out'
                    ? [
                      'bg-primary text-white rounded-br-none',
                      msg.status === 'pending' ? 'opacity-70' : 'opacity-100',
                      msg.status === 'error' ? 'bg-error text-white' : ''
                    ] : [
                      'bg-elevated text-highlighted rounded-bl-none border border-default/60'
                    ]">
                    <div class="flex items-center justify-between gap-2 text-[12px] mb-1">
                      <span class="font-semibold" :class="msg.direction === 'out' ? 'text-white' : 'text-emerald-700'">
                        {{ getDisplayName(msg) }}
                      </span>
                      <span class="text-[11px]" :class="msg.direction === 'out' ? 'text-white/80' : 'text-muted'">
                        {{ formatMessageTime(msg.createdAt) }}
                      </span>
                    </div>
                    <div v-if="getImageUrl(msg)" class="mt-1">
                      <div
                        class="relative overflow-hidden rounded-xl bg-default/30 cursor-pointer w-[300px]"
                        :class="msg.direction === 'out' ? 'border border-white/10' : 'border border-default/60'"
                        @click="imageRequested[msg.id] = true"
                      >
                        <template v-if="!imageRequested[msg.id]">
                          <div
                            class="absolute inset-0 backdrop-blur-md flex items-center justify-center"
                            :style="`background-image:url('${getImageUrl(msg)}'); background-size:cover; background-position:center; filter: blur(12px); transform: scale(1.05);`"
                          />
                          <div class="relative h-[300px] flex items-center justify-center">
                            <div class="h-12 w-12 rounded-full bg-black/60 text-white flex items-center justify-center">
                              <span class="i-lucide-download" />
                            </div>
                          </div>
                        </template>
                        <template v-else>
                          <div
                            v-if="!imageLoaded[msg.id]"
                            class="absolute inset-0 backdrop-blur-md"
                            :style="`background-image:url('${getImageUrl(msg)}'); background-size:cover; background-position:center; filter: blur(12px); transform: scale(1.05);`"
                          />
                          <video
                            v-if="isVideoMedia(msg)"
                            :src="getImageUrl(msg)"
                            class="relative max-h-[300px] w-[300px] h-[300px] object-contain transition-opacity duration-300 cursor-pointer"
                            :class="imageLoaded[msg.id] ? 'opacity-100' : 'opacity-0'"
                            playsinline
                            autoplay
                            loop
                            muted
                            preload="auto"
                            @loadeddata="handleVideoLoaded($event, msg.id)"
                            @canplay="handleVideoLoaded($event, msg.id)"
                            @click.stop="imageLoaded[msg.id] && openPreview(getImageUrl(msg)!)"
                          />
                          <img
                            v-else
                            :src="getImageUrl(msg)"
                            class="relative max-h-[300px] w-[300px] h-[300px] object-contain transition-opacity duration-300 cursor-pointer"
                            :class="imageLoaded[msg.id] ? 'opacity-100' : 'opacity-0'"
                            loading="lazy"
                            @load="imageLoaded[msg.id] = true"
                            @click.stop="imageLoaded[msg.id] && openPreview(getImageUrl(msg)!)"
                          >
                        </template>
                      </div>
                    </div>
                    <p
                      v-if="!getImageUrl(msg) || msg.text !== getImageUrl(msg)"
                      class="whitespace-pre-wrap break-words mt-1"
                    >
                      {{ msg.text }}
                    </p>
                    <span v-if="msg.direction === 'out'"
                      class="absolute -bottom-2 -right-1 text-[11px] flex items-center gap-1 text-white/80">
                      <span v-if="msg.status === 'pending'" class="i-lucide-loader-2 animate-spin" />
                      <span v-else-if="msg.status === 'delivered'" class="i-lucide-checks" />
                      <span v-else-if="msg.status === 'sent'" class="i-lucide-check" />
                      <span v-else-if="msg.status === 'error'" class="i-lucide-alert-circle text-error-200" />
                    </span>
                  </div>
                  <UAvatar v-if="msg.direction === 'out'" :alt="getDisplayName(msg)"
                    :text="getInitials(getDisplayName(msg))" size="md" />
                </div>

                <div v-if="!selectedConversation?.messages.length" class="text-sm text-muted">
                  Сообщений пока нет.
                </div>
              </template>
            </div>

            <div class="px-4 py-3 border-t border-default bg-elevated/60">
              <div class="flex items-center gap-2">
                <UInput v-model="messageText" placeholder="Написать сообщение" class="flex-1"
                  :disabled="!selectedConversation || isChatDetailLoading" @keyup.enter="sendMessage" />
                <UButton icon="i-lucide-send" label="Отправить" :disabled="!selectedConversation || isChatDetailLoading"
                  :loading="sendingMessage" @click="sendMessage" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <UModal v-model:open="newChatOpen" title="Новый чат" description="Чат будет создан без привязки к объекту.">
        <template #body>
          <div class="space-y-4">
            <UFormField label="Название">
              <UInput v-model="newChatTitle" class="w-full" placeholder="Например, Смена охраны" />
            </UFormField>

            <div class="flex items-center justify-end gap-2">
              <UButton label="Отмена" color="neutral" variant="subtle" :disabled="creatingChat"
                @click="newChatOpen = false" />
              <UButton label="Создать" icon="i-lucide-plus" :loading="creatingChat" @click="createChat" />
            </div>
          </div>
        </template>
      </UModal>

      <UModal v-model:open="previewOpen" title="Просмотр изображения"
        @update:open="(val) => { if (!val) { previewOpen = false; previewSrc = null } }">
        <template #body>
          <div class="flex justify-center">
            <img v-if="previewSrc" :src="previewSrc" class="max-h-[80vh] rounded-xl" />
          </div>
        </template>
      </UModal>

      <div v-if="contextMenu.open" class="fixed inset-0 z-40" @click="closeContextMenu" />
      <div v-if="contextMenu.open"
        class="fixed z-50 rounded-lg border border-default bg-elevated shadow-lg p-2 space-y-1 w-44"
        :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }">
        <button class="w-full text-left px-2 py-1.5 rounded hover:bg-default flex items-center gap-2 text-sm text-error"
          @click="deleteChat(contextMenu.chatId)">
          <span class="i-lucide-trash" />
          <span>Удалить чат</span>
        </button>
        <button class="w-full text-left px-2 py-1.5 rounded hover:bg-default flex items-center gap-2 text-sm"
          @click="closeContextMenu">
          <span class="i-lucide-x" />
          <span>Отмена</span>
        </button>
      </div>
    </template>
  </UDashboardPanel>
</template>
