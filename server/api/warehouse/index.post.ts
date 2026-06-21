import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
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
  const { url, serviceRoleKey } = getDataApiServerConfig()

  const rows = await $fetch<WarehouseItemDbRow[]>(`${url}/rest/v1/warehouse_items`, {
    method: 'POST',
    headers: {
      ...getDataApiServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    body: {
      name: payload.name,
      manufacturer: payload.manufacturer,
      calculation_type: payload.calculationType,
      unit_price: payload.unitPrice,
      is_active: true
    }
  })

  const created = rows[0]
  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Postgres не вернул созданную позицию.' })
  }

  setResponseStatus(event, 201)
  return mapWarehouseItemDbRowToRecord(created)
})
