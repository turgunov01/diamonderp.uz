import type { ObjectTask, TaskStatus } from '~/types/object-tasks'

export function formatDate(value?: string | null) {
  if (!value) {
    return 'Без срока'
  }

  return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return '—'
  }

  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function getTaskStatusLabel(status: TaskStatus) {
  if (status === 'completed') {
    return 'Завершен'
  }

  if (status === 'in_progress') {
    return 'В работе'
  }

  return 'Новый'
}

export function getTaskStatusColor(status: TaskStatus) {
  if (status === 'completed') {
    return 'success'
  }

  if (status === 'in_progress') {
    return 'primary'
  }

  return 'warning'
}

export function isTaskOverdue(task: Pick<ObjectTask, 'dueDate' | 'status'>) {
  if (!task.dueDate || task.status === 'completed') {
    return false
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(`${task.dueDate}T00:00:00`).getTime() < today.getTime()
}

export function getEmployeeTaskSnapshot(employeeId: number, tasks: ObjectTask[]) {
  const myTasks = tasks.filter(task => task.employeeId === employeeId)
  const recentTimestamps: number[] = []

  myTasks.forEach((task) => {
    if (task.updatedAt) recentTimestamps.push(new Date(task.updatedAt).getTime())
    else if (task.createdAt) recentTimestamps.push(new Date(task.createdAt).getTime())

    task.items?.forEach((item) => {
      if (item.completedAt) {
        recentTimestamps.push(new Date(item.completedAt).getTime())
      }
    })
  })

  const recentCompletion = recentTimestamps.length
    ? new Date(Math.max(...recentTimestamps)).toISOString()
    : null

  const hasOpenTasks = myTasks.some(task => task.status !== 'completed')

  return {
    tasks: myTasks,
    taskCount: myTasks.length,
    hasOpenTasks,
    recentCompletion
  }
}
