import { defineStore } from 'pinia'

export type EmployeeActivityStatus = 'on_time' | 'late' | 'absent'

export interface EmployeeActivityRecord {
  id: number
  employeeId: number | null
  employeeName: string
  date: string
  startedAt: string | null
  finishedAt: string | null
  status: EmployeeActivityStatus
  workMinutes: number
  lateMinutes: number
}

interface FetchActivitiesParams {
  from?: string
  to?: string
  buildingId?: number
  employeeIds?: number[]
}

interface UpdateEmployeeActivityPayload {
  date: string
  status: EmployeeActivityStatus
  workMinutes: number
  lateMinutes: number
}

export const useEmployeeActivityStore = defineStore('employee-activity', {
  state: () => ({
    list: [] as EmployeeActivityRecord[],
    loading: false
  }),
  actions: {
    async fetchActivities(params: FetchActivitiesParams = {}) {
      this.loading = true

      try {
        this.list = await $fetch<EmployeeActivityRecord[]>('/api/employee/activity', {
          query: {
            from: params.from || undefined,
            to: params.to || undefined,
            buildingId: params.buildingId || undefined,
            employeeIds: params.employeeIds?.length ? params.employeeIds.join(',') : undefined
          }
        })
      } finally {
        this.loading = false
      }
    },
    async updateActivity(activityId: number, payload: UpdateEmployeeActivityPayload) {
      const updatedRecord = await $fetch<EmployeeActivityRecord>(`/api/employee/activity/${activityId}`, {
        method: 'PATCH',
        body: payload
      })

      const index = this.list.findIndex(item => item.id === activityId)
      if (index >= 0) {
        this.list.splice(index, 1, updatedRecord)
      }

      return updatedRecord
    }
  }
})
