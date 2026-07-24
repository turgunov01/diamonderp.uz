import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  isDispatchRecipient,
  normalizePhoneDigits
} from '../server/api/documents/dispatch-visibility.ts'

test('normalizePhoneDigits оставляет только цифры', () => {
  assert.equal(normalizePhoneDigits('+998 (90) 123-45-67'), '998901234567')
  assert.equal(normalizePhoneDigits(null), '')
  assert.equal(normalizePhoneDigits(undefined), '')
})

test('получатель по customerId (число)', () => {
  assert.equal(isDispatchRecipient([25, 30], [], 25, null), true)
})

test('получатель по customerId, когда id приходят строками (bigint из PostgREST)', () => {
  assert.equal(isDispatchRecipient(['25', '30'], [], 25, null), true)
})

test('получатель по телефону при разном форматировании', () => {
  assert.equal(
    isDispatchRecipient([], ['+998 90 123 45 67'], 0, '998901234567'),
    true
  )
  assert.equal(
    isDispatchRecipient([], ['998901234567'], 999, '+998-90-123-45-67'),
    true
  )
})

test('НЕ получатель: ни id, ни телефон не совпадают', () => {
  assert.equal(
    isDispatchRecipient([1, 2, 3], ['+998900000000'], 25, '+998901234567'),
    false
  )
})

test('пустой телефон не даёт ложного совпадения с пустыми/невалидными recipient_phones', () => {
  assert.equal(isDispatchRecipient([], [null, '', 'abc'], 0, ''), false)
  assert.equal(isDispatchRecipient([], [null], 0, null), false)
})

test('невалидный customerId (0/NaN/отрицательный) не матчится по id, но матчится по телефону', () => {
  assert.equal(isDispatchRecipient([0], [], 0, null), false)
  assert.equal(isDispatchRecipient([1], [], Number.NaN, null), false)
  assert.equal(
    isDispatchRecipient([], ['998901234567'], Number.NaN, '998901234567'),
    true
  )
})

// Семантика менеджера: assignedToCurrentUser = isDispatchRecipient(...).
// Документ объекта, где менеджер НЕ получатель, помечается как «не мой» (в
// личном списке не показывается), а адресованный лично — как «мой».
test('менеджер: документ объекта без него в получателях — не назначен ему', () => {
  const managerId = 7
  const managerPhone = '+998911112233'

  const objectWideDispatch = { recipient_ids: [10, 11], recipient_phones: ['+998900000001', '+998900000002'] }
  const personalDispatch = { recipient_ids: [10, 7], recipient_phones: ['+998900000001', '+998911112233'] }

  assert.equal(
    isDispatchRecipient(objectWideDispatch.recipient_ids, objectWideDispatch.recipient_phones, managerId, managerPhone),
    false
  )
  assert.equal(
    isDispatchRecipient(personalDispatch.recipient_ids, personalDispatch.recipient_phones, managerId, managerPhone),
    true
  )
})
