<script setup lang="ts">
import { eachDayOfInterval, eachMonthOfInterval, eachWeekOfInterval, endOfDay, endOfMonth, endOfWeek, format } from 'date-fns'
import { VisArea, VisAxis, VisCrosshair, VisLine, VisTooltip, VisXYContainer } from '@unovis/vue'
import type { Period, Range } from '~/types'

const cardRef = useTemplateRef<HTMLElement | null>('cardRef')

const props = defineProps<{
  period: Period
  range: Range
}>()

type DataRecord = {
  date: Date
  amount: number
  items: ExpenseItem[]
}

type ExpenseItem = {
  id: number
  plannedAmount: number
  actualAmount?: number
  dueDate?: string
  status?: string
  currency: string
  category?: string
  vendor?: string
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

const { width } = useElementSize(cardRef)

const data = ref<DataRecord[]>([])

const allowedCurrencies = ['UZS', 'USD', 'EUR', 'RUB'] as const
type CurrencyCode = (typeof allowedCurrencies)[number]

const currency = useState<CurrencyCode>('dashboard-currency', () => 'UZS')
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

function formatCurrency(amount: number, code: string) {
  const selected = safeCurrency(code)

  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: selected,
    maximumFractionDigits: selected === 'UZS' ? 0 : 2
  }).format(Number.isFinite(amount) ? amount : 0)
}

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
  expensesStatus.value === 'pending' || expensesStatus.value === 'idle'
)

function paidSumForItems(items: ExpenseItem[]) {
  let total = 0

  for (const item of items) {
    // оплачено считаем по факту если есть, иначе берём план как ориентир
    const amount = Number.isFinite(Number(item.actualAmount))
      ? Number(item.actualAmount)
      : Number(item.plannedAmount)

    total += convert(Number.isFinite(amount) ? amount : 0, item.currency || 'UZS', currency.value)
  }

  return total
}

function recompute() {
  if (!expensesData.value || !props.range?.start || !props.range?.end) {
    data.value = []
    return
  }

  const intervalBuilders: Record<Period, (range: Range) => { start: Date, end: Date, label: Date }[]> = {
    daily: range => eachDayOfInterval(range).map(date => ({
      start: date,
      end: endOfDay(date),
      label: date
    })),
    weekly: range => eachWeekOfInterval(range, { weekStartsOn: 1 }).map(start => ({
      start,
      end: endOfWeek(start, { weekStartsOn: 1 }),
      label: start
    })),
    monthly: range => eachMonthOfInterval(range).map(start => ({
      start,
      end: endOfMonth(start),
      label: start
    }))
  }

  data.value = intervalBuilders[props.period](props.range).map(({ start, end, label }) => {
    const bucketItems = expensesData.value!.items.filter(item => {
      const rawDate = item.dueDate || item.createdAt
      const created = new Date(rawDate)
      return created >= start && created <= end
    })

    return {
      date: label,
      amount: paidSumForItems(bucketItems),
      items: bucketItems
    }
  })
}

watch([() => props.period, () => props.range, expensesData, currency], recompute, { immediate: true })

const x = (_: DataRecord, index: number) => index
const y = (item: DataRecord) => item.amount

const total = computed(() => data.value.reduce((sum, item) => sum + item.amount, 0))

function formatDate(date: Date): string {
  return ({
    daily: format(date, 'd MMM'),
    weekly: format(date, 'd MMM'),
    monthly: format(date, 'MMM yyy')
  })[props.period]
}

function xTicks(index: number) {
  if (index === 0 || index === data.value.length - 1 || !data.value[index]) {
    return ''
  }

  return formatDate(data.value[index].date)
}

const template = (item: DataRecord) => {
  const breakdown = item.items.map(exp => {
    const amt = Number.isFinite(Number(exp.actualAmount))
      ? Number(exp.actualAmount)
      : Number(exp.plannedAmount)
    const converted = convert(Number.isFinite(amt) ? amt : 0, exp.currency || 'UZS', currency.value)
    const category = exp.category || 'Без категории'
    const vendor = (exp as any).vendor || 'Без поставщика'
    return `• ${category} — ${vendor}: ${formatCurrency(converted, currency.value)}`
  }).join('<br/>')

  return `${formatDate(item.date)}<br><strong>${formatCurrency(item.amount, currency.value)}</strong><br>${breakdown}`
}
</script>

<template>
  <UCard ref="cardRef" :ui="{ root: 'overflow-visible', body: '!px-0 !pt-0 !pb-3' }">
    <template #header>
      <div>
        <p class="text-xs text-muted uppercase mb-1.5">
          Расходы
        </p>
        <p v-if="!isLoading" class="text-3xl text-highlighted font-semibold">
          {{ formatCurrency(total, currency) }}
        </p>
        <div v-else class="h-10 w-40 rounded bg-default/60 animate-pulse" />
      </div>
    </template>

    <div v-if="isLoading" class="h-96 px-6 pb-3">
      <div class="flex h-full items-end gap-4 animate-pulse">
        <div class="h-32 flex-1 rounded-t-3xl bg-primary/10" />
        <div class="h-48 flex-1 rounded-t-3xl bg-primary/15" />
        <div class="h-24 flex-1 rounded-t-3xl bg-primary/10" />
        <div class="h-72 flex-1 rounded-t-3xl bg-primary/20" />
        <div class="h-44 flex-1 rounded-t-3xl bg-primary/15" />
        <div class="h-20 flex-1 rounded-t-3xl bg-primary/10" />
      </div>
    </div>

    <VisXYContainer
      v-else
      :data="data"
      :padding="{ top: 40 }"
      class="h-96"
      :width="width"
    >
      <VisLine
        :x="x"
        :y="y"
        color="var(--ui-primary)"
      />
      <VisArea
        :x="x"
        :y="y"
        color="var(--ui-primary)"
        :opacity="0.1"
      />

      <VisAxis
        type="x"
        :x="x"
        :tick-format="xTicks"
      />

      <VisCrosshair
        color="var(--ui-primary)"
        :template="template"
      />

      <VisTooltip />
    </VisXYContainer>
  </UCard>
</template>

<style scoped>
.unovis-xy-container {
  --vis-crosshair-line-stroke-color: var(--ui-primary);
  --vis-crosshair-circle-stroke-color: var(--ui-bg);

  --vis-axis-grid-color: var(--ui-border);
  --vis-axis-tick-color: var(--ui-border);
  --vis-axis-tick-label-color: var(--ui-text-dimmed);

  --vis-tooltip-background-color: var(--ui-bg);
  --vis-tooltip-border-color: var(--ui-border);
  --vis-tooltip-text-color: var(--ui-text-highlighted);
}
</style>
