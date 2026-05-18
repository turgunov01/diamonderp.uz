export type WorkScheduleType = 'day_12h' | 'night_12h' | 'day_8h' | 'hourly' | 'daily_24h'
export type WorkScheduleSalaryType = 'fixed' | 'hourly'
export type WorkScheduleShift = 'day' | 'night'

export interface WorkScheduleDefinition {
  type: WorkScheduleType
  label: string
  shortLabel: string
  description: string
  salaryType: WorkScheduleSalaryType
  workShift: WorkScheduleShift
  hoursPerDay: number
  startHour: number | null
  endHour: number | null
  spansNextDay: boolean
}

export const DEFAULT_WORK_SCHEDULE_TYPE: WorkScheduleType = 'day_12h'

export const WORK_SCHEDULE_DEFINITIONS: WorkScheduleDefinition[] = [
  {
    type: 'day_12h',
    label: '12-часовая дневная смена',
    shortLabel: '12 ч день',
    description: '08:00-20:00, окладная схема',
    salaryType: 'fixed',
    workShift: 'day',
    hoursPerDay: 12,
    startHour: 8,
    endHour: 20,
    spansNextDay: false
  },
  {
    type: 'night_12h',
    label: '12-часовая ночная смена',
    shortLabel: '12 ч ночь',
    description: '20:00-08:00, окладная схема',
    salaryType: 'fixed',
    workShift: 'night',
    hoursPerDay: 12,
    startHour: 20,
    endHour: 8,
    spansNextDay: true
  },
  {
    type: 'day_8h',
    label: '8-часовой график',
    shortLabel: '8 ч',
    description: '09:00-17:00, окладная схема',
    salaryType: 'fixed',
    workShift: 'day',
    hoursPerDay: 8,
    startHour: 9,
    endHour: 17,
    spansNextDay: false
  },
  {
    type: 'hourly',
    label: 'Почасовой график',
    shortLabel: 'Почасовой',
    description: 'Оплата по фактически отработанным минутам',
    salaryType: 'hourly',
    workShift: 'day',
    hoursPerDay: 0,
    startHour: null,
    endHour: null,
    spansNextDay: false
  },
  {
    type: 'daily_24h',
    label: 'Суточный график',
    shortLabel: '24 ч',
    description: '08:00-08:00, окладная схема',
    salaryType: 'fixed',
    workShift: 'day',
    hoursPerDay: 24,
    startHour: 8,
    endHour: 8,
    spansNextDay: true
  }
]

const WORK_SCHEDULE_BY_TYPE = new Map(
  WORK_SCHEDULE_DEFINITIONS.map(schedule => [schedule.type, schedule])
)

export function isWorkScheduleType(value: unknown): value is WorkScheduleType {
  return typeof value === 'string' && WORK_SCHEDULE_BY_TYPE.has(value as WorkScheduleType)
}

export function normalizeWorkScheduleType(
  value: unknown,
  fallback: WorkScheduleType = DEFAULT_WORK_SCHEDULE_TYPE
): WorkScheduleType {
  return isWorkScheduleType(value) ? value : fallback
}

export function getWorkScheduleDefinition(value: unknown): WorkScheduleDefinition {
  const type = normalizeWorkScheduleType(value)
  return WORK_SCHEDULE_BY_TYPE.get(type) || WORK_SCHEDULE_BY_TYPE.get(DEFAULT_WORK_SCHEDULE_TYPE)!
}

export function getLegacyWorkScheduleType(input: {
  workShift?: WorkScheduleShift | null
  salaryType?: WorkScheduleSalaryType | null
}): WorkScheduleType {
  if (input.salaryType === 'hourly') {
    return 'hourly'
  }

  return input.workShift === 'night' ? 'night_12h' : DEFAULT_WORK_SCHEDULE_TYPE
}

export function getWorkScheduleOptions() {
  return WORK_SCHEDULE_DEFINITIONS.map(schedule => ({
    label: schedule.label,
    value: schedule.type
  }))
}
