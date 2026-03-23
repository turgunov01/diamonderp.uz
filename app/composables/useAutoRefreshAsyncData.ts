import type { FetchError } from 'ofetch'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { NitroFetchRequest } from 'nitropack/types'
import type { NuxtError } from '#app/composables/error'
import type { AsyncData, AsyncDataHandler, AsyncDataOptions, KeysOf, PickFrom } from '#app/composables/asyncData'
import type { UseFetchOptions } from '#app/composables/fetch'

function buildFreshClientOptions<T extends Record<string, any>>(
  options: T = {} as T
) {
  const originalGetCachedData = (options as any).getCachedData
  const nextOptions = {
    ...options,
    lazy: (options as any).lazy ?? import.meta.client,
    getCachedData(key: string, nuxtApp: ReturnType<typeof useNuxtApp>, context: { cause: string }) {
      if (nuxtApp.isHydrating) {
        return originalGetCachedData?.(key, nuxtApp, context)
          ?? nuxtApp.payload.data[key]
          ?? nuxtApp.static.data[key]
      }

      return undefined
    }
  }

  return nextOptions as T
}

function shouldDeferClientFetch(options: Record<string, any>, nuxtApp: ReturnType<typeof useNuxtApp>) {
  return import.meta.client && !nuxtApp.isHydrating && (options.immediate ?? true)
}

function watchRouteRefresh(asyncData: { clear: () => void, refresh: (opts?: any) => Promise<void> }) {
  if (!import.meta.client) {
    return
  }

  onBeforeRouteUpdate(() => {
    asyncData.clear()
    void asyncData.refresh()
  })
}

export function useAutoRefreshAsyncData<ResT, NuxtErrorDataT = unknown, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = undefined>(
  key: MaybeRefOrGetter<string>,
  handler: AsyncDataHandler<ResT>,
  options?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>
): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, (NuxtErrorDataT extends Error | NuxtError ? NuxtErrorDataT : NuxtError<NuxtErrorDataT>) | undefined>

export function useAutoRefreshAsyncData<ResT, NuxtErrorDataT = unknown, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = DataT>(
  key: MaybeRefOrGetter<string>,
  handler: AsyncDataHandler<ResT>,
  options?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>
): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, (NuxtErrorDataT extends Error | NuxtError ? NuxtErrorDataT : NuxtError<NuxtErrorDataT>) | undefined>

export function useAutoRefreshAsyncData(
  key: MaybeRefOrGetter<string>,
  handler: AsyncDataHandler<unknown>,
  options: AsyncDataOptions<unknown, unknown, KeysOf<unknown>, unknown> = {}
) {
  const nuxtApp = useNuxtApp()
  const nextOptions = buildFreshClientOptions({
    ...options,
    immediate: shouldDeferClientFetch(options as Record<string, any>, nuxtApp) ? false : options.immediate
  })
  const asyncData = useAsyncData(key, handler, nextOptions)

  if (shouldDeferClientFetch(options as Record<string, any>, nuxtApp)) {
    asyncData.clear()
    void asyncData.refresh()
  }

  watchRouteRefresh(asyncData)

  return asyncData
}

export function useAutoRefreshFetch<ResT, ErrorT = FetchError, ReqT extends NitroFetchRequest = NitroFetchRequest, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = undefined>(
  request: Ref<ReqT> | ReqT | (() => ReqT),
  options?: UseFetchOptions<ResT, DataT, PickKeys, DefaultT, ReqT>
): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, ErrorT | undefined>

export function useAutoRefreshFetch<ResT, ErrorT = FetchError, ReqT extends NitroFetchRequest = NitroFetchRequest, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = DataT>(
  request: Ref<ReqT> | ReqT | (() => ReqT),
  options?: UseFetchOptions<ResT, DataT, PickKeys, DefaultT, ReqT>
): AsyncData<PickFrom<DataT, PickKeys> | DefaultT, ErrorT | undefined>

export function useAutoRefreshFetch(
  request: Ref<NitroFetchRequest> | NitroFetchRequest | (() => NitroFetchRequest),
  options: UseFetchOptions<unknown, unknown, KeysOf<unknown>, unknown, NitroFetchRequest> = {}
) {
  const nuxtApp = useNuxtApp()
  const nextOptions = buildFreshClientOptions({
    ...options,
    immediate: shouldDeferClientFetch(options as Record<string, any>, nuxtApp) ? false : options.immediate
  })
  const asyncData = useFetch(request, nextOptions)

  if (shouldDeferClientFetch(options as Record<string, any>, nuxtApp)) {
    asyncData.clear()
    void asyncData.refresh()
  }

  watchRouteRefresh(asyncData)

  return asyncData
}
