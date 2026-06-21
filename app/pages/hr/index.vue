<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { upperFirst } from 'scule'
import { getPaginationRowModel } from '@tanstack/table-core'
import type { Row } from '@tanstack/table-core'
import type { EmployeeActivityRecord } from '~/stores/employeeActivity'
import {
  WORK_SCHEDULE_DEFINITIONS,
  getLegacyWorkScheduleType,
  getWorkScheduleDefinition,
  getWorkScheduleOptions,
  normalizeWorkScheduleType,
  type WorkScheduleType
} from '~~/shared/utils/work-schedules'

interface Customer {
  id: number
  buildingId?: number | null
  fullName?: string
  username: string
  role: string
  avatar: {
    src: string
  }
  password: string
  phoneNumber: string
  passportFile: string
  passportFrontPath?: string
  passportBackPath?: string
  age: number
  workShift: 'day' | 'night'
  objectPinned: string
  objectPositions: string[]
  salaryType: 'fixed' | 'hourly'
  hourlyRate: number
  baseSalary: number
  positionBonus: number
  salaryCurrency: 'UZS'
  status?: string
  mustChangePassword?: boolean
  archivedAt?: string | null
  deactivationComment?: string | null
}

interface PassportFileEntry {
  label: string
  value: string
  url: string
  isImage: boolean
}

interface SalaryDraft {
  salaryType: 'fixed' | 'hourly'
  hourlyRate: string
  baseSalary: string
  positionBonus: string
  saving: boolean
}

interface SalaryFormulaConfig {
  workHoursPerDay: string
  minutesPerHour: string
  penaltyMultiplier: string
}

interface Advance {
  id: number
  customerId: number
  amount: number
  currency: string
  comment?: string | null
  status: 'issued' | 'settled' | 'cancelled'
  issuedAt: string
  issuedBy?: string | null
  settledAt?: string | null
}

interface CustomerRole {
  id: number
  buildingId: number | null
  code: string
  label: string
  isActive: boolean
  createdAt: string | null
}

interface ObjectItem {
  id: number
  building_id?: number | null
  name: string
  schedule_type?: WorkScheduleType | string | null
  scheduleType?: WorkScheduleType | string | null
}

interface ObjectScheduleDraft {
  scheduleType: WorkScheduleType
  saving: boolean
}

function createDefaultSalaryFormulaConfig(): SalaryFormulaConfig {
  return {
    workHoursPerDay: String(WORK_HOURS_PER_DAY),
    minutesPerHour: String(MINUTES_PER_HOUR),
    penaltyMultiplier: String(LATE_PENALTY_MULTIPLIER)
  }
}

const UAvatar = resolveComponent('UAvatar')
const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UCheckbox = resolveComponent('UCheckbox')

const toast = useToast()
const runtimeConfig = useRuntimeConfig()
const table = useTemplateRef('table')
const activeBuilding = useState<{ id: number, name: string } | null>('active-building')
const customerInfoOpen = ref(false)
const selectedCustomer = ref<Customer | null>(null)
const deletingSelected = ref(false)
const editCustomerOpen = ref(false)
const editingCustomer = ref<Customer | null>(null)
const archiveModalOpen = ref(false)
const archiveComment = ref('')
const archivingCustomer = ref<Customer | null>(null)
const permanentDeleteArmed = ref(false)
const permanentlyDeletingCustomerId = ref<number | null>(null)
const deletingSelectedArchived = ref(false)
const archivedRowSelection = ref<Record<number, boolean>>({})
const salaryMonthSeed = useState<string>('hr-salary-month-seed', () => new Date().toISOString())
const salaryFormulaOpen = ref(false)
const customerPasswordVisible = ref(false)

const WORK_HOURS_PER_DAY = 12
const MINUTES_PER_HOUR = 60
const LATE_PENALTY_MULTIPLIER = 4
const WORK_SCHEDULE_OPTIONS = getWorkScheduleOptions()

const hrTabs = [{
  label: 'Пользователи',
  value: 'users'
}, {
  label: 'Смены',
  value: 'shifts'
}, {
  label: 'Зарплаты',
  value: 'salaries'
}, {
  label: 'Авансы',
  value: 'advances'
}, {
  label: 'Роли',
  value: 'roles'
}, {
  label: 'Архив',
  value: 'archive'
}]
const selectedHrTab = ref('users')

const columnFilters = ref([{
  id: 'username',
  value: ''
}])
const columnVisibility = ref()
const rowSelection = ref({})

const objectScheduleDrafts = ref<Record<number, ObjectScheduleDraft>>({})
const salaryDrafts = ref<Record<number, SalaryDraft>>({})
const salaryFormulaCookie = useCookie<SalaryFormulaConfig>('hr-salary-formula-config', {
  default: () => createDefaultSalaryFormulaConfig(),
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365
})
const salaryFormulaConfig = useState<SalaryFormulaConfig>('hr-salary-formula-config', () => ({
  ...createDefaultSalaryFormulaConfig(),
  ...salaryFormulaCookie.value
}))
const salaryFormulaDraft = reactive<SalaryFormulaConfig>({
  workHoursPerDay: salaryFormulaConfig.value.workHoursPerDay,
  minutesPerHour: salaryFormulaConfig.value.minutesPerHour,
  penaltyMultiplier: salaryFormulaConfig.value.penaltyMultiplier
})
const exportSalaryLoading = ref(false)

const { data: rolesData } = await useAutoRefreshFetch<CustomerRole[]>('/api/customer-roles', {
  default: () => [],
  query: {
    buildingId: computed(() => activeBuilding.value?.id)
  }
})

const roleLabelByCode = computed(() => {
  const map = new Map<string, string>()

  for (const role of rolesData.value || []) {
    if (!role.isActive) continue
    const code = typeof role.code === 'string' ? role.code.trim().toLowerCase() : ''
    if (!code) continue
    map.set(code, role.label)
  }

  return map
})

function getCustomerRoleLabel(role?: string | null) {
  const code = typeof role === 'string' ? role.trim().toLowerCase() : ''
  return roleLabelByCode.value.get(code) || (code ? code : '—')
}

const { data, status, error, refresh } = await useAutoRefreshFetch<Customer[]>('/api/customers', {
  lazy: true,
  default: () => [],
  query: {
    buildingId: computed(() => activeBuilding.value?.id)
  }
})

const { data: archiveData, status: archiveStatus, refresh: refreshArchive } = await useAutoRefreshFetch<Customer[]>('/api/customers/archive', {
  lazy: true,
  default: () => [],
  query: {
    buildingId: computed(() => activeBuilding.value?.id)
  }
})

const { data: advancesData, status: advancesStatus, refresh: refreshAdvances } = await useAutoRefreshFetch<Advance[]>('/api/customers/advances', {
  lazy: true,
  default: () => [],
  query: {
    buildingId: computed(() => activeBuilding.value?.id)
  }
})

function formatLocalYmd(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const salaryMonthDate = computed(() => new Date(salaryMonthSeed.value))
const salaryMonthStart = computed(() => {
  const date = salaryMonthDate.value
  return formatLocalYmd(new Date(date.getFullYear(), date.getMonth(), 1))
})
const salaryMonthEnd = computed(() => {
  const date = salaryMonthDate.value
  return formatLocalYmd(new Date(date.getFullYear(), date.getMonth() + 1, 0))
})
const salaryMonthDays = computed(() => {
  const date = salaryMonthDate.value
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
})
const salaryMonthLabel = computed(() =>
  salaryMonthDate.value.toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric'
  })
)
const effectiveSalaryMonthDays = computed(() => salaryMonthDays.value)
const effectiveWorkHoursPerDay = computed(() =>
  normalizeFormulaValue(salaryFormulaConfig.value.workHoursPerDay, WORK_HOURS_PER_DAY)
)
const effectiveMinutesPerHour = computed(() =>
  normalizeFormulaValue(salaryFormulaConfig.value.minutesPerHour, MINUTES_PER_HOUR)
)
const effectivePenaltyMultiplier = computed(() =>
  normalizeFormulaValue(salaryFormulaConfig.value.penaltyMultiplier, LATE_PENALTY_MULTIPLIER)
)
const {
  data: monthlyActivityData,
  status: monthlyActivityStatus,
  error: monthlyActivityError
} = await useAutoRefreshFetch<EmployeeActivityRecord[]>('/api/employee/activity', {
  lazy: true,
  default: () => [],
  query: {
    from: salaryMonthStart,
    to: salaryMonthEnd,
    buildingId: computed(() => activeBuilding.value?.id)
  }
})

const { data: objectsData, refresh: refreshObjects } = await useFetch<ObjectItem[]>('/api/objects', {
  default: () => [],
  query: {
    buildingId: computed(() => activeBuilding.value?.id)
  }
})

const objectScheduleByName = computed(() => {
  const map = new Map<string, WorkScheduleType>()

  for (const object of objectsData.value || []) {
    const name = object.name?.trim()
    if (!name) continue
    const scheduleType = normalizeWorkScheduleType(object.scheduleType ?? object.schedule_type)
    map.set(`${object.building_id ?? activeBuilding.value?.id ?? 'global'}:${name}`, scheduleType)
    if (!map.has(`any:${name}`)) {
      map.set(`any:${name}`, scheduleType)
    }
  }

  return map
})

