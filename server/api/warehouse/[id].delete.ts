import type { H3Event } from 'h3'
import { verifyAuthToken } from '../../utils/auth'
import { postgresQuery } from '../../utils/postgres'
import { mapWarehouseItemDbRowToRecord, type WarehouseItemDbRow } from './warehouse'

const WAREHOUSE_ITEM_SELECT = 'id, name, manufacturer, calculation_type, unit_price, is_active, created_at, updated_at'

function parseWarehouseItemId(event: H3Event) {
  const rawId = getRouterParam(event, 'id')
  const warehouseItemId = Number(rawId)

  if (!rawId || !Number.isInteger(warehouseItemId) || warehouseItemId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный идентификатор позиции склада.' })
  }

  return warehouseItemId
}

function readAuthToken(event: H3Event) {
  const authorization = getHeader(event, 'authorization') || getHeader(event, 'Authorization')
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined

  return bearer || getCookie(event, 'diamond-erp-token') || ''
}

function requireAdminSession(event: H3Event) {
  let payload: ReturnType<typeof verifyAuthToken>

  try {
    payload = verifyAuthToken(readAuthToken(event))
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Требуется авторизация.' })
  }

  if (payload.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Удаление позиций склада доступно только администратору.' })
  }
}

export default eventHandler(async (event) => {
  requireAdminSession(event)

  const warehouseItemId = parseWarehouseItemId(event)
  const result = await postgresQuery<WarehouseItemDbRow>(
    `update public.warehouse_items
     set is_active = false
     where id = $1 and is_active = true
     returning ${WAREHOUSE_ITEM_SELECT}`,
    [warehouseItemId]
  )

  const deleted = result.rows[0]
  if (deleted) {
    return mapWarehouseItemDbRowToRecord(deleted)
  }

  const existing = await postgresQuery<WarehouseItemDbRow>(
    `select ${WAREHOUSE_ITEM_SELECT}
     from public.warehouse_items
     where id = $1
     limit 1`,
    [warehouseItemId]
  )

  const existingItem = existing.rows[0]
  if (!existingItem) {
    throw createError({ statusCode: 404, statusMessage: 'Позиция склада не найдена.' })
  }

  return mapWarehouseItemDbRowToRecord(existingItem)
})
