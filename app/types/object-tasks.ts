export type TaskStatus = 'open' | 'in_progress' | 'completed'

export type TaskReviewStatus = 'none' | 'pending' | 'approved' | 'rejected'

export type ObjectTaskEmployee = {
  id: number
  name: string
  username: string
  phone?: string
  workShift?: 'day' | 'night'
  status: string
}

export type ObjectTaskItem = {
  id: number
  taskListId: number
  title: string
  isDone: boolean
  completedAt: string | null
  sortOrder: number
  proofPhotoUrl?: string | null
  proofPhotoUrls?: string[]
  images?: string[]
}

export type ObjectTask = {
  id: number
  objectId: number | null
  objectName: string
  employeeId: number | null
  employeeName: string
  employeeUsername?: string
  employeePhone?: string
  employeeStatus?: string
  title: string
  note: string | null
  dueDate: string | null
  status: TaskStatus
  createdById: number | null
  createdByName: string | null
  createdByRole: string | null
  createdAt: string | null
  updatedAt: string | null
  totalItems: number
  completedItems: number
  progressPercent: number
  reviewStatus?: TaskReviewStatus
  reviewComment?: string | null
  reviewedAt?: string | null
  reviewRequestedAt?: string | null
  reviewPhotoUrl?: string | null
  reviewPhotoUrls?: string[]
  items: ObjectTaskItem[]
}

export type ObjectTaskCard = {
  id: number
  buildingId?: number | null
  name: string
  description?: string
  address?: string
  code?: string
  isActive: boolean
  employeeCount: number
  totalTasks: number
  openTasks: number
  inProgressTasks: number
  completedTasks: number
  employees: ObjectTaskEmployee[]
  tasks: ObjectTask[]
}

export type ObjectTaskOverview = {
  buildingId: number | null
  objects: ObjectTaskCard[]
}
