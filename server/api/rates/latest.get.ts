import { cachedEventHandler } from '#imports'

type ApiResponse = {
  base_code: string
  time_last_update_unix: number
  rates: Record<string, number>
}

// Cache for 12 hours to respect the free tier limits and avoid hitting the API too often.
export default cachedEventHandler(async () => {
  const url = 'https://open.er-api.com/v6/latest/USD'

  const res = await $fetch<ApiResponse>(url)

  if (!res?.rates) {
    throw createError({
      statusCode: 502,
      message: 'Не удалось получить курсы валют.'
    })
  }

  // Only expose currencies we actually use to keep payload small.
  const pick = ['USD', 'EUR', 'RUB', 'UZS']
  const rates: Record<string, number> = {}
  for (const key of pick) {
    if (res.rates[key] !== undefined) {
      rates[key] = res.rates[key]
    }
  }

  return {
    base: res.base_code,
    updatedAt: res.time_last_update_unix * 1000,
    rates
  }
}, { swr: true, maxAge: 60 * 60 * 12 })
