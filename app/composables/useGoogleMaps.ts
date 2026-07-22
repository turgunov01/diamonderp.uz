// Loads the Google Maps JavaScript API once and shares the promise across callers.
// Uses the async bootstrap + importLibrary so the constructors are guaranteed
// ready when load() resolves (and key/API failures reject instead of throwing later).
let loadPromise: Promise<any> | null = null

export function useGoogleMaps() {
  const config = useRuntimeConfig()
  const apiKey = config.public.googleMapsApiKey as string | undefined

  function load(): Promise<any> {
    if (import.meta.server) {
      return Promise.reject(new Error('Google Maps can only load in the browser.'))
    }

    const w = window as any

    if (w.google?.maps?.Map) {
      return Promise.resolve(w.google)
    }

    if (!apiKey) {
      return Promise.reject(new Error('Google Maps API key is not configured.'))
    }

    if (loadPromise) {
      return loadPromise
    }

    loadPromise = new Promise((resolve, reject) => {
      // Google calls this global when the key/referrer/API is rejected
      // (e.g. ApiNotActivatedMapError, RefererNotAllowedMapError, BillingNotEnabled).
      w.gm_authFailure = () => {
        loadPromise = null
        reject(new Error('Google Maps отклонил ключ. Включите «Maps JavaScript API» и биллинг в Google Cloud и разрешите домен.'))
      }

      const finalize = async () => {
        try {
          const google = w.google
          if (google?.maps?.importLibrary) {
            await google.maps.importLibrary('maps')
            await google.maps.importLibrary('marker')
          }
          if (!google?.maps?.Map) {
            throw new Error('Google Maps не инициализировался.')
          }
          resolve(google)
        } catch (error) {
          loadPromise = null
          reject(error instanceof Error ? error : new Error('Не удалось инициализировать Google Maps.'))
        }
      }

      const existing = document.getElementById('google-maps-js') as HTMLScriptElement | null
      if (existing) {
        existing.addEventListener('load', finalize, { once: true })
        existing.addEventListener('error', () => {
          loadPromise = null
          reject(new Error('Не удалось загрузить Google Maps.'))
        }, { once: true })
        return
      }

      const script = document.createElement('script')
      script.id = 'google-maps-js'
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async`
      script.async = true
      script.defer = true
      script.onload = finalize
      script.onerror = () => {
        loadPromise = null
        reject(new Error('Не удалось загрузить Google Maps.'))
      }
      document.head.appendChild(script)
    })

    return loadPromise
  }

  return { load, hasApiKey: Boolean(apiKey) }
}
