import { getDataApiServerConfig, getDataApiServerHeaders } from '../../utils/data-api'
import { getDataApiErrorData } from '../documents/documents'

type ObjectRow = {
  id: number
  building_id?: number | null
  name: string
  description?: string | null
  address?: string | null
  code?: string | null
  is_active?: boolean
}

function parseObjectId(idRaw: string | undefined) {
  const id = Number(idRaw)
  if (!idRaw || !Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный id объекта.' })
  }

  return id
}

export default eventHandler(async (event) => {
  const id = parseObjectId(getRouterParam(event, 'id'))
  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)

  try {
    const rows = await $fetch<ObjectRow[]>(`${url}/rest/v1/objects`, {
      method: 'DELETE',
      headers: {
        ...headers,
        Prefer: 'return=representation'
      },
      query: { id: `eq.${id}` }
    })

    const deleted = rows[0]
    if (!deleted) {
      throw createError({ statusCode: 404, statusMessage: 'Объект не найден.' })
    }

    return deleted
  } catch (error: unknown) {
    const data = getDataApiErrorData(error)

    // Common case: foreign key constraint violation when object is referenced by other tables.
    // Postgres error code: 23503 (foreign_key_violation)
    if (data?.code === '23503') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Нельзя удалить объект: есть связанные записи (документы/сотрудники/отчёты). Сначала удалите или отвяжите зависимости.'
      })
    }

    throw error
  }
})

