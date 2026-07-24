import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  customerBelongsToObject,
  resolveDispatchRecipients,
  type CustomerRecipientRow
} from '../server/api/documents/recipients.ts'

// Небольшой билдер, чтобы тесты читались как данные, а не как шум.
function customer(partial: Partial<CustomerRecipientRow> & { id: number }): CustomerRecipientRow {
  return {
    username: `user${partial.id}`,
    phone_number: `+99890000000${partial.id}`,
    building_id: 1,
    object_pinned: null,
    object_positions: [],
    ...partial
  }
}

const ids = (rows: CustomerRecipientRow[]) => rows.map(row => row.id)

test('customerBelongsToObject: закреплённый объект (object_pinned)', () => {
  const cleaner = customer({ id: 1, object_pinned: 'Diamond Plaza' })
  assert.equal(customerBelongsToObject(cleaner, 'Diamond Plaza'), true)
})

test('customerBelongsToObject: объект из object_positions', () => {
  const cleaner = customer({ id: 2, object_positions: ['Ocean Mall', 'Diamond Plaza'] })
  assert.equal(customerBelongsToObject(cleaner, 'Diamond Plaza'), true)
})

test('customerBelongsToObject: совпадение без учёта регистра и пробелов', () => {
  const cleaner = customer({ id: 3, object_pinned: '  diamond plaza ' })
  assert.equal(customerBelongsToObject(cleaner, 'Diamond Plaza'), true)
})

test('customerBelongsToObject: чужой объект не совпадает', () => {
  const cleaner = customer({ id: 4, object_pinned: 'Ocean Mall' })
  assert.equal(customerBelongsToObject(cleaner, 'Diamond Plaza'), false)
})

test('без явного выбора документ получают ВСЕ сотрудники объекта (в т.ч. уборщики)', () => {
  const buildingCustomers = [
    customer({ id: 10, object_pinned: 'Diamond Plaza' }),                 // уборщик, закреплён
    customer({ id: 11, object_positions: ['Diamond Plaza'] }),            // уборщик по позиции
    customer({ id: 12, object_pinned: 'Ocean Mall' }),                    // другой объект — не должен попасть
    customer({ id: 13, object_pinned: null, object_positions: [] })       // без привязки — не должен попасть
  ]

  const recipients = resolveDispatchRecipients(buildingCustomers, 'Diamond Plaza')

  assert.deepEqual(ids(recipients), [10, 11])
})

test('явно выбранные получатели ДОБАВЛЯЮТСЯ и не отбрасываются', () => {
  const buildingCustomers = [
    customer({ id: 20, object_pinned: 'Diamond Plaza' }),  // сотрудник объекта
    customer({ id: 21, object_pinned: 'Ocean Mall' })      // не сотрудник объекта, но выбран вручную
  ]

  const recipients = resolveDispatchRecipients(buildingCustomers, 'Diamond Plaza', [21])

  // 20 — по объекту, 21 — по явному выбору. Никто не потерян.
  assert.deepEqual(ids(recipients), [20, 21])
})

test('явный выбор не сужает круг: сотрудники объекта остаются даже если выбран лишь один', () => {
  const buildingCustomers = [
    customer({ id: 30, object_pinned: 'Diamond Plaza' }),
    customer({ id: 31, object_pinned: 'Diamond Plaza' }),
    customer({ id: 32, object_pinned: 'Diamond Plaza' })
  ]

  // ERP выбрал только одного, но объектных сотрудников терять нельзя.
  const recipients = resolveDispatchRecipients(buildingCustomers, 'Diamond Plaza', [31])

  assert.deepEqual(ids(recipients), [30, 31, 32])
})

test('дубликаты убираются, порядок стабильный по id', () => {
  const buildingCustomers = [
    customer({ id: 43, object_pinned: 'Diamond Plaza' }),
    customer({ id: 41, object_pinned: 'Diamond Plaza' }),
    customer({ id: 42, object_pinned: 'Diamond Plaza' })
  ]

  // 41 продублирован в явном выборе — в результате должен быть один раз.
  const recipients = resolveDispatchRecipients(buildingCustomers, 'Diamond Plaza', [41, 41])

  assert.deepEqual(ids(recipients), [41, 42, 43])
})

test('пустой результат, если нет ни объектных, ни явных получателей', () => {
  const buildingCustomers = [
    customer({ id: 50, object_pinned: 'Ocean Mall' })
  ]

  const recipients = resolveDispatchRecipients(buildingCustomers, 'Diamond Plaza')

  assert.deepEqual(ids(recipients), [])
})

test('некорректные id (0, отрицательные, NaN) игнорируются', () => {
  const buildingCustomers = [
    customer({ id: 60, object_pinned: 'Diamond Plaza' }),
    customer({ id: 0, object_pinned: 'Diamond Plaza' }),
    customer({ id: -5, object_pinned: 'Diamond Plaza' })
  ]

  const recipients = resolveDispatchRecipients(buildingCustomers, 'Diamond Plaza', [Number.NaN, -1, 0])

  assert.deepEqual(ids(recipients), [60])
})
