import { defineStore } from 'pinia'

export type EmployeeActivityStatus = 'on_time' | 'late' | 'absent'

export interface EmployeeActivityRecord {
  id: number
  employeeName: string
  date: string
  status: EmployeeActivityStatus
  workMinutes: number
  lateMinutes: number
}

interface FetchActivitiesParams {
  from?: string
  to?: string
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
            to: params.to || undefined
          }
        })
      } finally {
        this.loading = false
      }
    }
  }
})
