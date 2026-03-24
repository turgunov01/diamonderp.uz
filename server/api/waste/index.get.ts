import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../utils/supabase'
import { mapBinRow, mapReportRow, type WasteBin, type WasteBinRow, type WasteReport, type WasteReportRow } from './waste'

interface WasteResponse {
  bins: WasteBin[]
  reports: WasteReport[]
}

export default eventHandler(async (event): Promise<WasteResponse> => {
  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const objectIdRaw = getQuery(event).objectId
  const objectId = objectIdRaw ? Number(objectIdRaw) : NaN
  const filterByObject = Number.isInteger(objectId) && objectId > 0

  const headers = getSupabaseServerHeaders(serviceRoleKey)

  const binQuery: Record<string, string> = {
    select: 'id,object_id,category,volume_m3,weight_kg,status,created_at,updated_at',
    order: 'id.asc'
  }
  if (filterByObject) {
    binQuery.object_id = `eq.${objectId}`
  }

  const reportQuery: Record<string, string> = {
    select: 'id,bin_id,object_id,category,amount_m3,amount_kg,direction,from_object_id,to_object_id,vehicle,photo_url,comment,created_at',
    order: 'created_at.desc',
    limit: '50'
  }
  if (filterByObject) {
    reportQuery.object_id = `eq.${objectId}`
  }

  const [binsRows, reportRows] = await Promise.all([
    $fetch<WasteBinRow[]>(`${url}/rest/v1/waste_bins`, { headers, query: binQuery }),
    $fetch<WasteReportRow[]>(`${url}/rest/v1/waste_reports`, { headers, query: reportQuery })
  ])

  return {
    bins: binsRows.map(mapBinRow),
    reports: reportRows.map(mapReportRow)
  }
})
