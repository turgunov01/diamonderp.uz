import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'

type BuildingRow = {
  id: number
  name: string
  logo?: string | null
  description?: string | null
}

export default eventHandler(async () => {
  const { url, serviceRoleKey } = getDataApiServerConfig()

  return await $fetch<BuildingRow[]>(`${url}/rest/v1/buildings`, {
    headers: getDataApiServerHeaders(serviceRoleKey),
    query: {
      select: 'id,name,logo,description',
      order: 'id.asc'
    }
  })
})
