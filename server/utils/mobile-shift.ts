import {
  getLegacyWorkScheduleType,
  getWorkScheduleDefinition,
  isWorkScheduleType,
  type WorkScheduleType
} from '~~/shared/utils/work-schedules'

export type MobileWorkShift = 'day' | 'night'

export interface MobileShiftInfo {
  workShift: MobileWorkShift
  scheduleType: WorkScheduleType
  label: string
  timezone: 'Asia/Tashkent'
  shiftStartHour: number
  shiftEndHour: number
  hoursPerDay: number
  salaryType: 'fixed' | 'hourly'
  isActiveNow: boolean
  shouldLogoutNow: boolean
  startedAt: string | null
  logoutAt: string | null
  nextShiftStartsAt: string
}

const TASHKENT_TIMEZONE = 'Asia/Tashkent' as const
const TASHKENT_UTC_OFFSET_HOURS = 5
const DAY_SHIFT_START_HOUR = 8
const DAY_SHIFT_END_HOUR = 20
const NIGHT_SHIFT_START_HOUR = 20
const NIGHT_SHIFT_END_HOUR = 8

interface TashkentDateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function getTashkentDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TASHKENT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })

  const parts = formatter.formatToParts(date)
  const year = Number(parts.find(part => part.type === 'year')?.value)
  const month = Number(parts.find(part => part.type === 'month')?.value)
  const day = Number(parts.find(part => part.type === 'day')?.value)
  const hour = Number(parts.find(part => part.type === 'hour')?.value)
  const minute = Number(parts.find(part => part.type === 'minute')?.value)
  const second = Number(parts.find(part => part.type === 'second')?.value)

  if ([year, month, day, hour, minute, second].some(value => Number.isNaN(value))) {
    throw createError({
      statusCode: 500,
      message: 'Failed to resolve Asia/Tashkent shift date parts.'
    })
  }

  return { year, month, day, hour, minute, second } satisfies TashkentDateParts
}

function shiftDate(year: number, month: number, day: number, hour: number, minute = 0, second = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - TASHKENT_UTC_OFFSET_HOURS, minute, second))
}

function addTashkentDays(parts: TashkentDateParts, offsetDays: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  date.setUTCDate(date.getUTCDate() + offsetDays)

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  }
}

function buildFixedScheduleShift(
  scheduleType: WorkScheduleType,
  now: Date,
  parts: TashkentDateParts
): MobileShiftInfo {
  const schedule = getWorkScheduleDefinition(scheduleType)
  const startHour = schedule.startHour ?? DAY_SHIFT_START_HOUR
  const endHour = schedule.endHour ?? DAY_SHIFT_END_HOUR
  let startDateParts = parts
  let endDateParts = schedule.spansNextDay
    ? addTashkentDays(parts, 1)
    : parts

  if (schedule.spansNextDay && parts.hour < endHour) {
    startDateParts = { ...addTashkentDays(parts, -1), hour: parts.hour, minute: parts.minute, second: parts.second }
    endDateParts = parts
  }

  const start = shiftDate(startDateParts.year, startDateParts.month, startDateParts.day, startHour)
  const end = shiftDate(endDateParts.year, endDateParts.month, endDateParts.day, endHour)
  const isActiveNow = now >= start && now < end
  const nextDate = addTashkentDays(parts, now < start ? 0 : 1)
  const nextShiftStartsAt = shiftDate(nextDate.year, nextDate.month, nextDate.day, startHour)

  return {
    workShift: schedule.workShift,
    scheduleType,
    label: schedule.shortLabel,
    timezone: TASHKENT_TIMEZONE,
    shiftStartHour: startHour,
    shiftEndHour: endHour,
    hoursPerDay: schedule.hoursPerDay,
    salaryType: schedule.salaryType,
    isActiveNow,
    shouldLogoutNow: !isActiveNow,
    startedAt: isActiveNow ? start.toISOString() : null,
    logoutAt: isActiveNow ? end.toISOString() : null,
    nextShiftStartsAt: nextShiftStartsAt.toISOString()
  }
}

