type EmployeeActivityStatus = 'on_time' | 'late' | 'absent'

type EmployeeActivityRecord = {
  id: number
  employeeName: string
  date: string
  status: EmployeeActivityStatus
  workMinutes: number
  lateMinutes: number
}

function buildDate(daysAgo: number, hours: number, minutes: number) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}

function parseDateBoundary(value: string | undefined, endOfDay = false) {
  if (!value) {
    return null
  }

  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`)
  return Number.isNaN(date.getTime()) ? null : date
}

const activities: EmployeeActivityRecord[] = [
  {
    id: 1,
    employeeName: 'Aziza Karimova',
    date: buildDate(0, 8, 58),
    status: 'on_time',
    workMinutes: 540,
    lateMinutes: 0
  },
  {
    id: 2,
    employeeName: 'Bekzod Tursunov',
    date: buildDate(0, 9, 17),
    status: 'late',
    workMinutes: 505,
    lateMinutes: 17
  },
  {
    id: 3,
    employeeName: 'Dilshod Rakhimov',
    date: buildDate(1, 9, 0),
    status: 'absent',
    workMinutes: 0,
    lateMinutes: 0
  },
  {
    id: 4,
    employeeName: 'Malika Yuldasheva',
    date: buildDate(1, 8, 51),
    status: 'on_time',
    workMinutes: 555,
    lateMinutes: 0
  },
  {
    id: 5,
    employeeName: 'Sardor Ismailov',
    date: buildDate(2, 9, 9),
    status: 'late',
    workMinutes: 498,
    lateMinutes: 9
  },
  {
    id: 6,
    employeeName: 'Nodira Rasulova',
    date: buildDate(3, 8, 44),
    status: 'on_time',
    workMinutes: 562,
    lateMinutes: 0
  }
]

export default eventHandler((event) => {
  const query = getQuery(event)
  const from = typeof query.from === 'string' ? parseDateBoundary(query.from) : null
  const to = typeof query.to === 'string' ? parseDateBoundary(query.to, true) : null

  return activities
    .filter((item) => {
      const timestamp = new Date(item.date).getTime()

      if (from && timestamp < from.getTime()) {
        return false
      }

      if (to && timestamp > to.getTime()) {
        return false
      }

      return true
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
})
