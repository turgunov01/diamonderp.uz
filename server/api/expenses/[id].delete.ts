import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import { mapExpenseDbRowToRecord, type ExpenseDbRow } from './expenses'
import type { H3Event } from 'h3'

function parseExpenseId(event: H3Event) {
  const rawId = getRouterParam(event, 'id')
  const expenseId = Number(rawId)
  if (!rawId || !Number.isInteger(expenseId) || expenseId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂ СЂР°СЃС…РѕРґР°.'
    })
  }

  return expenseId
}

export default eventHandler(async (event) => {
  const expenseId = parseExpenseId(event)
  const { url, serviceRoleKey } = getDataApiServerConfig()

  const rows = await $fetch<ExpenseDbRow[]>(`${url}/rest/v1/expenses`, {
    method: 'DELETE',
    headers: {
      ...getDataApiServerHeaders(serviceRoleKey),
      Prefer: 'return=representation'
    },
    query: {
      id: `eq.${expenseId}`
    }
  })

  const deletedRow = rows[0]
  if (!deletedRow) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Р Р°СЃС…РѕРґ РЅРµ РЅР°Р№РґРµРЅ.'
    })
  }

  return mapExpenseDbRowToRecord(deletedRow)
})