function buildNightShift(scheduleType: WorkScheduleType, now: Date, parts: TashkentDateParts): MobileShiftInfo {
  const schedule = getWorkScheduleDefinition(scheduleType)
  const todayStart = shiftDate(parts.year, parts.month, parts.day, NIGHT_SHIFT_START_HOUR)
  const tomorrowDate = addTashkentDays(parts, 1)
  const yesterdayDate = addTashkentDays(parts, -1)

  let isActiveNow = false
  let startedAt: Date | null = null
  let logoutAt: Date | null = null
  let nextShiftStartsAt: Date

  if (parts.hour >= NIGHT_SHIFT_START_HOUR) {
    isActiveNow = true
    startedAt = todayStart
    logoutAt = shiftDate(tomorrowDate.year, tomorrowDate.month, tomorrowDate.day, NIGHT_SHIFT_END_HOUR)
    nextShiftStartsAt = shiftDate(tomorrowDate.year, tomorrowDate.month, tomorrowDate.day, NIGHT_SHIFT_START_HOUR)
  } else if (parts.hour < NIGHT_SHIFT_END_HOUR) {
    isActiveNow = true
    startedAt = shiftDate(yesterdayDate.year, yesterdayDate.month, yesterdayDate.day, NIGHT_SHIFT_START_HOUR)
    logoutAt = shiftDate(parts.year, parts.month, parts.day, NIGHT_SHIFT_END_HOUR)
    nextShiftStartsAt = todayStart
  } else {
    nextShiftStartsAt = todayStart
  }

  return {
    workShift: 'night',
    scheduleType,
    label: schedule.shortLabel,
    timezone: TASHKENT_TIMEZONE,
    shiftStartHour: NIGHT_SHIFT_START_HOUR,
    shiftEndHour: NIGHT_SHIFT_END_HOUR,
    hoursPerDay: schedule.hoursPerDay,
    salaryType: schedule.salaryType,
    isActiveNow,
    shouldLogoutNow: !isActiveNow,
    startedAt: startedAt ? startedAt.toISOString() : null,
    logoutAt: logoutAt ? logoutAt.toISOString() : null,
    nextShiftStartsAt: nextShiftStartsAt.toISOString()
  }
}

function buildHourlyShift(parts: TashkentDateParts): MobileShiftInfo {
  const schedule = getWorkScheduleDefinition('hourly')
  const tomorrowDate = addTashkentDays(parts, 1)
  const nextShiftStartsAt = shiftDate(tomorrowDate.year, tomorrowDate.month, tomorrowDate.day, 0)

  return {
    workShift: schedule.workShift,
    scheduleType: 'hourly',
    label: schedule.shortLabel,
    timezone: TASHKENT_TIMEZONE,
    shiftStartHour: 0,
    shiftEndHour: 24,
    hoursPerDay: 0,
    salaryType: 'hourly',
    isActiveNow: true,
    shouldLogoutNow: false,
    startedAt: null,
    logoutAt: null,
    nextShiftStartsAt: nextShiftStartsAt.toISOString()
  }
}

function normalizeScheduleInput(value?: string | null): WorkScheduleType | null {
  if (isWorkScheduleType(value)) {
    return value
  }

  if (value === 'day' || value === 'night') {
    return getLegacyWorkScheduleType({
      workShift: value,
      salaryType: 'fixed'
    })
  }

  return null
}

export function resolveMobileShiftInfo(scheduleInput?: string | null, now = new Date()) {
  const scheduleType = normalizeScheduleInput(scheduleInput)
  if (!scheduleType) {
    return null
  }

  const parts = getTashkentDateParts(now)
  if (scheduleType === 'hourly') {
    return buildHourlyShift(parts)
  }

  if (scheduleType === 'night_12h') {
    return buildNightShift(scheduleType, now, parts)
  }

  return buildFixedScheduleShift(scheduleType, now, parts)
}
