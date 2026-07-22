<script setup lang="ts">
import type { Customer, Period, Range, Stat } from '~/types'

const props = defineProps<{
  period: Period
  range: Range
}>()

type ExpenseItem = {
  id: number
  plannedAmount: number
  actualAmount?: number
  dueDate?: string
  currency: string
  createdAt: string
}

type ExpensesResponse = {
  items: ExpenseItem[]
}

type RatesResponse = {
  base: string
  updatedAt: number
  rates: Record<string, number>
}

const allowedCurrencies = ['UZS', 'USD', 'EUR', 'RUB'] as const
type CurrencyCode = (typeof allowedCurrencies)[number]

const currency = useDashboardCurrency()
const activeObject = useState<{ id: number, name: string } | null>('active-object')
const activeObjectIdCookie = useCookie<number | null>('active-object-id', { default: () => null })
const activeObjectId = computed(() => activeObject.value?.id ?? activeObjectIdCookie.value ?? undefined)

function safeCurrency(code?: string): CurrencyCode {
  return allowedCurrencies.includes(code as CurrencyCode) ? code as CurrencyCode : 'USD'
}

const { data: fxData } = await useAutoRefreshAsyncData<RatesResponse>('fx-latest', () => $fetch('/api/rates/latest'), {
  default: () => ({
    base: 'USD',
    updatedAt: Date.now(),
    rates: { USD: 1, EUR: 0.9, RUB: 90, UZS: 13000 }
  })
})

function toUsd(amount: number, code?: string) {
  const rate = fxData.value?.rates?.[safeCurrency(code)] ?? 1
  if (!rate) return amount
  return amount / rate
}

function fromUsd(amount: number, code?: string) {
  const rate = fxData.value?.rates?.[safeCurrency(code)] ?? 1
  return amount * rate
}

function convert(amount: number, from?: string, to?: string) {
  const fromCode = safeCurrency(from)
  const toCode = safeCurrency(to)

  if (fromCode === toCode) {
    return amount
  }

  return fromUsd(toUsd(amount, fromCode), toCode)
}

function formatCurrency(amount: number) {
  const selected = safeCurrency(currency.value)

  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: selected,
    maximumFractionDigits: selected === 'UZS' ? 0 : 2
  }).format(Number.isFinite(amount) ? amount : 0)
}

const { data: customersData, status: customersStatus } = await useAutoRefreshFetch<Customer[]>('/api/customers', {
  default: () => [],
  query: {
    period: props.period,
    from: props.range?.start,
    to: props.range?.end
  },
  watch: [() => props.period, () => props.range]
})

const { data: expensesData, execute: executeExpenses, status: expensesStatus } = await useAutoRefreshFetch<ExpensesResponse>('/api/expenses', {
  default: () => ({
    items: []
  }),
  query: {
    objectId: activeObjectId
  },
  immediate: true
})

watch(activeObjectId, () => {
  executeExpenses()
})

const isLoading = computed(() =>
  customersStatus.value === 'pending'
  || customersStatus.value === 'idle'
  || expensesStatus.value === 'pending'
  || expensesStatus.value === 'idle'
)

const customersCount = computed(() => {
  return customersData.value?.length || 0
})

const expensesActualSelected = computed(() => {
  if (!expensesData.value || !props.range?.start || !props.range?.end) return 0

  const start = new Date(props.range.start)
  start.setHours(0, 0, 0, 0)
  const end = new Date(props.range.end)
  end.setHours(23, 59, 59, 999)

  return expensesData.value.items
    .filter((item) => {
      const dateStr = item.dueDate || item.createdAt
      const date = new Date(dateStr)
      return date >= start && date <= end
    })
    .reduce((sum, item) => {
      const amount = Number.isFinite(Number(item.actualAmount))
        ? Number(item.actualAmount)
        : Number(item.plannedAmount ?? 0)
      return sum + convert(Number.isFinite(amount) ? amount : 0, item.currency || 'UZS', currency.value)
    }, 0)
})

const stats = computed<Stat[]>(() => [
  {
    title: 'Сотрудники',
    icon: 'i-lucide-users',
    value: customersCount.value,
    variation: 0,
    href: '/hr'
  },
  {
    title: 'Расходы',
    icon: 'i-lucide-chart-pie',
    value: formatCurrency(expensesActualSelected.value),
    variation: 0
  },
  {
    title: 'Чаты',
    icon: 'i-lucide-message-circle',
    value: 0,
    variation: 0,
    href: '/chats'
  }
])
</script>

<template>
  <UPageGrid class="lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-px">
    <template v-if="isLoading">
      <div
        v-for="n in 3"
        :key="`home-stat-skeleton-${n}`"
        class="rounded-lg border border-default bg-elevated/30 p-5 space-y-3 animate-pulse"
      >
        <div class="h-10 w-10 rounded-full bg-primary/15" />
        <div class="h-3 w-24 rounded bg-default/50" />
        <div class="h-8 w-32 rounded bg-default/70" />
      </div>
    </template>

    <UPageCard
      v-else
      v-for="(stat, index) in stats"
      :key="index"
      :icon="stat.icon"
      :title="stat.title"
      :to="stat.href || '#'"
      variant="subtle"
      :ui="{
        container: 'gap-y-1.5',
        wrapper: 'items-start',
        leading: 'p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25 flex-col',
        title: 'font-normal text-muted text-xs uppercase'
      }"
      class="lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1"
    >
      <div class="flex items-center gap-2">
        <span class="text-2xl font-semibold text-highlighted">
          {{ stat.value }}
        </span>

        <UBadge
          v-if="stat.variation"
          :color="stat.variation > 0 ? 'success' : 'error'"
          variant="subtle"
          class="text-xs"
        >
          {{ stat.variation > 0 ? '+' : '' }}{{ stat.variation }}%
        </UBadge>
      </div>
    </UPageCard>
  </UPageGrid>
</template>
