import { defineStore } from 'pinia'
import type { AuthLocationPayload } from '~~/shared/types/auth'

export type EmployeeActivityStatus = 'on_time' | 'late' | 'absent'
export type EmployeeActivityLocation = AuthLocationPayload & { mapUrl?: string | null }

export interface EmployeeActivityRecord {
  id: number
  employeeId: number | null
  employeeName: string
  date: string
  startedAt: string | null
  finishedAt: string | null
  startedLocation: EmployeeActivityLocation | null
  finishedLocation: EmployeeActivityLocation | null
  status: EmployeeActivityStatus
  workMinutes: number
  lateMinutes: number
}

export interface EmployeeLocationPointRecord {
  id: number
  employeeId: number
  employeeName: string
  activityId: number | null
  buildingId: number | null
  recordedAt: string
  capturedAt: string | null
  latitude: number
  longitude: number
  accuracy: number | null
  altitude: number | null
  altitudeAccuracy: number | null
  heading: number | null
  speed: number | null
  mapUrl: string
}

interface FetchActivitiesParams {
  from?: string
  to?: string
  buildingId?: number
  employeeIds?: number[]
}

interface FetchLocationPointsParams extends FetchActivitiesParams {
  activityId?: number
  limit?: number
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
    routePoints: [] as EmployeeLocationPointRecord[],
    routeLoading: false,
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
    async fetchLocationPoints(params: FetchLocationPointsParams = {}) {
      this.routeLoading = true

      try {
        this.routePoints = await $fetch<EmployeeLocationPointRecord[]>('/api/employee/activity/locations', {
          query: {
            activityId: params.activityId || undefined,
            from: params.from || undefined,
            to: params.to || undefined,
            buildingId: params.buildingId || undefined,
            employeeIds: params.employeeIds?.length ? params.employeeIds.join(',') : undefined,
            limit: params.limit || undefined
          }
        })
      } finally {
        this.routeLoading = false
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
