export type MobileWorkShift = 'day' | 'night'

export interface MobileShiftInfo {
  workShift: MobileWorkShift
  label: 'День' | 'Ночь'
  timezone: 'Asia/Tashkent'
  shiftStartHour: number
  shiftEndHour: number
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
      statusMessage: 'Failed to resolve Asia/Tashkent shift date parts.'
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

function buildDayShift(now: Date, parts: TashkentDateParts): MobileShiftInfo {
  const start = shiftDate(parts.year, parts.month, parts.day, DAY_SHIFT_START_HOUR)
  const end = shiftDate(parts.year, parts.month, parts.day, DAY_SHIFT_END_HOUR)
  const isActiveNow = now >= start && now < end
  const nextDate = addTashkentDays(parts, now < start ? 0 : 1)
  const nextShiftStartsAt = shiftDate(nextDate.year, nextDate.month, nextDate.day, DAY_SHIFT_START_HOUR)

  return {
    workShift: 'day',
    label: 'День',
    timezone: TASHKENT_TIMEZONE,
    shiftStartHour: DAY_SHIFT_START_HOUR,
    shiftEndHour: DAY_SHIFT_END_HOUR,
    isActiveNow,
    shouldLogoutNow: !isActiveNow,
    startedAt: isActiveNow ? start.toISOString() : null,
    logoutAt: isActiveNow ? end.toISOString() : null,
    nextShiftStartsAt: nextShiftStartsAt.toISOString()
  }
}

function buildNightShift(now: Date, parts: TashkentDateParts): MobileShiftInfo {
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
    label: 'Ночь',
    timezone: TASHKENT_TIMEZONE,
    shiftStartHour: NIGHT_SHIFT_START_HOUR,
    shiftEndHour: NIGHT_SHIFT_END_HOUR,
    isActiveNow,
    shouldLogoutNow: !isActiveNow,
    startedAt: startedAt ? startedAt.toISOString() : null,
    logoutAt: logoutAt ? logoutAt.toISOString() : null,
    nextShiftStartsAt: nextShiftStartsAt.toISOString()
  }
}

export function resolveMobileShiftInfo(workShift?: string | null, now = new Date()) {
  if (workShift !== 'day' && workShift !== 'night') {
    return null
  }

  const parts = getTashkentDateParts(now)
  return workShift === 'day'
    ? buildDayShift(now, parts)
    : buildNightShift(now, parts)
}
