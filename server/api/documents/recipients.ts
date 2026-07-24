// Чистая логика отбора получателей рассылки документов — без Nuxt/h3
// зависимостей, чтобы её можно было переиспользовать в обработчике отправки
// и покрыть юнит-тестами.

export interface CustomerRecipientRow {
  id: number
  username: string
  phone_number: string
  building_id?: number | null
  object_pinned?: string | null
  object_positions?: string[] | null
}

// Имена объектов, к которым привязан сотрудник (`object_pinned` +
// `object_positions`), нормализованные: без лишних пробелов и регистра.
export function customerAssignedObjectNames(customer: CustomerRecipientRow): string[] {
  const positions = Array.isArray(customer.object_positions) ? customer.object_positions : []
  return [customer.object_pinned, ...positions]
    .map(value => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .filter(Boolean)
}

// Сотрудник закреплён за объектом, если имя объекта совпадает с его
// `object_pinned` или встречается в `object_positions`. Сравнение без учёта
// регистра и пробелов — так же, как мобильный доступ решает, какие объекты
// видит сотрудник (server/utils/mobile-access.ts).
export function customerBelongsToObject(customer: CustomerRecipientRow, objectName: string): boolean {
  const target = typeof objectName === 'string' ? objectName.trim().toLowerCase() : ''
  if (!target) {
    return false
  }

  return customerAssignedObjectNames(customer).includes(target)
}

/**
 * Собирает итоговый список получателей рассылки.
 *
 * Правило: документ получают ВСЕ сотрудники объекта (по привязке к его имени),
 * а явно выбранные id только ДОБАВЛЯЮТСЯ — никто из выбранных не отбрасывается.
 * Порядок стабильный (по возрастанию id), дубликаты убираются.
 *
 * @param buildingCustomers Сотрудники здания объекта (плюс legacy без building_id).
 * @param objectName        Имя объекта, для которого идёт рассылка.
 * @param explicitRecipientIds Явно выбранные в ERP получатели (необязательно).
 */
export function resolveDispatchRecipients(
  buildingCustomers: CustomerRecipientRow[],
  objectName: string,
  explicitRecipientIds: Iterable<number> = []
): CustomerRecipientRow[] {
  const explicit = new Set<number>()
  for (const raw of explicitRecipientIds) {
    const id = Number(raw)
    if (Number.isInteger(id) && id > 0) {
      explicit.add(id)
    }
  }

  const selected = new Map<number, CustomerRecipientRow>()
  for (const customer of buildingCustomers) {
    const id = Number(customer.id)
    if (!Number.isInteger(id) || id <= 0) {
      continue
    }

    if (customerBelongsToObject(customer, objectName) || explicit.has(id)) {
      selected.set(id, { ...customer, id })
    }
  }

  return Array.from(selected.values()).sort((a, b) => a.id - b.id)
}
