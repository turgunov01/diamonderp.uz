import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import {
  mapExpenseDbRowToRecord,
  type ExpenseDbRow,
  type ExpenseRecord
} from './expenses'

interface ExpenseSummary {
  totalPlanned: number
  totalActual: number
  byStatus: Record<string, number>
}

interface ExpenseResponse {
  items: ExpenseRecord[]
  summary: ExpenseSummary
}

export default eventHandler(async (event): Promise<ExpenseResponse> => {
  const { url, serviceRoleKey } = getSupabaseServerConfig()

  const objectIdRaw = getQuery(event).objectId
  const objectId = objectIdRaw ? Number(objectIdRaw) : NaN
  const filterByObject = Number.isInteger(objectId) && objectId > 0

  const query: Record<string, string> = {
    select: 'id,title,category,vendor,planned_amount,actual_amount,warehouse_item_id,quantity,currency,due_date,status,notes,created_at,updated_at,warehouseItem:warehouse_items(id,name,manufacturer,calculation_type,unit_price)',
    order: 'id.asc'
  }

  if (filterByObject) {
    query.object_id = `eq.${objectId}`
  }

  const rows = await $fetch<ExpenseDbRow[]>(`${url}/rest/v1/expenses`, {
    headers: getSupabaseServerHeaders(serviceRoleKey),
    query
  })

  const items = rows.map(mapExpenseDbRowToRecord)

  const summary: ExpenseSummary = {
    totalPlanned: items.reduce((sum, item) => sum + item.plannedAmount, 0),
    totalActual: items.reduce((sum, item) => sum + (item.actualAmount || 0), 0),
    byStatus: {
      draft: 0,
      approved: 0,
      rejected: 0,
      paid: 0
    }
  }

  for (const item of items) {
    summary.byStatus[item.status] = (summary.byStatus[item.status] || 0) + 1
  }

  return {
    items,
    summary
  }
})

