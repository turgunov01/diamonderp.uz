<script setup lang="ts">
import { h } from "vue";
import type { TableColumn } from "@nuxt/ui";
import { getPaginationRowModel } from "@tanstack/table-core";
import type { Zone, Customer } from "~/types";

const UButton = resolveComponent("UButton");
const UAvatar = resolveComponent("UAvatar");

const toast = useToast();
const table = useTemplateRef<any>("table");

const selectedZoneForMembers = ref<Zone | null>(null);
const isCreateZoneModalOpen = ref(false);
const isCreatingZone = ref(false);

const newZoneForm = reactive({
  name: "",
  description: "",
});

const { data: zones, status, error, refresh } = await useAutoRefreshFetch<Zone[]>("/api/zones", {
  lazy: true,
  default: () => [],
});

const { data: customers, refresh: refreshCustomers } = await useAutoRefreshFetch<Customer[]>(
  "/api/customers",
  {
    default: () => [],
  }
);
const safeCustomers = computed(() => customers.value || []);

watch(
  error,
  (newError) => {
    if (!newError) return;

    toast.add({
      title: "Не удалось загрузить зоны",
      description:
        newError.statusMessage || "Проверьте API и переменные окружения Postgres.",
      color: "error",
    });
  },
  { immediate: true }
);

function getZoneMembers(zoneName: string): Customer[] {
  return safeCustomers.value.filter((c) => c.objectPinned === zoneName);
}

const zoneMembers = computed<Customer[]>(() => {
  if (!selectedZoneForMembers.value?.name) {
    return [];
  }

  return safeCustomers.value.filter(
    (c) => c.objectPinned === selectedZoneForMembers.value!.name
  );
});

function selectZoneMembers(zone: Zone) {
  selectedZoneForMembers.value = zone;
}

function closeMembersView() {
  selectedZoneForMembers.value = null;
}

async function deleteZone(zone: Zone) {
  const confirmed = confirm(`Удалить зону "${zone.name}"?`);
  if (!confirmed) return;

  try {
    await $fetch(`/api/zones/${zone.id}`, {
      method: "DELETE",
    });

    toast.add({
      title: "Удалено",
      description: `Зона "${zone.name}" удалена`,
      color: "success",
    });

    await refresh();
  } catch {
    toast.add({
      title: "Ошибка",
      description: "Не удалось удалить зону",
      color: "error",
    });
  }
}

const zonesColumns: TableColumn<Zone>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "name", header: "Название" },
  { accessorKey: "description", header: "Описание" },
  {
    id: "members",
    header: "Пользователей",
    cell: ({ row }) => getZoneMembers(row.original.name).length,
  },
  {
    id: "actions",
    header: "Действия",
    cell: ({ row }) => {
      return h("div", { class: "flex justify-end gap-2" }, [
        h(UButton, {
          icon: "i-lucide-users",
          color: "primary",
          variant: "ghost",
          size: "sm",
          onClick: () => selectZoneMembers(row.original),
        }),
        h(UButton, {
          icon: "i-lucide-trash-2",
          color: "error",
          variant: "ghost",
          size: "sm",
          onClick: () => deleteZone(row.original),
        }),
      ]);
    },
  },
];

const columnFilters = ref([{ id: "name", value: "" }]);
const columnVisibility = ref();
const pagination = ref({ pageIndex: 0, pageSize: 10 });

const name = computed({
  get: () => (table.value?.tableApi?.getColumn("name")?.getFilterValue() as string) || "",
  set: (value: string) =>
    table.value?.tableApi?.getColumn("name")?.setFilterValue(value || undefined),
});
</script>

<template>
  <UDashboardPanel id="zones">
    <template #header>
      <UDashboardNavbar title="Управление зонами">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template v-if="selectedZoneForMembers" #right>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            @click="closeMembersView"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!selectedZoneForMembers" class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-1.5">
          <UInput
            v-model="name"
            class="max-w-sm"
            icon="i-lucide-search"
            placeholder="Фильтр по названию зоны..."
          />

          <div class="flex flex-wrap items-center gap-1.5">
            <UButton
              label="Создать зону"
              icon="i-lucide-plus"
              color="primary"
              @click="useRouter().push('/zones/create')"
            />
          </div>
        </div>

        <UTable
          ref="table"
          v-model:column-filters="columnFilters"
          v-model:column-visibility="columnVisibility"
          v-model:pagination="pagination"
          :pagination-options="{
            getPaginationRowModel: getPaginationRowModel(),
          }"
          class="shrink-0"
          :data="zones"
          :columns="zonesColumns"
          :loading="status === 'pending'"
          :ui="{
            base: 'table-fixed border-separate border-spacing-0',
            thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
            tbody: '[&>tr]:last:[&>td]:border-b-0',
            th:
              'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
            td: 'border-b border-default',
            separator: 'h-0',
          }"
        />

        <div class="flex items-center justify-between gap-3 border-t border-default pt-4">
          <div class="text-sm text-white">
            Показано с {{ pagination.pageIndex * pagination.pageSize + 1 }} по
            {{
              Math.min(
                (pagination.pageIndex + 1) * pagination.pageSize,
                zones?.length || 0
              )
            }}
            из {{ zones?.length || 0 }} зон
          </div>

          <UPagination
            :default-page="pagination.pageIndex + 1"
            :page-count="pagination.pageSize"
            :total="zones?.length || 0"
            @update:page="(p: number) => { pagination.pageIndex = p - 1 }"
          />
        </div>
      </div>

      <div v-else class="space-y-4">
        <UPageCard
          :title="`Сотрудники в зоне ${selectedZoneForMembers.name}`"
          :description="`Назначено пользователей: ${zoneMembers.length}`"
          variant="subtle"
          orientation="horizontal"
        >
        </UPageCard>

        <UPageCard variant="subtle">
          <div v-if="zoneMembers.length" class="space-y-3">
            <div
              v-for="user in zoneMembers"
              :key="user.id"
              class="flex items-center gap-3 p-3 border border-default rounded-lg"
            >
              <UAvatar
                :src="user.avatar?.src || undefined"
                :alt="user.username || 'Пользователь'"
                size="md"
              />
              <div>
                <div class="font-semibold text-sm">
                  {{ user.username || "Без имени" }}
                </div>
                <div class="text-xs text-white">
                  Возраст: {{ user.age ?? "-" }}, Смена: {{ user.workShift ?? "-" }}
                </div>
              </div>
            </div>
          </div>

          <div v-else class="py-8 text-center text-default">
            Локации не имеют закрепленных пользователей. <br />
            Попросите сотрудников прикрепить себя к локации для отображения их здесь.
          </div>
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
