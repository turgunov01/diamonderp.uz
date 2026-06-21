import { getDataApiServerConfig, getDataApiServerHeaders } from '../../../utils/data-api'
import {
  mapTemplateDbRowToRecord,
  parseObjectIdInput,
  type DocumentTemplateDbRow
} from '../documents'

export default eventHandler(async (event) => {
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const objectId = parseObjectIdInput(getQuery(event).objectId, 'objectId query param is required.')

  const rows = await $fetch<DocumentTemplateDbRow[]>(`${url}/rest/v1/document_templates`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query: {
      select: 'id,object_id,name,description,contract_type,html,css,storage_path,created_at,updated_at',
      object_id: `eq.${objectId}`,
      order: 'id.desc'
    }
  })

  return rows.map(mapTemplateDbRowToRecord)
})
