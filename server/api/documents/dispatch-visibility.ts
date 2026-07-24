// Чистая логика видимости рассылок для мобильного приложения — без Nuxt/h3
// зависимостей, чтобы переиспользовать в эндпоинте чтения и покрыть тестами.

// Телефон → только цифры (как normalizePhone в server/utils/auth.ts).
export function normalizePhoneDigits(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : ''
}

/**
 * Пользователь — получатель рассылки, если его customerId есть в recipient_ids
 * или его телефон совпадает с одним из recipient_phones (сравнение по цифрам).
 *
 * Работает и с «сырыми» строками из Б[/PostgREST] (bigint → строка), и с числами.
 */
export function isDispatchRecipient(
  recipientIds: unknown,
  recipientPhones: unknown,
  customerId: number,
  phone: string | null | undefined
): boolean {
  const ids = Array.isArray(recipientIds) ? recipientIds.map(Number) : []
  if (Number.isInteger(customerId) && customerId > 0 && ids.includes(customerId)) {
    return true
  }

  const normalizedPhone = normalizePhoneDigits(phone)
  if (!normalizedPhone) {
    return false
  }

  const phones = Array.isArray(recipientPhones) ? recipientPhones : []
  return phones.some(candidate =>
    typeof candidate === 'string' && normalizePhoneDigits(candidate) === normalizedPhone
  )
}
