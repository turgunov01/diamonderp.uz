import type { AuthLocationPayload } from '~~/shared/types/auth'

interface CaptureAuthGeolocationOptions {
  timeoutMs?: number
  maximumAgeMs?: number
  enableHighAccuracy?: boolean
}

function normalizeOptionalNumber(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function captureAuthGeolocation(options: CaptureAuthGeolocationOptions = {}) {
  if (!import.meta.client || !navigator.geolocation) {
    return Promise.resolve(null)
  }

  return new Promise<AuthLocationPayload | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = position.coords

        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: normalizeOptionalNumber(coords.accuracy),
          altitude: normalizeOptionalNumber(coords.altitude),
          altitudeAccuracy: normalizeOptionalNumber(coords.altitudeAccuracy),
          heading: normalizeOptionalNumber(coords.heading),
          speed: normalizeOptionalNumber(coords.speed),
          capturedAt: new Date(position.timestamp).toISOString()
        })
      },
      () => resolve(null),
      {
        enableHighAccuracy: options.enableHighAccuracy ?? true,
        maximumAge: options.maximumAgeMs ?? 60_000,
        timeout: options.timeoutMs ?? 6_000
      }
    )
  })
}