const safeCustomers = computed(() =>
  (data.value || []).filter(customer => customer.status !== 'archived')
)
const safeArchiveCustomers = computed(() => archiveData.value || [])
const safeAdvances = computed(() => advancesData.value || [])

const salaryUserFilter = ref('')
const salaryPagination = ref({
  pageIndex: 0,
  pageSize: 10
})

const filteredSalaryCustomers = computed(() => {
  const query = salaryUserFilter.value.trim().toLowerCase().replace(/^@+/, '')
  if (!query) {
    return safeCustomers.value
  }

  return safeCustomers.value.filter((customer) => {
    const username = (customer.username || '').toLowerCase()
    const fullName = (customer.fullName || '').toLowerCase()
    return username.includes(query) || fullName.includes(query)
  })
})

const paginatedSalaryCustomers = computed(() => {
  const start = salaryPagination.value.pageIndex * salaryPagination.value.pageSize
  return filteredSalaryCustomers.value.slice(start, start + salaryPagination.value.pageSize)
})

const salaryPaginationInfo = computed(() => {
  const total = filteredSalaryCustomers.value.length
  if (!total) {
    return { from: 0, to: 0, total: 0 }
  }

  const from = salaryPagination.value.pageIndex * salaryPagination.value.pageSize + 1
  const to = Math.min(from + salaryPagination.value.pageSize - 1, total)
  return { from, to, total }
})

watch([() => salaryUserFilter.value, safeCustomers], () => {
  salaryPagination.value.pageIndex = 0
})

watch([() => filteredSalaryCustomers.value.length, () => salaryPagination.value.pageSize], () => {
  const total = filteredSalaryCustomers.value.length
  const maxPageIndex = Math.max(0, Math.ceil(total / salaryPagination.value.pageSize) - 1)

  if (salaryPagination.value.pageIndex > maxPageIndex) {
    salaryPagination.value.pageIndex = maxPageIndex
  }
})

const objectFilter = ref<string | null>(null)
const shiftFilter = ref<WorkScheduleType | null>(null)

const objectFilterOptions = computed(() => {
  const seen = new Set<string>()
  const items = (objectsData.value || [])
    .map(item => item.name.trim())
    .filter(Boolean)
    .filter((name) => {
      if (seen.has(name)) return false
      seen.add(name)
      return true
    })
    .map(name => ({ label: name, value: name }))

  return [
    { label: 'Все объекты', value: null },
    ...items
  ]
})

const shiftFilterOptions = [
  { label: 'Все графики', value: null },
  ...WORK_SCHEDULE_OPTIONS
]

function resetUserFilters() {
  objectFilter.value = null
  shiftFilter.value = null
}

watch(() => activeBuilding.value?.id, () => {
  resetUserFilters()
})

const customerOptions = computed(() =>
  safeCustomers.value.map(c => ({
    label: `${c.fullName || c.username} (@${c.username})`,
    value: c.id
  }))
)
const customerNameById = computed(() => {
  const map = new Map<number, string>()
  for (const c of safeCustomers.value) {
    map.set(c.id, c.fullName || c.username)
  }
  return map
})
const safeMonthlyActivities = computed(() => monthlyActivityData.value || [])
const isLoading = computed(() => status.value === 'pending' || status.value === 'idle')
const isArchiveLoading = computed(() => archiveStatus.value === 'pending' || archiveStatus.value === 'idle')
const isAdvancesLoading = computed(() => advancesStatus.value === 'pending' || advancesStatus.value === 'idle')
const isSalaryActivityLoading = computed(() =>
  monthlyActivityStatus.value === 'pending' || monthlyActivityStatus.value === 'idle'
)

const filteredCustomers = computed(() => {
  const selectedObject = typeof objectFilter.value === 'string' ? objectFilter.value.trim() : ''
  const selectedShift = shiftFilter.value

  if (!selectedObject && !selectedShift) {
    return safeCustomers.value
  }

  return safeCustomers.value.filter((customer) => {
    if (selectedObject) {
      const pinned = customer.objectPinned?.trim() || ''
      const positions = Array.isArray(customer.objectPositions) ? customer.objectPositions : []
      const matchesObject = pinned === selectedObject || positions.some(position => position.trim() === selectedObject)

      if (!matchesObject) {
        return false
      }
    }

    if (selectedShift) {
      const shiftKind = getCustomerWorkScheduleType(customer)

      if (shiftKind !== selectedShift) {
        return false
      }
    }

    return true
  })
})

const selectedArchiveCustomers = computed(() =>
  safeArchiveCustomers.value.filter(user => archivedRowSelection.value[user.id])
)
const selectedArchiveCount = computed(() => selectedArchiveCustomers.value.length)
const archiveSelectAllModel = computed<boolean | 'indeterminate'>(() => {
  const total = safeArchiveCustomers.value.length
  if (!total) {
    return false
  }

  const selected = selectedArchiveCount.value
  if (!selected) {
    return false
  }

  if (selected === total) {
    return true
  }

  return 'indeterminate'
})

function toggleAllArchivedSelection(checked: boolean) {
  if (!checked) {
    archivedRowSelection.value = {}
    return
  }

  const next: Record<number, boolean> = {}
  for (const user of safeArchiveCustomers.value) {
    next[user.id] = true
  }
  archivedRowSelection.value = next
}

function setArchivedSelected(userId: number, checked: boolean) {
  archivedRowSelection.value[userId] = checked
}

function clearArchivedSelection() {
  archivedRowSelection.value = {}
}

function getCustomerObjectNames(customer: Customer) {
  return Array.from(new Set([
    customer.objectPinned?.trim(),
    ...(Array.isArray(customer.objectPositions) ? customer.objectPositions : [])
      .map(position => position.trim())
  ].filter((value): value is string => Boolean(value))))
}

function getCustomerWorkScheduleType(customer: Customer): WorkScheduleType {
  const fallback = getLegacyWorkScheduleType({
    workShift: customer.workShift,
    salaryType: customer.salaryType
  })
  const names = getCustomerObjectNames(customer)

  for (const name of names) {
    const exact = objectScheduleByName.value.get(`${customer.buildingId ?? activeBuilding.value?.id ?? 'global'}:${name}`)
    const any = objectScheduleByName.value.get(`any:${name}`)
    const scheduleType = exact || any
    if (scheduleType) {
      return scheduleType
    }
  }

  return fallback
}

function getCustomerWorkSchedule(customer: Customer) {
  return getWorkScheduleDefinition(getCustomerWorkScheduleType(customer))
}

function getObjectScheduleType(object: ObjectItem): WorkScheduleType {
  return normalizeWorkScheduleType(object.scheduleType ?? object.schedule_type)
}

watch(error, (newError) => {
  if (!newError) {
    return
  }

  toast.add({
    title: 'Не удалось загрузить клиентов',
    description: newError.statusMessage || 'Проверьте API и переменные окружения Postgres.',
    color: 'error'
  })
}, { immediate: true })

watch(monthlyActivityError, (newError) => {
  if (!newError) {
    return
  }

  toast.add({
    title: 'Не удалось загрузить активность сотрудников для расчета зарплаты',
    description: newError.statusMessage || 'Проверьте API активности сотрудников.',
    color: 'error'
  })
}, { immediate: true })

watch(data, (customers) => {
  if (!customers?.length) {
    salaryDrafts.value = {}
    return
  }

  const nextSalaryDrafts: Record<number, SalaryDraft> = {}

  for (const customer of customers) {
    nextSalaryDrafts[customer.id] = {
      salaryType: customer.salaryType || 'fixed',
      hourlyRate: String(customer.hourlyRate ?? 0),
      baseSalary: String(customer.baseSalary),
      positionBonus: String(customer.positionBonus),
      saving: false
    }
  }

  salaryDrafts.value = nextSalaryDrafts
}, { immediate: true })

watch(objectsData, (objects) => {
  const nextDrafts: Record<number, ObjectScheduleDraft> = {}

  for (const object of objects || []) {
    nextDrafts[object.id] = {
      scheduleType: getObjectScheduleType(object),
      saving: false
    }
  }

  objectScheduleDrafts.value = nextDrafts
}, { immediate: true })

watch(safeArchiveCustomers, (archivedCustomers) => {
  if (!archivedCustomers.length) {
    archivedRowSelection.value = {}
    return
  }

  const existing = archivedRowSelection.value
  const allowedIds = new Set(archivedCustomers.map(user => user.id))
  let changed = false
  const next: Record<number, boolean> = {}

  for (const [idRaw, checked] of Object.entries(existing)) {
    const id = Number(idRaw)
    if (!checked) {
      continue
    }

    if (!allowedIds.has(id)) {
      changed = true
      continue
    }

    next[id] = true
  }

  if (changed) {
    archivedRowSelection.value = next
  }
})

watch(permanentDeleteArmed, (armed) => {
  if (armed) {
    return
  }

  archivedRowSelection.value = {}
})

