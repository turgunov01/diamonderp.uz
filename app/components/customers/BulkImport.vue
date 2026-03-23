<script setup lang="ts">
interface BulkImportResponse {
  imported: number
  skipped: number
  errors: Array<{ row: number, message: string }>
}

const toast = useToast()
const importing = ref(false)
const downloading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const activeBuilding = useState<{ id: number, name: string } | null>('active-building')

function pickFile() {
  fileInput.value?.click()
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    return err.data?.statusMessage || err.message
  }

  return undefined
}

async function downloadTemplate(format: 'xlsx' | 'csv' = 'xlsx') {
  if (downloading.value) {
    return
  }

  downloading.value = true

  try {
    const response = await fetch(`/api/customers/import-template?format=${format}`)
    if (!response.ok) {
      throw new Error('Не удалось скачать шаблон')
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `customers-import-template.${format}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (error: unknown) {
    toast.add({
      title: 'Не удалось скачать шаблон',
      description: getErrorMessage(error) || 'Проверьте API и повторите попытку.',
      color: 'error'
    })
  } finally {
    downloading.value = false
  }
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file || importing.value) {
    return
  }

  importing.value = true

  try {
    if (!activeBuilding.value?.id) {
      throw new Error('Выберите здание перед импортом.')
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('buildingId', String(activeBuilding.value.id))

    const result = await $fetch<BulkImportResponse>('/api/customers/bulk-import', {
      method: 'POST',
      body: formData
    })

    toast.add({
      title: 'Импорт завершен',
      description: `Добавлено: ${result.imported}. Пропущено: ${result.skipped}.`,
      color: result.errors.length ? 'warning' : 'success'
    })

    if (result.errors.length) {
      const firstErrors = result.errors.slice(0, 3)
      toast.add({
        title: 'Ошибки в строках файла',
        description: firstErrors.map(item => `Строка ${item.row}: ${item.message}`).join(' | '),
        color: 'warning'
      })
    }

    await refreshNuxtData('/api/customers')
  } catch (error: unknown) {
    toast.add({
      title: 'Не удалось выполнить импорт',
      description: getErrorMessage(error) || 'Проверьте файл и повторите попытку.',
      color: 'error'
    })
  } finally {
    importing.value = false
    input.value = ''
  }
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <UButton
      label="Шаблон XLSX"
      icon="i-lucide-file-spreadsheet"
      color="neutral"
      variant="outline"
      :loading="downloading"
      @click="downloadTemplate('xlsx')"
    />

    <UButton
      label="Массовая загрузка"
      icon="i-lucide-upload"
      color="primary"
      variant="subtle"
      :loading="importing"
      @click="pickFile"
    />

    <input
      ref="fileInput"
      class="hidden"
      type="file"
      accept=".xlsx,.csv"
      @change="onFileSelected"
    >
  </div>
</template>
