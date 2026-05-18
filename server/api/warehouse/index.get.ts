import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import {
  mapWarehouseItemDbRowToRecord,
  type WarehouseCalculationType,
  type WarehouseItemDbRow,
  type WarehouseItemRecord
} from './warehouse'

interface WarehouseSummary {
  total: number
  active: number
  byCalculationType: Record<WarehouseCalculationType, number>
}

interface WarehouseResponse {
  items: WarehouseItemRecord[]
  summary: WarehouseSummary
}

export default eventHandler(async (event): Promise<WarehouseResponse> => {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const activeOnly = getQuery(event).activeOnly === 'true'

  const query: Record<string, string> = {
    select: 'id,name,manufacturer,calculation_type,unit_price,is_active,created_at,updated_at',
    order: 'id.asc'
  }

  if (activeOnly) {
    query.is_active = 'eq.true'
  }

  const rows = await $fetch<WarehouseItemDbRow[]>(`${url}/rest/v1/warehouse_items`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query
  })

  const items = rows.map(mapWarehouseItemDbRowToRecord)
  const summary: WarehouseSummary = {
    total: items.length,
    active: items.filter(item => item.isActive).length,
    byCalculationType: {
      kg: 0,
      liter: 0,
      piece: 0
    }
  }

  for (const item of items) {
    summary.byCalculationType[item.calculationType] += 1
  }

  return {
    items,
    summary
  }
})
