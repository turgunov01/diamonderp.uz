<script lang="ts" setup>
const router = useRouter();
const toast = useToast();

const isCreating = ref(false);

const newZoneForm = reactive({
  name: "",
  description: "",
});

async function createZone() {
  if (!newZoneForm.name.trim()) {
    toast.add({
      title: "Ошибка",
      description: "Название зоны обязательно",
      color: "error",
    });
    return;
  }

  isCreating.value = true;

  try {
    await $fetch("/api/zones", {
      method: "POST",
      body: {
        name: newZoneForm.name.trim(),
        description: newZoneForm.description.trim() || null,
      },
    });

    toast.add({
      title: "Успешно",
      description: `Зона "${newZoneForm.name}" создана`,
      color: "success",
    });

    router.push("/zones");
  } catch {
    toast.add({
      title: "Ошибка",
      description: "Не удалось создать зону",
      color: "error",
    });
  } finally {
    isCreating.value = false;
  }
}

</script>

<template>
  <UDashboardPanel id="zone-create">
    <template #header>
      <UDashboardNavbar title="Создать зону">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-arrow-left"
            variant="ghost"
            @click="router.push('/zones')"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-xl">
        <UCard :ui="{ divide: 'divide-y divide-default' }">
          <template #header>
            <h3 class="text-lg font-semibold">Новая зона</h3>
          </template>

          <div class="space-y-6 flex flex-col">
            <UFormGroup label="Название локации" required>
              <UInput class="w-full"
                v-model="newZoneForm.name"
                placeholder="Введите название локации"
                autofocus
              />
            </UFormGroup>
            <UFormGroup label="Описание локации">
              <UTextarea class="w-full"
                v-model="newZoneForm.description"
                placeholder="Введите описание локации (необязательно)"
                :rows="4"
              />
            </UFormGroup>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton label="Отмена" variant="outline" @click="router.push('/zones')" />
              <UButton label="Создать" :loading="isCreating" @click="createZone" />
            </div>
          </template>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
