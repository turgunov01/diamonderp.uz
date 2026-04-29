<script setup lang="ts">
import { nextTick, onMounted, onBeforeUnmount } from 'vue'

definePageMeta({
  title: 'Word редактор договора',
  ssr: false
})

type ActiveObject = { id: number, name: string }

interface TemplateRecord {
  id: number
  name: string
  description?: string
  contractType: string
  html: string
  css: string
}

const toast = useToast()
const route = useRoute()
const router = useRouter()

const activeObject = useState<ActiveObject | null>('active-object', () => null)
const activeObjectIdCookie = useCookie<number | null>('active-object-id', { default: () => null })
const objectId = computed(() => activeObject.value?.id ?? activeObjectIdCookie.value ?? null)

const loading = ref(false)
const saving = ref(false)

const templateName = ref('Новый шаблон')
const templateDescription = ref('')
const contractType = ref<'gph' | 'official'>('gph')

const defaultHtml = `<h1 style="margin-bottom:12px;">Договор</h1>
<p style="margin-bottom:12px;">Здравствуйте, {{employee_name}}!</p>
<p style="margin-bottom:12px;">Объект: {{object_name}}</p>
<p style="margin-bottom:12px;">Сумма: {{amount}}</p>
<p style="margin-bottom:12px;">Дата: {{date}}</p>`

const defaultCss = `body { font-family: "Segoe UI", Arial, sans-serif; line-height: 1.6; color: #111827; }
h1, h2, h3 { color: #0f172a; font-weight: 700; }
p { margin: 0 0 12px; }
ul, ol { margin: 0 0 12px 22px; }
table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
table td, table th { border: 1px solid #e5e7eb; padding: 6px 8px; }`

const htmlBody = ref(defaultHtml)
const cssBody = ref(defaultCss)
const editorRef = ref<HTMLElement | null>(null)
const lastSavedAt = ref<string | null>(null)

const templateVariables = [
  { label: 'Имя сотрудника', token: '{{employee_name}}' },
  { label: 'Телефон', token: '{{phone}}' },
  { label: 'Должность', token: '{{position}}' },
  { label: 'Объект', token: '{{object_name}}' },
  { label: 'Сумма', token: '{{amount}}' },
  { label: 'Дата', token: '{{date}}' }
]

const currentTemplateId = computed(() => {
  const raw = route.query.templateId
  const value = Array.isArray(raw) ? raw[0] : raw
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
})

function syncEditorHtml(value?: string) {
  const content = value ?? htmlBody.value
  nextTick(() => {
    if (editorRef.value) {
      editorRef.value.innerHTML = content
    }
  })
}

function handleEditorInput() {
  if (editorRef.value) {
    htmlBody.value = editorRef.value.innerHTML
  }
}

function exec(command: string, value?: string) {
  if (!process.client) return
  if (editorRef.value) editorRef.value.focus()
  document.execCommand(command, false, value)
  handleEditorInput()
}

function insertToken(token: string) {
  if (!process.client) {
    htmlBody.value += token
    return
  }
  const el = editorRef.value
  if (!el) {
    htmlBody.value += token
    return
  }
  el.focus()
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) {
    el.innerHTML += token
    handleEditorInput()
    return
  }
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const textNode = document.createTextNode(token)
  range.insertNode(textNode)
  range.setStartAfter(textNode)
  range.setEndAfter(textNode)
  sel.removeAllRanges()
  sel.addRange(range)
  handleEditorInput()
}

function resetTemplate() {
  templateName.value = 'Новый шаблон'
  templateDescription.value = ''
  contractType.value = 'gph'
  htmlBody.value = defaultHtml
  cssBody.value = defaultCss
  syncEditorHtml(defaultHtml)
}

