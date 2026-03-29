import { parseRequestedObjectId, requireMobileAccess, resolveScopedObjectIds } from '../../../utils/mobile-access'
import { buildEqOrInFilter } from '../../../utils/postgrest'
import { getSupabaseServerConfig, getSupabaseServerHeaders } from '../../../utils/supabase'
import { mapBinRow, mapReportRow, type WasteBinRow, type WasteReportRow } from '../../waste/waste'

export default eventHandler(async (event) => {
  const access = await requireMobileAccess(event)
  const requestedObjectId = parseRequestedObjectId(getQuery(event).objectId)
  const objectIds = resolveScopedObjectIds(access, requestedObjectId)

  if (!objectIds.length) {
    return { bins: [], reports: [] }
  }

  const { url, serviceRoleKey } = getSupabaseServerConfig()
  const headers = getSupabaseServerHeaders(serviceRoleKey)
  const objectFilter = buildEqOrInFilter(objectIds)

  const [binsRows, reportRows] = await Promise.all([
    $fetch<WasteBinRow[]>(`${url}/rest/v1/waste_bins`, {
      headers,
      query: {
        select: 'id,object_id,category,volume_m3,weight_kg,status,created_at,updated_at',
        object_id: objectFilter,
        order: 'id.asc'
      }
    }),
    $fetch<WasteReportRow[]>(`${url}/rest/v1/waste_reports`, {
      headers,
      query: {
        select: 'id,bin_id,object_id,category,amount_m3,amount_kg,direction,from_object_id,to_object_id,vehicle,photo_url,comment,created_at',
        or: `(from_object_id.${objectFilter},to_object_id.${objectFilter},object_id.${objectFilter})`,
        order: 'created_at.desc',
        limit: '100'
      }
    })
  ])

  return {
    role: access.role,
    frontend: access.frontend,
    objectIds,
    bins: binsRows.map(mapBinRow),
    reports: reportRows.map(mapReportRow)
  }
})
