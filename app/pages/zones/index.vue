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
      title: "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ Р·РѕРЅС‹",
      description:
        newError.statusMessage || "РџСЂРѕРІРµСЂСЊС‚Рµ API Рё РїРµСЂРµРјРµРЅРЅС‹Рµ РѕРєСЂСѓР¶РµРЅРёСЏ Postgres.",
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
  const confirmed = confirm(`РЈРґР°Р»РёС‚СЊ Р·РѕРЅСѓ "${zone.name}"?`);
  if (!confirmed) return;

  try {
    await $fetch(`/api/zones/${zone.id}`, {
      method: "DELETE",
    });

    toast.add({
      title: "РЈРґР°Р»РµРЅРѕ",
      description: `Р—РѕРЅР° "${zone.name}" СѓРґР°Р»РµРЅР°`,
      color: "success",
    });

    await refresh();
  } catch {
    toast.add({
      title: "РћС€РёР±РєР°",
      description: "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ Р·РѕРЅСѓ",
      color: "error",
    });
  }
}

const zonesColumns: TableColumn<Zone>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "name", header: "РќР°Р·РІР°РЅРёРµ" },
  { accessorKey: "description", header: "РћРїРёСЃР°РЅРёРµ" },
  {
    id: "members",
    header: "РџРѕР»СЊР·РѕРІР°С‚РµР»РµР№",
    cell: ({ row }) => getZoneMembers(row.original.name).length,
  },
  {
    id: "actions",
    header: "Р”РµР№СЃС‚РІРёСЏ",
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
      <UDashboardNavbar title="РЈРїСЂР°РІР»РµРЅРёРµ Р·РѕРЅР°РјРё">
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
            placeholder="Р¤РёР»СЊС‚СЂ РїРѕ РЅР°Р·РІР°РЅРёСЋ Р·РѕРЅС‹..."
          />

          <div class="flex flex-wrap items-center gap-1.5">
            <UButton
              label="РЎРѕР·РґР°С‚СЊ Р·РѕРЅСѓ"
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
            РџРѕРєР°Р·Р°РЅРѕ СЃ {{ pagination.pageIndex * pagination.pageSize + 1 }} РїРѕ
            {{
              Math.min(
                (pagination.pageIndex + 1) * pagination.pageSize,
                zones?.length || 0
              )
            }}
            РёР· {{ zones?.length || 0 }} Р·РѕРЅ
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
          :title="`РЎРѕС‚СЂСѓРґРЅРёРєРё РІ Р·РѕРЅРµ ${selectedZoneForMembers.name}`"
          :description="`РќР°Р·РЅР°С‡РµРЅРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№: ${zoneMembers.length}`"
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
                :alt="user.username || 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ'"
                size="md"
              />
              <div>
                <div class="font-semibold text-sm">
                  {{ user.username || "Р‘РµР· РёРјРµРЅРё" }}
                </div>
                <div class="text-xs text-white">
                  Р’РѕР·СЂР°СЃС‚: {{ user.age ?? "-" }}, РЎРјРµРЅР°: {{ user.workShift ?? "-" }}
                </div>
              </div>
            </div>
          </div>

          <div v-else class="py-8 text-center text-default">
            Р›РѕРєР°С†РёРё РЅРµ РёРјРµСЋС‚ Р·Р°РєСЂРµРїР»РµРЅРЅС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№. <br />
            РџРѕРїСЂРѕСЃРёС‚Рµ СЃРѕС‚СЂСѓРґРЅРёРєРѕРІ РїСЂРёРєСЂРµРїРёС‚СЊ СЃРµР±СЏ Рє Р»РѕРєР°С†РёРё РґР»СЏ РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ РёС… Р·РґРµСЃСЊ.
          </div>
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