async function loadTemplate(id: number) {
  if (!objectId.value) return
  loading.value = true
  try {
    const tpl = await $fetch<TemplateRecord>(`/api/documents/templates/${id}`, {
      query: { objectId: objectId.value }
    })
    templateName.value = tpl.name
    templateDescription.value = tpl.description || ''
    contractType.value = (tpl.contractType as 'gph' | 'official') || 'gph'
    htmlBody.value = tpl.html || defaultHtml
    cssBody.value = tpl.css || defaultCss
    lastSavedAt.value = new Date().toISOString()
    syncEditorHtml(tpl.html || defaultHtml)
  } catch (err) {
    toast.add({
      title: 'Не удалось загрузить шаблон',
      description: (err as any)?.data?.statusMessage || (err as Error)?.message,
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

watch(currentTemplateId, (id) => {
  if (id) loadTemplate(id)
  else syncEditorHtml()
}, { immediate: true })

async function saveTemplate() {
  if (saving.value) return
  if (!objectId.value) {
    toast.add({ title: 'Выберите объект', description: 'Нельзя сохранить без объекта', color: 'warning' })
    return
  }
  saving.value = true
  try {
    const payload = {
      objectId: objectId.value,
      name: templateName.value.trim(),
      description: templateDescription.value.trim(),
      contractType: contractType.value,
      html: htmlBody.value,
      css: cssBody.value,
      projectData: null
    }

    if (currentTemplateId.value) {
      await $fetch(`/api/documents/templates/${currentTemplateId.value}`, { method: 'PUT', body: payload })
    } else {
      const created = await $fetch<{ id: number }>('/api/documents/templates', { method: 'POST', body: payload })
      await router.replace({ query: { templateId: created.id } })
    }

    lastSavedAt.value = new Date().toISOString()
    toast.add({ title: 'Шаблон сохранён', color: 'success' })
  } catch (err) {
    toast.add({
      title: 'Не удалось сохранить шаблон',
      description: (err as any)?.data?.statusMessage || (err as Error)?.message,
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

function formatDate(value?: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const saveShortcut = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    saveTemplate()
  }
}

onMounted(() => {
  syncEditorHtml()
  if (!process.client) return
  window.addEventListener('keydown', saveShortcut)
})

onBeforeUnmount(() => {
  if (!process.client) return
  window.removeEventListener('keydown', saveShortcut)
})
</script>

<template>
  <UDashboardPanel id="documents-builder">
    <template #header>
        <UDashboardNavbar :title="currentTemplateId ? 'Редактор шаблона' : 'Новый шаблон'">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <UButton icon="i-lucide-save" :loading="saving" label="Сохранить" @click="saveTemplate" />
          </template>
        </UDashboardNavbar>
      </template>

    <template #body>
        <div class="grid gap-6 lg:grid-cols-[1.4fr_0.6fr] items-start">
          <section class="space-y-3">
            <div class="flex flex-wrap items-center gap-2 rounded-lg border border-default bg-elevated/50 p-3">
              <UButton size="xs" icon="i-lucide-bold" variant="ghost" @click="exec('bold')" />
              <UButton size="xs" icon="i-lucide-italic" variant="ghost" @click="exec('italic')" />
              <UButton size="xs" icon="i-lucide-underline" variant="ghost" @click="exec('underline')" />
              <UButton size="xs" icon="i-lucide-strikethrough" variant="ghost" @click="exec('strikeThrough')" />
              <UButton size="xs" icon="i-lucide-heading-1" variant="ghost" @click="exec('formatBlock', 'h1')" />
              <UButton size="xs" icon="i-lucide-heading-2" variant="ghost" @click="exec('formatBlock', 'h2')" />
              <UButton size="xs" icon="i-lucide-paragraph" variant="ghost" @click="exec('formatBlock', 'p')" />
              <UButton size="xs" icon="i-lucide-align-left" variant="ghost" @click="exec('justifyLeft')" />
              <UButton size="xs" icon="i-lucide-align-center" variant="ghost" @click="exec('justifyCenter')" />
              <UButton size="xs" icon="i-lucide-align-right" variant="ghost" @click="exec('justifyRight')" />
              <UButton size="xs" icon="i-lucide-list" variant="ghost" @click="exec('insertUnorderedList')" />
              <UButton size="xs" icon="i-lucide-list-ordered" variant="ghost" @click="exec('insertOrderedList')" />
              <UButton size="xs" icon="i-lucide-quote" variant="ghost" @click="exec('formatBlock', 'blockquote')" />
              <UButton size="xs" icon="i-lucide-link" variant="ghost" @click="() => { const url = prompt('Ссылка'); if (url) exec('createLink', url) }" />
              <UButton size="xs" icon="i-lucide-undo-2" variant="ghost" @click="exec('undo')" />
              <UButton size="xs" icon="i-lucide-redo-2" variant="ghost" @click="exec('redo')" />
              <UButton size="xs" icon="i-lucide-eraser" color="warning" variant="ghost" @click="exec('removeFormat')" />
              <UButton size="xs" icon="i-lucide-refresh-ccw" color="neutral" variant="outline" @click="resetTemplate" label="Сброс" />
              <span class="text-[11px] text-muted ml-auto">Ctrl/Cmd + S сохраняет</span>
            </div>

            <div class="rounded-2xl border border-default bg-gradient-to-br from-elevated/60 to-elevated/30 p-4 shadow-sm">
              <div class="text-xs text-muted flex items-center justify-between mb-2">
                <span>Рабочая область</span>
                <span v-if="lastSavedAt">Сохранено: {{ formatDate(lastSavedAt) }}</span>
              </div>
              <div class="max-w-[860px] mx-auto bg-white text-black rounded-xl shadow-xl border border-default/70">
                <div
                  ref="editorRef"
                  class="min-h-[640px] p-8 focus:outline-none prose max-w-none"
                  contenteditable="true"
                  spellcheck="true"
                  :style="{ fontFamily: 'Segoe UI, Arial, sans-serif' }"
                  @input="handleEditorInput"
                ></div>
              </div>
              <p class="text-xs text-muted mt-2">Переменные будут подставлены при отправке сотруднику.</p>
              <UAlert v-if="loading" color="info" variant="subtle" title="Загрузка шаблона" class="mt-2" />
            </div>
          </section>

          <aside class="space-y-4">
            <div class="rounded-lg border border-default bg-elevated/50 p-4 space-y-3">
              <h3 class="font-semibold text-highlighted">Шаблон</h3>
              <UFormField label="Название">
                <UInput v-model="templateName" placeholder="Договор ГПХ" />
              </UFormField>
              <UFormField label="Тип договора">
                <USelect v-model="contractType" :items="[
                  { label: 'ГПХ', value: 'gph' },
                  { label: 'Официальное трудоустройство', value: 'official' }
                ]" />
              </UFormField>
              <UFormField label="Описание">
                <UTextarea v-model="templateDescription" :rows="2" placeholder="Короткое описание" />
              </UFormField>
              <div class="flex gap-2">
                <UButton icon="i-lucide-save" :loading="saving" :disabled="!objectId" label="Сохранить" class="flex-1" @click="saveTemplate" />
                <UButton icon="i-lucide-undo-2" color="neutral" variant="outline" label="Сброс" @click="resetTemplate" />
              </div>
              <p v-if="!objectId" class="text-xs text-warning">Выберите объект в шапке, чтобы сохранить.</p>
            </div>

            <div class="rounded-lg border border-default bg-elevated/40 p-4 space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="font-semibold text-highlighted">Переменные</h3>
                <span class="text-xs text-muted">Клик для вставки</span>
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="token in templateVariables"
                  :key="token.token"
                  size="xs"
                  variant="soft"
                  color="neutral"
                  :label="token.label"
                  @click="insertToken(token.token)"
                />
              </div>
            </div>

            <div class="rounded-lg border border-default bg-elevated/40 p-4 space-y-2">
              <div class="flex items-center justify-between">
                <h3 class="font-semibold text-highlighted">Стили страницы</h3>
                <span class="text-xs text-muted">Необязательно</span>
              </div>
              <UTextarea v-model="cssBody" class="font-mono text-xs" :rows="6" />
              <p class="text-xs text-muted">CSS попадёт в шаблон и будет применён при отправке.</p>
            </div>
          </aside>
        </div>
      </template>
  </UDashboardPanel>
</template>
