export const allowedCurrencies = ['UZS', 'USD', 'EUR', 'RUB'] as const
export type CurrencyCode = (typeof allowedCurrencies)[number]

// Shared, reactive dashboard currency that also persists across reloads.
// useState keeps every consumer in sync within a session; the cookie restores
// the choice on the next load (the plain useState version reset to UZS on refresh).
export function useDashboardCurrency() {
  const cookie = useCookie<CurrencyCode>('dashboard-currency', {
    default: () => 'UZS',
    maxAge: 60 * 60 * 24 * 365
  })

  const currency = useState<CurrencyCode>('dashboard-currency', () => cookie.value)

  watch(currency, (value) => {
    cookie.value = value
  })

  return currency
}
