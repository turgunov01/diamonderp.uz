import { postgresQuery } from '../../utils/postgres'
import {
  isWarehouseCalculationType,
  mapWarehouseItemDbRowToRecord,
  parsePositiveInt,
  requiredTrimmedString,
  type WarehouseCalculationType,
  type WarehouseItemDbRow
} from './warehouse'

interface CreateWarehouseItemBody {
  name: string
  manufacturer: string
  calculationType: WarehouseCalculationType
  unitPrice: number
}

function parseCreateBody(body: unknown): CreateWarehouseItemBody {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Тело запроса должно быть корректным объектом.' })
  }

  const input = body as Partial<CreateWarehouseItemBody>
  const calculationType = input.calculationType

  if (!isWarehouseCalculationType(calculationType)) {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный тип расчета.' })
  }

  return {
    name: requiredTrimmedString(input.name, 'name'),
    manufacturer: requiredTrimmedString(input.manufacturer, 'manufacturer'),
    calculationType,
    unitPrice: parsePositiveInt(input.unitPrice, 'unitPrice')
  }
}

export default eventHandler(async (event) => {
  const payload = parseCreateBody(await readBody(event))
  const result = await postgresQuery<WarehouseItemDbRow>(
    `insert into public.warehouse_items (name, manufacturer, calculation_type, unit_price, is_active)
     values ($1, $2, $3, $4, true)
     on conflict (lower(name), lower(manufacturer), calculation_type)
     do update
     set name = excluded.name,
         manufacturer = excluded.manufacturer,
         unit_price = excluded.unit_price,
         is_active = true
     where warehouse_items.is_active = false
     returning id, name, manufacturer, calculation_type, unit_price, is_active, created_at, updated_at`,
    [payload.name, payload.manufacturer, payload.calculationType, payload.unitPrice]
  )

  const created = result.rows[0]
  if (!created) {
    throw createError({ statusCode: 409, statusMessage: 'Такая активная позиция уже существует.' })
  }

  setResponseStatus(event, 201)
  return mapWarehouseItemDbRowToRecord(created)
})
