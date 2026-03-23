<script setup lang="ts">
const state = reactive<{ [key: string]: boolean }>({
  email: true,
  desktop: false,
  product_updates: true,
  weekly_digest: false,
  important_updates: true
})

const sections = [{
  title: 'Каналы уведомлений',
  description: 'Куда можно отправлять уведомления?',
  fields: [{
    name: 'email',
    label: 'Электронная почта',
    description: 'Получать ежедневную email-сводку.'
  }, {
    name: 'desktop',
    label: 'Рабочий стол',
    description: 'Получать уведомления на рабочий стол.'
  }]
}, {
  title: 'Обновления аккаунта',
  description: 'Получать обновления по системе.',
  fields: [{
    name: 'weekly_digest',
    label: 'Еженедельная сводка',
    description: 'Получать еженедельную сводку новостей.'
  }, {
    name: 'product_updates',
    label: 'Обновления продукта',
    description: 'Получать ежемесячное письмо со всеми новыми функциями и изменениями.'
  }, {
    name: 'important_updates',
    label: 'Важные обновления',
    description: 'Получать письма о важных изменениях, например об исправлениях безопасности и технических работах.'
  }]
}]

async function onChange() {
  // Do something with data
  console.log(state)
}
</script>

<template>
  <div v-for="(section, index) in sections" :key="index">
    <UPageCard
      :title="section.title"
      :description="section.description"
      variant="naked"
      class="mb-4"
    />

    <UPageCard variant="subtle" :ui="{ container: 'divide-y divide-default' }">
      <UFormField
        v-for="field in section.fields"
        :key="field.name"
        :name="field.name"
        :label="field.label"
        :description="field.description"
        class="flex items-center justify-between not-last:pb-4 gap-2"
      >
        <USwitch
          v-model="state[field.name]"
          @update:model-value="onChange"
        />
      </UFormField>
    </UPageCard>
  </div>
</template>