function normalizeFormulaValue(value: string, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function resetSalaryFormulaDraft() {
  salaryFormulaDraft.workHoursPerDay = salaryFormulaConfig.value.workHoursPerDay
  salaryFormulaDraft.minutesPerHour = salaryFormulaConfig.value.minutesPerHour
  salaryFormulaDraft.penaltyMultiplier = salaryFormulaConfig.value.penaltyMultiplier
}

function updateSalaryFormulaDraft(
  field: keyof SalaryFormulaConfig,
  value: string | number
) {
  salaryFormulaDraft[field] = String(value ?? '').replace(/[^\d]/g, '')
}

function saveSalaryFormulaConfig() {
  const nextConfig: SalaryFormulaConfig = {
    workHoursPerDay: salaryFormulaDraft.workHoursPerDay,
    minutesPerHour: salaryFormulaDraft.minutesPerHour,
    penaltyMultiplier: salaryFormulaDraft.penaltyMultiplier
  }

  salaryFormulaConfig.value = nextConfig
  salaryFormulaCookie.value = nextConfig
  salaryFormulaOpen.value = false

  toast.add({
    title: 'Формула сохранена',
    description: 'Новые параметры сразу применены к расчету зарплаты.',
    color: 'success'
  })
}

async function exportSalaryExcel() {
  if (exportSalaryLoading.value) return
  exportSalaryLoading.value = true
  try {
    const params = new URLSearchParams()
    if (activeBuilding.value?.id) params.set('buildingId', String(activeBuilding.value.id))
    params.set('from', salaryMonthStart.value)
    params.set('to', salaryMonthEnd.value)
    const response = await fetch(`/api/customers/salary-export?${params.toString()}`)
    if (!response.ok) throw new Error('Не удалось сформировать файл')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'salaries.xlsx'
    link.click()
    URL.revokeObjectURL(url)
    toast.add({ title: 'Выгружено', description: 'Файл Excel сохранён', color: 'success' })
  } catch (error: unknown) {
    toast.add({
      title: 'Ошибка выгрузки',
      description: getErrorMessage(error) || 'Повторите позже',
      color: 'error'
    })
  } finally {
    exportSalaryLoading.value = false
  }
}

watch(salaryFormulaOpen, (value) => {
  if (value) {
    resetSalaryFormulaDraft()
  }
})

function openCustomerInfo(customer: Customer) {
  selectedCustomer.value = customer
  customerInfoOpen.value = true
}

watch(customerInfoOpen, (open) => {
  if (open) return
  customerPasswordVisible.value = false
})

function copyText(value: string, description: string) {
  if (!import.meta.client) return
  navigator.clipboard.writeText(value)
  toast.add({
    title: 'Скопировано',
    description
  })
}

function openCustomerEdit(customer: Customer) {
  editingCustomer.value = customer
  editCustomerOpen.value = true
}

function openArchiveCustomer(customer: Customer) {
  archivingCustomer.value = customer
  archiveComment.value = ''
  archiveModalOpen.value = true
}

watch(editCustomerOpen, (value) => {
  if (!value) {
    editingCustomer.value = null
  }
})

watch(archiveModalOpen, (value) => {
  if (!value) {
    archivingCustomer.value = null
    archiveComment.value = ''
  }
})

function getRowItems(row: Row<Customer>) {
  return [
    {
      type: 'label',
      label: 'Действия'
    },
    {
      label: 'Копировать ID клиента',
      icon: 'i-lucide-copy',
      onSelect() {
        navigator.clipboard.writeText(row.original.id.toString())
        toast.add({
          title: 'Скопировано',
          description: 'ID клиента скопирован в буфер обмена'
        })
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Редактировать клиента',
      icon: 'i-lucide-pencil',
      onSelect() {
        openCustomerEdit(row.original)
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Посмотреть данные клиента',
      icon: 'i-lucide-list',
      onSelect() {
        openCustomerInfo(row.original)
      }
    },
    {
      label: 'Архивировать',
      icon: 'i-lucide-archive',
      color: 'warning',
      onSelect() {
        openArchiveCustomer(row.original)
      }
    }
  ]
}

const userColumns: TableColumn<Customer>[] = [
  {
    id: 'select',
    header: ({ table }) =>
      h(UCheckbox, {
        'modelValue': table.getIsSomePageRowsSelected()
          ? 'indeterminate'
          : table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
          table.toggleAllPageRowsSelected(!!value),
        'ariaLabel': 'Выбрать все'
      }),
    cell: ({ row }) =>
      h(UCheckbox, {
        'modelValue': row.getIsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') => row.toggleSelected(!!value),
        'ariaLabel': 'Выбрать строку'
      })
  },
  {
    accessorKey: 'id',
    header: 'ID'
  },
  {
    accessorKey: 'username',
    header: 'Пользователь',
    cell: ({ row }) => {
      return h('div', { class: 'flex items-center gap-3' }, [
        h(UAvatar, {
          ...row.original.avatar,
          size: 'lg'
        }),
        h('div', undefined, [
          h('button', {
            class: 'font-medium text-highlighted hover:underline',
            onClick: () => openCustomerInfo(row.original)
          }, `@${row.original.username}`),
          h('p', { class: 'text-muted' }, row.original.phoneNumber)
        ])
      ])
    }
  },
  {
    accessorKey: 'age',
    header: 'Возраст'
  },
  {
    accessorKey: 'workShift',
    header: 'График',
    cell: ({ row }) => {
      const schedule = getCustomerWorkSchedule(row.original)
      const color = schedule.type === 'day_12h'
        ? 'success'
        : schedule.type === 'night_12h'
          ? 'warning'
          : schedule.type === 'hourly'
            ? 'primary'
            : 'neutral'
      return h(UBadge, { variant: 'subtle', color }, () => schedule.shortLabel)
    }
  },
  {
    accessorKey: 'objectPinned',
    header: 'Закрепленный объект'
  },
  {
    accessorKey: 'objectPositions',
    header: 'Позиции',
    cell: ({ row }) => row.original.objectPositions.join(', ')
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      return h(
        'div',
        { class: 'text-right' },
        h(
          UDropdownMenu,
          {
            content: {
              align: 'end'
            },
            items: getRowItems(row)
          },
          () =>
            h(UButton, {
              icon: 'i-lucide-ellipsis-vertical',
              color: 'neutral',
              variant: 'ghost',
              class: 'ml-auto'
            })
        )
      )
    }
  }
]

const username = computed({
  get: (): string => {
    return (table.value?.tableApi?.getColumn('username')?.getFilterValue() as string) || ''
  },
  set: (value: string) => {
    table.value?.tableApi?.getColumn('username')?.setFilterValue(value || undefined)
  }
})

const pagination = ref({
  pageIndex: 0,
  pageSize: 10
})

const columnLabelMap: Record<string, string> = {
  select: 'Выбор',
  id: 'ID',
  username: 'Пользователь',
  age: 'Возраст',
  workShift: 'График',
  objectPinned: 'Закрепленный объект',
  objectPositions: 'Позиции',
  actions: 'Действия'
}

function getColumnLabel(columnId: string) {
  return columnLabelMap[columnId] || upperFirst(columnId)
}

type ObjectScheduleCardColor = 'success' | 'warning' | 'primary' | 'neutral'
interface ObjectScheduleCard {
  id: WorkScheduleType
  label: string
  description: string
  color: ObjectScheduleCardColor
  objects: ObjectItem[]
}

function getScheduleCardColor(type: WorkScheduleType): ObjectScheduleCardColor {
  if (type === 'day_12h') return 'success'
  if (type === 'night_12h') return 'warning'
  if (type === 'hourly') return 'primary'
  return 'neutral'
}

const objectScheduleStats = computed<ObjectScheduleCard[]>(() =>
  WORK_SCHEDULE_DEFINITIONS.map(schedule => ({
    id: schedule.type,
    label: schedule.label,
    description: schedule.description,
    color: getScheduleCardColor(schedule.type),
    objects: (objectsData.value || []).filter(object => getObjectScheduleType(object) === schedule.type)
  }))
)

const scheduleModalOpen = ref(false)
const selectedScheduleType = ref<WorkScheduleType | null>(null)
const activeScheduleCard = computed(() =>
  objectScheduleStats.value.find(schedule => schedule.id === selectedScheduleType.value) || null
)
const activeScheduleObjects = computed(() => activeScheduleCard.value?.objects || [])

function openScheduleModal(scheduleType: WorkScheduleType) {
  selectedScheduleType.value = scheduleType
  scheduleModalOpen.value = true
}

watch(scheduleModalOpen, (isOpen) => {
  if (isOpen) {
    return
  }

  selectedScheduleType.value = null
})

function formatCurrency(value: number) {
  return new Intl.NumberFormat('uz-UZ', {
    style: 'currency',
    currency: 'UZS',
    maximumFractionDigits: 0
  }).format(value)
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const lateMinutesByEmployee = computed(() => {
  const totals: Record<number, number> = {}

  for (const activity of safeMonthlyActivities.value) {
    if (!activity.employeeId) {
      continue
    }

    totals[activity.employeeId] = (totals[activity.employeeId] || 0) + (activity.lateMinutes || 0)
  }

  return totals
})

const workMinutesByEmployee = computed(() => {
  const totals: Record<number, number> = {}

  for (const activity of safeMonthlyActivities.value) {
    if (!activity.employeeId) {
      continue
    }

    totals[activity.employeeId] = (totals[activity.employeeId] || 0) + (activity.workMinutes || 0)
  }

  return totals
})

const advanceFilterCustomerId = ref<number | null>(null)
const advanceFilterCustomerModel = computed<number | undefined>({
  get: () => advanceFilterCustomerId.value ?? undefined,
  set: (value) => {
    advanceFilterCustomerId.value = typeof value === 'number' ? value : null
  }
})
const advanceForm = reactive({
  customerId: null as number | null,
  amount: 0,
  currency: 'UZS',
  comment: '',
  status: 'issued' as Advance['status']
})
const advanceFormCustomerModel = computed<number | undefined>({
  get: () => advanceForm.customerId ?? undefined,
  set: (value) => {
    advanceForm.customerId = typeof value === 'number' ? value : null
  }
})

const filteredAdvances = computed(() => {
  const list = safeAdvances.value || []
  if (!advanceFilterCustomerId.value) return list
  return list.filter(a => a.customerId === advanceFilterCustomerId.value)
})

function getBaseSalary(customerId: number) {
  const draft = salaryDrafts.value[customerId]
  if (!draft) {
    return 0
  }

  return Number(draft.baseSalary) || 0
}

function getSalaryType(customerId: number) {
  const customer = safeCustomers.value.find(item => item.id === customerId)
  if (customer) {
    return getCustomerWorkSchedule(customer).salaryType
  }

  const draft = salaryDrafts.value[customerId]
  return draft?.salaryType === 'hourly' ? 'hourly' : 'fixed'
}

function getSalaryWorkHoursPerDay(customerId: number) {
  const customer = safeCustomers.value.find(item => item.id === customerId)
  if (!customer) {
    return effectiveWorkHoursPerDay.value
  }

  const hoursPerDay = getCustomerWorkSchedule(customer).hoursPerDay
  return hoursPerDay || effectiveWorkHoursPerDay.value
}

function getHourlyRate(customerId: number) {
  const draft = salaryDrafts.value[customerId]
  if (!draft) {
    return 0
  }

  return Number(draft.hourlyRate) || 0
}

function getPositionBonus(customerId: number) {
  const draft = salaryDrafts.value[customerId]
  if (!draft) {
    return 0
  }

  return Number(draft.positionBonus) || 0
}

function getEmployeeLateMinutes(customerId: number) {
  return lateMinutesByEmployee.value[customerId] || 0
}

function getEmployeeWorkMinutes(customerId: number) {
  return workMinutesByEmployee.value[customerId] || 0
}

function formatWorkMinutes(totalMinutes: number) {
  const minutes = Number.isFinite(totalMinutes) ? Math.max(0, Math.floor(totalMinutes)) : 0
  const hoursPart = Math.floor(minutes / 60)
  const minutesPart = minutes % 60

  if (!minutesPart) {
    return `${hoursPart} ч`
  }

  return `${hoursPart} ч ${minutesPart} мин`
}

function getHourlySalary(customerId: number) {
  const hourlyRate = getHourlyRate(customerId)
  const workMinutes = getEmployeeWorkMinutes(customerId)

  if (!hourlyRate || !workMinutes) {
    return 0
  }

  return Math.round((hourlyRate / 60) * workMinutes)
}

function getLatePenalty(customerId: number) {
  if (getSalaryType(customerId) === 'hourly') {
    return 0
  }

  const baseSalary = getBaseSalary(customerId)
  const lateMinutes = getEmployeeLateMinutes(customerId)

  if (!baseSalary || !lateMinutes || !effectiveSalaryMonthDays.value) {
    return 0
  }

  const perMinuteRate = baseSalary
    / effectiveSalaryMonthDays.value
    / getSalaryWorkHoursPerDay(customerId)
    / effectiveMinutesPerHour.value

  return Math.round(perMinuteRate * effectivePenaltyMultiplier.value * lateMinutes)
}

async function archiveCustomer() {
  if (!archivingCustomer.value) {
    return
  }
  if (!archiveComment.value.trim()) {
    toast.add({ title: 'Комментарий обязателен', color: 'warning' })
    return
  }

  try {
    await $fetch(`/api/customers/${archivingCustomer.value.id}`, {
      method: 'PATCH',
      body: {
        status: 'archived',
        archivedAt: new Date().toISOString(),
        deactivationComment: archiveComment.value.trim()
      }
    })
    toast.add({ title: 'Пользователь архивирован', color: 'success' })
    archiveModalOpen.value = false
    await Promise.all([refresh(), refreshArchive()])
  } catch (error: unknown) {
    toast.add({
      title: 'Не удалось архивировать',
      description: getErrorMessage(error),
      color: 'error'
    })
  }
}

async function restoreCustomer(user: Customer) {
  try {
    await $fetch(`/api/customers/${user.id}/archive`, {
      method: 'DELETE'
    })
    toast.add({ title: 'Пользователь активирован', color: 'success' })
    await Promise.all([refresh(), refreshArchive()])
  } catch (error: unknown) {
    toast.add({
      title: 'Не удалось активировать',
      description: getErrorMessage(error),
      color: 'error'
    })
  }
}

async function permanentlyDeleteCustomer(user: Customer) {
  if (permanentlyDeletingCustomerId.value) {
    return
  }

  permanentlyDeletingCustomerId.value = user.id

  try {
    await $fetch(`/api/customers/${user.id}/permanent`, {
      method: 'DELETE'
    })

    toast.add({ title: 'Пользователь удален', color: 'success' })
    await Promise.all([refresh(), refreshArchive()])
  } catch (error: unknown) {
    toast.add({
      title: 'Не удалось удалить пользователя',
      description: getErrorMessage(error),
      color: 'error'
    })
  } finally {
    permanentlyDeletingCustomerId.value = null
  }
}

async function permanentlyDeleteSelectedArchivedCustomers() {
  if (!selectedArchiveCount.value || deletingSelectedArchived.value) {
    return
  }

  deletingSelectedArchived.value = true

  const toDelete = selectedArchiveCustomers.value.map(user => user.id)
  const results = await Promise.allSettled(toDelete.map(async id =>
    $fetch(`/api/customers/${id}/permanent`, { method: 'DELETE' })
  ))

  const successCount = results.filter(r => r.status === 'fulfilled').length
  const failedCount = results.length - successCount
  const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined

  if (failedCount) {
    const errorMessage = firstError?.reason ? getErrorMessage(firstError.reason) : undefined
    toast.add({
      title: 'Удаление завершено с ошибками',
      description: `Удалено: ${successCount}, ошибок: ${failedCount}${errorMessage ? `. ${errorMessage}` : ''}`,
      color: 'warning'
    })
  } else {
    toast.add({
      title: 'Удалено',
      description: `Удалено пользователей: ${successCount}`,
      color: 'success'
    })
  }

  archivedRowSelection.value = {}
  deletingSelectedArchived.value = false
  await Promise.all([refresh(), refreshArchive()])
}

function getCardPayout(customerId: number) {
  const cardGross = getSalaryType(customerId) === 'hourly'
    ? getHourlySalary(customerId)
    : getBaseSalary(customerId)

  return Math.max(cardGross - getLatePenalty(customerId), 0)
}

function getCashPayout(customerId: number) {
  return Math.max(getPositionBonus(customerId), 0)
}

function getSalaryTotal(customerId: number) {
  return getCardPayout(customerId) + getCashPayout(customerId)
}

const salaryExpenseSummary = computed(() => {
  return filteredSalaryCustomers.value.reduce((summary, customer) => {
    summary.card += getCardPayout(customer.id)
    summary.cash += getCashPayout(customer.id)
    summary.total += getSalaryTotal(customer.id)
    return summary
  }, {
    card: 0,
    cash: 0,
    total: 0
  })
})

function updateSalaryDraft(customerId: number, field: 'baseSalary' | 'positionBonus' | 'hourlyRate', value: string | number) {
  const draft = salaryDrafts.value[customerId]
  if (!draft) {
    return
  }

  const allowNegative = field === 'positionBonus'
  let str = String(value ?? '')
  str = str.replace(/[^\d-]/g, '')
  if (allowNegative) {
    str = str.replace(/(?!^)-/g, '')
  } else {
    str = str.replace(/-/g, '')
  }
  draft[field] = str
}

function parseNonNegativeInteger(value: unknown, fieldName: string) {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Поле ${fieldName} должно быть целым числом не меньше 0.`)
  }

  return amount
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    return err.data?.statusMessage || err.message
  }

  return undefined
}

async function createAdvance() {
  if (!advanceForm.customerId) {
    toast.add({ title: 'Выберите сотрудника', color: 'warning' })
    return
  }
  if (!advanceForm.amount || advanceForm.amount <= 0) {
    toast.add({ title: 'Сумма должна быть больше 0', color: 'warning' })
    return
  }

  try {
    await $fetch('/api/customers/advances', {
      method: 'POST',
      body: {
        customerId: advanceForm.customerId,
        amount: Math.round(advanceForm.amount),
        currency: advanceForm.currency,
        comment: advanceForm.comment || undefined,
        buildingId: activeBuilding.value?.id ?? null
      }
    })
    toast.add({ title: 'Аванс создан', color: 'success' })
    Object.assign(advanceForm, { customerId: null, amount: 0, currency: 'UZS', comment: '', status: 'issued' as Advance['status'] })
    await refreshAdvances()
  } catch (error: unknown) {
    toast.add({
      title: 'Не удалось создать аванс',
      description: getErrorMessage(error),
      color: 'error'
    })
  }
}

function isImageLike(path: string) {
  return /\.(png|jpe?g|webp|gif|bmp|avif|tiff)$/i.test(path)
}

function buildPassportPublicUrl(rawPath: string) {
  const trimmed = rawPath?.trim()
  if (!trimmed) {
    return ''
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }

  const baseUrl = runtimeConfig.public?.storageBaseUrl
  const bucket = runtimeConfig.public?.storagePassportBucket || 'customer-passports'
  if (!baseUrl) {
    return trimmed
  }

  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const normalizedPath = trimmed.replace(/^\/+/, '')

  const pathWithBucket = normalizedPath.startsWith('storage/v1/object')
    ? normalizedPath
    : normalizedPath.startsWith(`${bucket}/`)
      ? normalizedPath
      : `${bucket}/${normalizedPath}`

  if (pathWithBucket.startsWith('storage/v1/object')) {
    return `${normalizedBase}/${pathWithBucket}`
  }

  return `${normalizedBase}/storage/v1/object/public/${pathWithBucket}`
}

function parsePassportJson(passportFile: string) {
  try {
    const parsed = JSON.parse(passportFile) as { front?: string, back?: string }
    return parsed
  } catch {
    return {}
  }
}

function getPassportEntries(customer: Customer): PassportFileEntry[] {
  const entries: PassportFileEntry[] = []
  const parsed = customer.passportFile ? parsePassportJson(customer.passportFile) : {}

  const pushEntry = (label: string, raw?: string | null) => {
    if (!raw) return
    const url = buildPassportPublicUrl(raw)
    entries.push({
      label,
      value: raw,
      url,
      isImage: isImageLike(raw)
    })
  }

  pushEntry('Лицевая сторона', customer.passportFrontPath || parsed.front)
  pushEntry('Обратная сторона', customer.passportBackPath || parsed.back)

  if (!entries.length) {
    pushEntry('Файл паспорта', customer.passportFile)
  }

  return entries
}

const selectedCustomers = computed(() => {
  return (table.value?.tableApi?.getFilteredSelectedRowModel().rows || [])
    .map(row => row.original as Customer)
})

async function deleteSelectedCustomers() {
  if (!selectedCustomers.value.length || deletingSelected.value) {
    return
  }

  const countToDelete = selectedCustomers.value.length
  deletingSelected.value = true

  try {
    await Promise.all(selectedCustomers.value.map(async (customer) => {
      await $fetch(`/api/customers/${customer.id}`, {
        method: 'DELETE'
      })
    }))

    toast.add({
      title: 'Удалено',
      description: `Удалено пользователей: ${countToDelete}`,
      color: 'success'
    })
    rowSelection.value = {}
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось удалить пользователей',
      description: getErrorMessage(err) || 'Повторите попытку.',
      color: 'error'
    })
  } finally {
    deletingSelected.value = false
  }
}

async function saveObjectSchedule(object: ObjectItem) {
  const draft = objectScheduleDrafts.value[object.id]
  if (!draft || draft.saving) {
    return
  }

  draft.saving = true

  try {
    await $fetch(`/api/objects/${object.id}`, {
      method: 'PATCH',
      body: {
        scheduleType: draft.scheduleType
      }
    })

    toast.add({
      title: 'График сохранен',
      description: `Объект "${object.name}" обновлен.`,
      color: 'success'
    })
    await refreshObjects()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось сохранить график',
      description: getErrorMessage(err) || 'Повторите попытку.',
      color: 'error'
    })
  } finally {
    draft.saving = false
  }
}

async function saveCustomerSalary(customer: Customer) {
  const draft = salaryDrafts.value[customer.id]
  if (!draft || draft.saving) {
    return
  }

  draft.saving = true

  try {
    const positionBonus = parseNonNegativeInteger(draft.positionBonus, 'надбавка')
    const schedule = getCustomerWorkSchedule(customer)
    const salaryType = schedule.salaryType
    const payload: Record<string, unknown> = {
      salaryType,
      workShift: schedule.workShift,
      positionBonus
    }

    if (salaryType === 'hourly') {
      const hourlyRate = parseNonNegativeInteger(draft.hourlyRate, 'ставка в час')
      if (!hourlyRate) {
        throw new Error('Ставка в час должна быть больше 0.')
      }
      payload.hourlyRate = hourlyRate
    } else {
      const baseSalary = parseNonNegativeInteger(draft.baseSalary, 'базовая зарплата')
      payload.baseSalary = baseSalary
    }

    await $fetch(`/api/customers/${customer.id}`, {
      method: 'PATCH',
      body: payload
    })

    toast.add({
      title: 'Сохранено',
      description: `Зарплата пользователя @${customer.username} обновлена.`,
      color: 'success'
    })
    await refresh()
  } catch (err: unknown) {
    toast.add({
      title: 'Не удалось сохранить зарплату',
      description: getErrorMessage(err) || 'Проверьте значения и повторите попытку.',
      color: 'error'
    })
  } finally {
    draft.saving = false
  }
}
</script>

<template>
  <UDashboardPanel id="hr">
    <template #header>
      <UDashboardNavbar title="Кадры" :ui="{ right: 'gap-2' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div v-if="selectedHrTab === 'users'" class="flex flex-wrap items-center gap-2">
            <CustomersAddModal @saved="refresh()" />
            <CustomersBulkImport />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UTabs
          v-model="selectedHrTab"
          :items="hrTabs"
          :content="false"
          class="w-max"
          :ui="{ list: 'w-max' }"
        />

        <div v-if="selectedHrTab === 'users'" class="space-y-4">
          <div class="text-sm text-muted">
            {{ activeBuilding?.name ? `Здание: ${activeBuilding.name}` : 'Здание не выбрано' }}
          </div>

          <div class="grid grid-cols-[1fr_auto] items-end gap-2">
            <div class="flex flex-wrap items-end gap-2">
              <UInput
                v-model="username"
                class="max-w-sm"
                icon="i-lucide-search"
                placeholder="Фильтр по имени пользователя..."
              />

              <UFormField label="Объект" class="min-w-60">
                <USelect
                  v-model="objectFilter"
                  :items="objectFilterOptions"
                  placeholder="Все объекты"
                />
              </UFormField>

              <UFormField label="График" class="min-w-44">
                <USelect
                  v-model="shiftFilter"
                  :items="shiftFilterOptions"
                  placeholder="Все графики"
                />
              </UFormField>

              <UButton
                v-if="objectFilter || shiftFilter"
                label="Сбросить"
                icon="i-lucide-refresh-ccw"
                color="neutral"
                variant="outline"
                @click="resetUserFilters"
              />
            </div>

            <div class="flex flex-wrap items-center justify-end gap-2">
              <CustomersDeleteModal
                :count="table?.tableApi?.getFilteredSelectedRowModel().rows.length"
                :loading="deletingSelected"
                @confirm="deleteSelectedCustomers"
              >
                <UButton
                  v-if="table?.tableApi?.getFilteredSelectedRowModel().rows.length"
                  label="Удалить"
                  color="error"
                  variant="subtle"
                  icon="i-lucide-trash"
                  :loading="deletingSelected"
                >
                  <template #trailing>
                    <UKbd>
                      {{ table?.tableApi?.getFilteredSelectedRowModel().rows.length }}
                    </UKbd>
                  </template>
                </UButton>
              </CustomersDeleteModal>

              <UDropdownMenu
                :items="
                  table?.tableApi
                    ?.getAllColumns()
                    .filter((column: any) => column.getCanHide())
                    .map((column: any) => ({
                      label: getColumnLabel(column.id),
                      type: 'checkbox' as const,
                      checked: column.getIsVisible(),
                      onUpdateChecked(checked: boolean) {
                        table?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked)
                      },
                      onSelect(e?: Event) {
                        e?.preventDefault()
                      }
                    }))
                "
                :content="{ align: 'end' }"
              >
                <UButton
                  label="Отображение"
                  color="neutral"
                  variant="outline"
                  trailing-icon="i-lucide-settings-2"
                />
              </UDropdownMenu>
            </div>
          </div>

          <UTable
            ref="table"
            v-model:column-filters="columnFilters"
            v-model:column-visibility="columnVisibility"
            v-model:row-selection="rowSelection"
            v-model:pagination="pagination"
            :pagination-options="{
              getPaginationRowModel: getPaginationRowModel()
            }"
            class="shrink-0"
            :data="filteredCustomers"
            :columns="userColumns"
            :loading="isLoading"
            :ui="{
              base: 'table-fixed border-separate border-spacing-0',
              thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
              tbody: '[&>tr]:last:[&>td]:border-b-0',
              th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
              td: 'border-b border-default',
              separator: 'h-0'
            }"
          />

          <div class="flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto">
            <div class="text-sm text-muted">
              Выбрано {{ table?.tableApi?.getFilteredSelectedRowModel().rows.length || 0 }} из
              {{ table?.tableApi?.getFilteredRowModel().rows.length || 0 }} строк.
            </div>

            <div class="flex items-center gap-2">
              <UPagination
                :default-page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
                :items-per-page="table?.tableApi?.getState().pagination.pageSize"
                :total="table?.tableApi?.getFilteredRowModel().rows.length"
                @update:page="(p: number) => table?.tableApi?.setPageIndex(p - 1)"
              />
            </div>
          </div>
        </div>

        <div v-else-if="selectedHrTab === 'shifts'" class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <button
              v-for="schedule in objectScheduleStats"
              :key="schedule.id"
              type="button"
              class="rounded-lg border border-default bg-elevated/30 p-4 space-y-3 text-left hover:bg-elevated/40 transition-colors"
              @click="openScheduleModal(schedule.id)"
            >
              <div class="flex items-center justify-between">
                <p class="font-semibold text-highlighted">
                  {{ schedule.label }}
                </p>
                <UBadge :label="String(schedule.objects.length)" :color="schedule.color" variant="subtle" />
              </div>
              <p class="text-xs text-muted">
                {{ schedule.description }}
              </p>
            </button>
          </div>

          <UModal
            v-model:open="scheduleModalOpen"
            fullscreen
            :title="activeScheduleCard?.label || 'График объекта'"
            :description="activeScheduleCard?.description"
          >
            <template #body>
              <div v-if="activeScheduleObjects.length" class="rounded-lg border border-default overflow-x-auto">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="bg-elevated/50">
                      <th class="px-3 py-2 text-left">
                        ID
                      </th>
                      <th class="px-3 py-2 text-left">
                        Объект
                      </th>
                      <th class="px-3 py-2 text-left">
                        График
                      </th>
                      <th class="px-3 py-2 text-right">
                        Действие
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="object in activeScheduleObjects"
                      :key="object.id"
                      class="border-t border-default"
                      :class="objectScheduleDrafts[object.id]?.scheduleType !== getObjectScheduleType(object) ? 'bg-elevated/20' : undefined"
                    >
                      <td class="px-3 py-2">
                        #{{ object.id }}
                      </td>
                      <td class="px-3 py-2">
                        <p class="font-medium">
                          {{ object.name }}
                        </p>
                      </td>
                      <td class="px-3 py-2">
                        <USelect
                          v-model="objectScheduleDrafts[object.id]!.scheduleType"
                          :items="WORK_SCHEDULE_OPTIONS"
                          class="w-56"
                        />
                      </td>
                      <td class="px-3 py-2 text-right">
                        <UButton
                          label="Сохранить"
                          size="sm"
                          color="primary"
                          :disabled="objectScheduleDrafts[object.id]!.scheduleType === getObjectScheduleType(object)"
                          :loading="objectScheduleDrafts[object.id]!.saving"
                          @click="saveObjectSchedule(object)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="text-sm text-muted">
                Нет объектов с этим графиком.
              </p>
            </template>

            <template #footer>
              <div class="flex justify-end">
                <UButton
                  label="Закрыть"
                  color="neutral"
                  variant="subtle"
                  @click="scheduleModalOpen = false"
                />
              </div>
            </template>
          </UModal>
        </div>

        <div v-else-if="selectedHrTab === 'advances'" class="space-y-4">
          <div class="flex flex-wrap items-center gap-3">
            <UFormField label="Сотрудник" class="min-w-60">
              <USelect
                v-model="advanceFilterCustomerModel"
                :items="[{ label: 'Все', value: undefined }, ...customerOptions]"
                placeholder="Фильтр по сотруднику"
              />
            </UFormField>
            <UFormField label="Добавить аванс" class="flex-1">
              <div class="grid gap-2 sm:grid-cols-4">
                <USelect v-model="advanceFormCustomerModel" :items="customerOptions" placeholder="Сотрудник" />
                <UInput
                  v-model="advanceForm.amount"
                  type="number"
                  min="0"
                  step="10000"
                  placeholder="Сумма"
                />
                <UInput v-model="advanceForm.comment" placeholder="Комментарий" />
                <UButton
                  label="Добавить"
                  color="primary"
                  icon="i-lucide-plus"
                  @click="createAdvance"
                />
              </div>
            </UFormField>
          </div>

          <div class="rounded-lg border border-default bg-elevated/30 overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-elevated/50">
                  <th class="px-3 py-2 text-left">
                    ID
                  </th>
                  <th class="px-3 py-2 text-left">
                    Сотрудник
                  </th>
                  <th class="px-3 py-2 text-left">
                    Сумма
                  </th>
                  <th class="px-3 py-2 text-left">
                    Статус
                  </th>
                  <th class="px-3 py-2 text-left">
                    Комментарий
                  </th>
                  <th class="px-3 py-2 text-left">
                    Дата
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="isAdvancesLoading">
                  <td class="px-3 py-3 text-muted" colspan="6">
                    Загрузка...
                  </td>
                </tr>
                <tr
                  v-for="adv in filteredAdvances"
                  :key="adv.id"
                  class="border-t border-default"
                >
                  <td class="px-3 py-2">
                    #{{ adv.id }}
                  </td>
                  <td class="px-3 py-2">
                    {{ customerNameById.get(adv.customerId) || adv.customerId }}
                  </td>
                  <td class="px-3 py-2">
                    {{ new Intl.NumberFormat('ru-RU').format(adv.amount) }} {{ adv.currency }}
                  </td>
                  <td class="px-3 py-2">
                    <UBadge :label="adv.status" :color="adv.status === 'issued' ? 'warning' : 'success'" variant="subtle" />
                  </td>
                  <td class="px-3 py-2">
                    {{ adv.comment || '—' }}
                  </td>
                  <td class="px-3 py-2">
                    {{ formatDate(adv.issuedAt) }}
                  </td>
                </tr>
                <tr v-if="!isAdvancesLoading && !filteredAdvances.length">
                  <td class="px-3 py-3 text-muted" colspan="6">
                    Авансов пока нет.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-else-if="selectedHrTab === 'roles'" class="space-y-4">
          <HrRolesTab />
        </div>

        <div v-else-if="selectedHrTab === 'archive'" class="space-y-4">
          <div class="text-sm text-muted">
            Архивированные пользователи. При необходимости их можно восстановить.
          </div>
          <div class="rounded-lg border border-default bg-elevated/30 p-3 space-y-2">
            <div class="flex flex-wrap items-center gap-3">
              <UCheckbox v-model="permanentDeleteArmed" label="Разрешить полное удаление" />

              <div v-if="permanentDeleteArmed" class="flex flex-wrap items-center gap-3">
                <UCheckbox
                  :model-value="archiveSelectAllModel"
                  aria-label="Выбрать всех"
                  label="Выбрать всех"
                  :disabled="deletingSelectedArchived || permanentlyDeletingCustomerId !== null"
                  @update:model-value="(value: boolean | 'indeterminate') => toggleAllArchivedSelection(!!value)"
                />

                <CustomersDeleteModal
                  v-if="selectedArchiveCount"
                  :count="selectedArchiveCount"
                  :loading="deletingSelectedArchived"
                  @confirm="permanentlyDeleteSelectedArchivedCustomers"
                >
                  <UButton
                    label="Удалить выбранных"
                    color="error"
                    variant="outline"
                    icon="i-lucide-trash"
                    :loading="deletingSelectedArchived"
                    :disabled="deletingSelectedArchived || permanentlyDeletingCustomerId !== null"
                  >
                    <template #trailing>
                      <UKbd>
                        {{ selectedArchiveCount }}
                      </UKbd>
                    </template>
                  </UButton>
                </CustomersDeleteModal>

                <UButton
                  v-if="selectedArchiveCount"
                  label="Снять выделение"
                  color="neutral"
                  variant="subtle"
                  :disabled="deletingSelectedArchived || permanentlyDeletingCustomerId !== null"
                  @click="clearArchivedSelection"
                />
              </div>
            </div>
            <p class="text-xs text-muted">
              Удаляет сотрудника и связанные данные (например, задачи и авансы). Действие необратимо.
            </p>
          </div>
          <div class="rounded-lg border border-default bg-elevated/30 overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-elevated/50">
                  <th v-if="permanentDeleteArmed" class="px-3 py-2 text-left">
                    <UCheckbox
                      :model-value="archiveSelectAllModel"
                      aria-label="Выбрать все"
                      :disabled="deletingSelectedArchived || permanentlyDeletingCustomerId !== null"
                      @update:model-value="(value: boolean | 'indeterminate') => toggleAllArchivedSelection(!!value)"
                    />
                  </th>
                  <th class="px-3 py-2 text-left">
                    ID
                  </th>
                  <th class="px-3 py-2 text-left">
                    Пользователь
                  </th>
                  <th class="px-3 py-2 text-left">
                    Комментарий
                  </th>
                  <th class="px-3 py-2 text-left">
                    Дата архивации
                  </th>
                  <th class="px-3 py-2 text-left" />
                </tr>
              </thead>
              <tbody>
                <tr v-if="isArchiveLoading">
                  <td class="px-3 py-3 text-muted" :colspan="permanentDeleteArmed ? 6 : 5">
                    Загрузка...
                  </td>
                </tr>
                <tr
                  v-for="user in safeArchiveCustomers"
                  :key="user.id"
                  class="border-t border-default"
                >
                  <td v-if="permanentDeleteArmed" class="px-3 py-2">
                    <UCheckbox
                      :model-value="!!archivedRowSelection[user.id]"
                      aria-label="Выбрать сотрудника"
                      :disabled="deletingSelectedArchived || permanentlyDeletingCustomerId !== null"
                      @update:model-value="(value: boolean | 'indeterminate') => setArchivedSelected(user.id, !!value)"
                    />
                  </td>
                  <td class="px-3 py-2">
                    #{{ user.id }}
                  </td>
                  <td class="px-3 py-2">
                    @{{ user.username }}
                  </td>
                  <td class="px-3 py-2">
                    {{ user.deactivationComment || '—' }}
                  </td>
                  <td class="px-3 py-2">
                    {{ user.archivedAt ? formatDate(user.archivedAt) : '—' }}
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex items-center justify-end gap-2">
                      <UButton
                        size="xs"
                        color="primary"
                        variant="outline"
                        label="Активировать"
                        :disabled="deletingSelectedArchived || permanentlyDeletingCustomerId !== null"
                        @click="restoreCustomer(user)"
                      />

                      <CustomersDeleteModal
                        v-if="permanentDeleteArmed"
                        :count="1"
                        :loading="permanentlyDeletingCustomerId === user.id"
                        @confirm="permanentlyDeleteCustomer(user)"
                      >
                        <UButton
                          size="xs"
                          color="error"
                          variant="outline"
                          label="Удалить"
                          :disabled="deletingSelectedArchived || permanentlyDeletingCustomerId !== null"
                          :loading="permanentlyDeletingCustomerId === user.id"
                        />
                      </CustomersDeleteModal>
                    </div>
                  </td>
                </tr>
                <tr v-if="!isArchiveLoading && !safeArchiveCustomers.length">
                  <td class="px-3 py-3 text-muted" :colspan="permanentDeleteArmed ? 6 : 5">
                    Архив пуст.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-else class="space-y-4">
          <div class="rounded-lg border border-default bg-elevated/30 p-4 text-sm text-muted">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="font-medium text-highlighted">
                  Расчет за {{ salaryMonthLabel }}
                </p>
                <p class="mt-1">
                  Для оклада: (базовая / дней в месяце / часы графика объекта / {{ effectiveMinutesPerHour }}) * {{ effectivePenaltyMultiplier }} * минуты опоздания.
                </p>
                <p class="mt-1">
                  Для почасовой: (ставка/час / 60) * отработанные минуты. Оклад идет на карту, надбавка отражается как наличная часть.
                </p>
              </div>

              <UButton
                icon="i-lucide-settings-2"
                color="neutral"
                variant="subtle"
                square
                aria-label="Настроить формулу зарплаты"
                @click="salaryFormulaOpen = true"
              />
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-lg border border-default bg-elevated/30 p-4">
              <p class="text-xs text-muted">
                На карты
              </p>
              <p class="text-lg font-semibold">
                {{ formatCurrency(salaryExpenseSummary.card) }}
              </p>
            </div>
            <div class="rounded-lg border border-default bg-elevated/30 p-4">
              <p class="text-xs text-muted">
                Наличными
              </p>
              <p class="text-lg font-semibold">
                {{ formatCurrency(salaryExpenseSummary.cash) }}
              </p>
            </div>
            <div class="rounded-lg border border-default bg-elevated/30 p-4">
              <p class="text-xs text-muted">
                Всего начислено
              </p>
              <p class="text-lg font-semibold">
                {{ formatCurrency(salaryExpenseSummary.total) }}
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-end justify-between gap-2">
            <UInput
              v-model="salaryUserFilter"
              class="max-w-sm"
              icon="i-lucide-search"
              placeholder="Фильтр по имени пользователя..."
            />

            <UButton
              v-if="salaryUserFilter"
              label="Сбросить"
              icon="i-lucide-refresh-ccw"
              color="neutral"
              variant="outline"
              @click="salaryUserFilter = ''"
            />
          </div>

          <div class="rounded-lg border border-default overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-elevated/50">
                  <th class="px-3 py-2 text-left">
                    ID
                  </th>
                  <th class="px-3 py-2 text-left">
                    Пользователь
                  </th>
                  <th class="px-3 py-2 text-left">
                    График
                  </th>
                  <th class="px-3 py-2 text-left">
                    Оклад / ставка
                  </th>
                  <th class="px-3 py-2 text-left">
                    Надбавка
                  </th>
                  <th class="px-3 py-2 text-left">
                    На карту
                  </th>
                  <th class="px-3 py-2 text-left">
                    Наличные
                  </th>
                  <th class="px-3 py-2 text-left">
                    Итого
                  </th>
                  <th class="px-3 py-2 text-right">
                    Действие
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="isLoading && !filteredSalaryCustomers.length">
                  <td class="px-3 py-3 text-muted" colspan="9">
                    Загрузка...
                  </td>
                </tr>
                <tr
                  v-for="customer in paginatedSalaryCustomers"
                  :key="customer.id"
                  class="border-t border-default"
                >
                  <td class="px-3 py-2">
                    {{ customer.id }}
                  </td>
                  <td class="px-3 py-2">
                    <div>
                      <p class="font-medium">
                        @{{ customer.username }}
                      </p>
                      <p class="text-xs text-muted">
                        {{ customer.objectPinned || 'Без объекта' }}
                      </p>
                    </div>
                  </td>
                  <td class="px-3 py-2 min-w-40">
                    <UBadge
                      :label="getCustomerWorkSchedule(customer).shortLabel"
                      :color="getScheduleCardColor(getCustomerWorkScheduleType(customer))"
                      variant="subtle"
                    />
                  </td>
                  <td class="px-3 py-2 min-w-48">
                    <UInput
                      v-if="getSalaryType(customer.id) === 'hourly'"
                      :model-value="salaryDrafts[customer.id]?.hourlyRate ?? ''"
                      type="number"
                      min="0"
                      step="1"
                      inputmode="numeric"
                      @update:model-value="updateSalaryDraft(customer.id, 'hourlyRate', $event)"
                    />
                    <UInput
                      v-else
                      :model-value="salaryDrafts[customer.id]?.baseSalary ?? ''"
                      type="number"
                      min="0"
                      step="1"
                      inputmode="numeric"
                      @update:model-value="updateSalaryDraft(customer.id, 'baseSalary', $event)"
                    />
                  </td>
                  <td class="px-3 py-2 min-w-40">
                    <UInput
                      :model-value="salaryDrafts[customer.id]?.positionBonus ?? ''"
                      type="number"
                      step="1"
                      inputmode="numeric"
                      @update:model-value="updateSalaryDraft(customer.id, 'positionBonus', $event)"
                    />
                  </td>
                  <td class="px-3 py-2 font-medium whitespace-nowrap">
                    {{ formatCurrency(getCardPayout(customer.id)) }}
                  </td>
                  <td class="px-3 py-2 font-medium whitespace-nowrap">
                    {{ formatCurrency(getCashPayout(customer.id)) }}
                  </td>
                  <td class="px-3 py-2 font-medium whitespace-nowrap">
                    <div class="space-y-1">
                      <p>{{ formatCurrency(getSalaryTotal(customer.id)) }}</p>
                      <p class="text-xs font-normal text-muted">
                        {{ isSalaryActivityLoading
                          ? 'Загрузка активности...'
                          : (getSalaryType(customer.id) === 'hourly'
                            ? `Отработано: ${formatWorkMinutes(getEmployeeWorkMinutes(customer.id))}, ставка: ${formatCurrency(getHourlyRate(customer.id))}/час`
                            : `Опоздание: ${getEmployeeLateMinutes(customer.id)} мин, штраф: ${formatCurrency(getLatePenalty(customer.id))}`) }}
                      </p>
                    </div>
                  </td>
                  <td class="px-3 py-2 text-right">
                    <UButton
                      label="Сохранить"
                      size="sm"
                      color="primary"
                      :loading="salaryDrafts[customer.id]!.saving"
                      @click="saveCustomerSalary(customer)"
                    />
                  </td>
                </tr>
                <tr v-if="!isLoading && !filteredSalaryCustomers.length">
                  <td class="px-3 py-3 text-muted" colspan="9">
                    {{ salaryUserFilter ? 'Ничего не найдено.' : 'Сотрудников пока нет.' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="flex items-center justify-between gap-3 border-t border-default pt-4">
            <div class="text-sm text-muted">
              Показано с {{ salaryPaginationInfo.from }} по {{ salaryPaginationInfo.to }} из
              {{ salaryPaginationInfo.total }} сотрудников.
            </div>

            <UPagination
              v-if="salaryPaginationInfo.total > salaryPagination.pageSize"
              :page="salaryPagination.pageIndex + 1"
              :items-per-page="salaryPagination.pageSize"
              :total="salaryPaginationInfo.total"
              @update:page="(p: number) => { salaryPagination.pageIndex = p - 1 }"
            />
          </div>

          <div class="flex items-center justify-between text-xs text-muted">
            <p>Базовая зарплата по умолчанию: 1 000 000 сум.</p>
            <UButton
              size="xs"
              color="primary"
              variant="outline"
              icon="i-lucide-file-spreadsheet"
              :loading="exportSalaryLoading"
              @click="exportSalaryExcel"
            >
              Выгрузить Excel
            </UButton>
          </div>
        </div>
      </div>

      <UModal
        v-model:open="salaryFormulaOpen"
        title="Настройки формулы зарплаты"
        description="Измените параметры расчета штрафа за опоздание."
      >
        <template #body>
          <div class="space-y-4">
            <UFormField label="Дней в месяце">
              <UInput
                :model-value="String(salaryMonthDays)"
                disabled
              />
            </UFormField>

            <UFormField label="Рабочих часов в день">
              <UInput
                :model-value="salaryFormulaDraft.workHoursPerDay"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                @update:model-value="updateSalaryFormulaDraft('workHoursPerDay', $event)"
              />
            </UFormField>

            <UFormField label="Минут в часе">
              <UInput
                :model-value="salaryFormulaDraft.minutesPerHour"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                @update:model-value="updateSalaryFormulaDraft('minutesPerHour', $event)"
              />
            </UFormField>

            <UFormField label="Множитель штрафа">
              <UInput
                :model-value="salaryFormulaDraft.penaltyMultiplier"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                @update:model-value="updateSalaryFormulaDraft('penaltyMultiplier', $event)"
              />
            </UFormField>
          </div>
        </template>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              label="Отмена"
              color="neutral"
              variant="subtle"
              @click="salaryFormulaOpen = false"
            />
            <UButton
              label="Сохранить"
              color="primary"
              @click="saveSalaryFormulaConfig"
            />
          </div>
        </template>
      </UModal>

      <UModal
        v-model:open="customerInfoOpen"
        :title="selectedCustomer ? `Пользователь @${selectedCustomer.username}` : 'Пользователь'"
        :description="selectedCustomer ? 'Информация о выбранном пользователе' : ''"
      >
        <template #body>
          <div v-if="selectedCustomer" class="space-y-4">
            <div class="flex items-center gap-3">
              <UAvatar :src="selectedCustomer.avatar.src" size="xl" />
              <div class="min-w-0">
                <p class="font-semibold text-highlighted">
                  {{ selectedCustomer.fullName || `@${selectedCustomer.username}` }}
                </p>
                <p class="text-sm text-muted">
                  @{{ selectedCustomer.username }} · {{ selectedCustomer.phoneNumber }}
                </p>
                <p class="text-xs text-muted">
                  {{ getCustomerRoleLabel(selectedCustomer.role) }}
                </p>
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-md border border-default p-3">
                <p class="text-xs text-muted">
                  ID
                </p>
                <div class="flex items-center justify-between gap-2">
                  <p class="font-medium">
                    {{ selectedCustomer.id }}
                  </p>
                  <UButton
                    icon="i-lucide-copy"
                    size="xs"
                    color="neutral"
                    variant="subtle"
                    @click="copyText(String(selectedCustomer.id), 'ID скопирован в буфер обмена')"
                  />
                </div>
              </div>
              <div class="rounded-md border border-default p-3">
                <p class="text-xs text-muted">
                  Роль
                </p>
                <p class="font-medium">
                  {{ getCustomerRoleLabel(selectedCustomer.role) }} ({{ selectedCustomer.role }})
                </p>
              </div>
              <div class="rounded-md border border-default p-3">
                <p class="text-xs text-muted">
                  Здание
                </p>
                <p class="font-medium">
                  {{
                    selectedCustomer.buildingId
                      ? (activeBuilding?.id === selectedCustomer.buildingId && activeBuilding?.name
                        ? activeBuilding.name
                        : `Здание #${selectedCustomer.buildingId}`)
                      : '—'
                  }}
                </p>
              </div>
              <div class="rounded-md border border-default p-3">
                <p class="text-xs text-muted">
                  Статус
                </p>
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge
                    :label="selectedCustomer.status || 'pending'"
                    color="neutral"
                    variant="subtle"
                  />
                  <UBadge
                    v-if="selectedCustomer.mustChangePassword"
                    label="Смена пароля при входе"
                    color="warning"
                    variant="subtle"
                  />
                </div>
              </div>
              <div class="rounded-md border border-default p-3">
                <p class="text-xs text-muted">
                  Возраст
                </p>
                <p class="font-medium">
                  {{ selectedCustomer.age }}
                </p>
              </div>
              <div class="rounded-md border border-default p-3">
                <p class="text-xs text-muted">
                  График
                </p>
                <p class="font-medium">
                  {{ getCustomerWorkSchedule(selectedCustomer).label }}
                </p>
              </div>
              <div class="rounded-md border border-default p-3">
                <p class="text-xs text-muted">
                  Закрепленный объект
                </p>
                <p class="font-medium">
                  {{ selectedCustomer.objectPinned || 'На проверке - ожидаются изменения' }}
                </p>
              </div>
              <div class="rounded-md border border-default p-3">
                <p class="text-xs text-muted">
                  Зарплата
                </p>
                <template v-if="getCustomerWorkSchedule(selectedCustomer).salaryType === 'hourly'">
                  <p class="font-medium">
                    {{ formatCurrency(selectedCustomer.hourlyRate) }}/час
                  </p>
                  <p class="text-xs text-muted mt-1">
                    Надбавка: {{ formatCurrency(selectedCustomer.positionBonus) }}
                  </p>
                </template>
                <template v-else>
                  <p class="font-medium">
                    {{ formatCurrency(selectedCustomer.baseSalary) }} + {{ formatCurrency(selectedCustomer.positionBonus) }}
                  </p>
                  <p class="text-xs text-muted mt-1">
                    Итого: {{ formatCurrency(selectedCustomer.baseSalary + selectedCustomer.positionBonus) }}
                  </p>
                </template>
              </div>
              <div class="rounded-md border border-default p-3 sm:col-span-2">
                <p class="text-xs text-muted mb-2">
                  Пароль
                </p>
                <div class="flex items-center gap-2">
                  <UInput
                    :model-value="selectedCustomer.password || ''"
                    :type="customerPasswordVisible ? 'text' : 'password'"
                    readonly
                    class="flex-1"
                  />
                  <UButton
                    :icon="customerPasswordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    color="neutral"
                    variant="subtle"
                    @click="customerPasswordVisible = !customerPasswordVisible"
                  />
                  <UButton
                    icon="i-lucide-copy"
                    color="neutral"
                    variant="subtle"
                    @click="copyText(selectedCustomer.password || '', 'Пароль скопирован в буфер обмена')"
                  />
                </div>
              </div>
              <div class="rounded-md border border-default p-3 sm:col-span-2">
                <p class="text-xs text-muted">
                  Паспорт
                </p>
                <div class="grid gap-3 sm:grid-cols-2">
                  <div
                    v-for="passport in getPassportEntries(selectedCustomer)"
                    :key="passport.label"
                    class="space-y-1"
                  >
                    <p class="text-xs text-muted">
                      {{ passport.label }}
                    </p>
                    <a
                      :href="passport.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="group block"
                    >
                      <img
                        v-if="passport.isImage"
                        :src="passport.url"
                        :alt="passport.label"
                        class="w-full rounded-md border border-default bg-default object-cover aspect-[4/3] transition group-hover:shadow-md"
                      >
                      <p
                        v-else
                        class="font-medium break-all text-highlighted underline group-hover:text-primary"
                      >
                        {{ passport.value }}
                      </p>
                    </a>
                  </div>
                  <p v-if="!getPassportEntries(selectedCustomer).length" class="text-sm text-muted sm:col-span-2">
                    Паспорт не прикреплен.
                  </p>
                </div>
              </div>
            </div>

            <div class="rounded-md border border-default p-3">
              <p class="text-xs text-muted mb-2">
                Позиции объекта
              </p>
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="position in selectedCustomer.objectPositions"
                  :key="position"
                  :label="position"
                  color="neutral"
                  variant="outline"
                />
              </div>
            </div>
          </div>
        </template>
      </UModal>

      <UModal
        v-model:open="archiveModalOpen"
        :title="archivingCustomer ? `Архивировать @${archivingCustomer.username}` : 'Архивировать пользователя'"
        description="Удаление отключено. Архивирование требует обязательного комментария."
      >
        <template #body>
          <div class="space-y-3">
            <p class="text-sm text-muted">
              Пользователь будет перемещен в раздел «Архив». Для продолжения добавьте пояснение.
            </p>
            <UFormField label="Комментарий (обязательно)">
              <UTextarea
                v-model="archiveComment"
                placeholder="Причина архивации"
                autoresize
                :rows="3"
              />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              label="Отмена"
              color="neutral"
              variant="subtle"
              @click="archiveModalOpen = false"
            />
            <UButton
              label="Архивировать"
              color="primary"
              icon="i-lucide-archive"
              @click="archiveCustomer"
            />
          </div>
        </template>
      </UModal>

      <CustomersAddModal
        v-if="editingCustomer"
        v-model:open="editCustomerOpen"
        :customer="editingCustomer"
        :hide-trigger="true"
        @saved="refresh()"
      />
    </template>
  </UDashboardPanel>
</template>
