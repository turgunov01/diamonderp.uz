import { getDataApiServerConfig, getDataApiServerHeaders } from './data-api'
import { deleteObjectsByIds } from './object-deletion'
import { deleteCustomersByIds } from './customer-deletion'

export interface DeletedBuildingRow {
  id: number
  name: string
}

interface BuildingRow {
  id: number | string
  name: string
}

interface ObjectIdRow {
  id: number | string
}

export function parseBuildingId(idRaw: string | number | undefined | null) {
  const id = Number(idRaw)
  if (idRaw === undefined || idRaw === null || !Number.isSafeInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный id здания.' })
  }

  return id
}

export function parseBuildingIds(idsRaw: unknown) {
  if (!Array.isArray(idsRaw)) {
    throw createError({ statusCode: 400, statusMessage: 'ids должен быть массивом.' })
  }

  if (!idsRaw.length) {
    throw createError({ statusCode: 400, statusMessage: 'Выберите хотя бы одно здание.' })
  }

  const ids = idsRaw.map((idRaw) => {
    const id = Number(idRaw)
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'ids содержит некорректный id здания.' })
    }

    return id
  })

  return Array.from(new Set(ids))
}

/**
 * Delete buildings by id. A building cascades to its objects at the DB level, but
 * those objects carry their own non-cascading references (task lists, bindings),
 * so we clean them up with the tested object-deletion logic before removing the
 * building. Customers reference the building with ON DELETE SET NULL and are left
 * intact (only unlinked) by the FK itself.
 */
export async function deleteBuildingsByIds(
  ids: number[],
  options: { deleteCustomers?: boolean } = {}
): Promise<DeletedBuildingRow[]> {
  const buildingIds = Array.from(new Set(ids))

  if (!buildingIds.length) {
    return []
  }

  const { url, serviceRoleKey } = getDataApiServerConfig()
  const headers = getDataApiServerHeaders(serviceRoleKey)
  const idFilter = `in.(${buildingIds.join(',')})`

  const existing = await $fetch<BuildingRow[]>(`${url}/rest/v1/buildings`, {
    headers,
    query: {
      select: 'id,name',
      id: idFilter
    }
  })

  if (!existing.length) {
    return []
  }

  const existingIds = existing.map(row => Number(row.id))
  const existingFilter = `in.(${existingIds.join(',')})`

  const relatedObjects = await $fetch<ObjectIdRow[]>(`${url}/rest/v1/objects`, {
    headers,
    query: {
      select: 'id',
      building_id: existingFilter
    }
  })

  const relatedObjectIds = relatedObjects.map(row => Number(row.id))
  if (relatedObjectIds.length) {
    await deleteObjectsByIds(relatedObjectIds)
  }

  // Resolve the building's customers. The live DB's customers_building_id_fkey
  // does NOT set null on delete, so the reference must be cleared (or the rows
  // deleted) before the building DELETE — otherwise it fails with an FK error.
  const relatedCustomers = await $fetch<ObjectIdRow[]>(`${url}/rest/v1/customers`, {
    headers,
    query: {
      select: 'id',
      building_id: existingFilter
    }
  })
  const relatedCustomerIds = relatedCustomers.map(row => Number(row.id))

  if (relatedCustomerIds.length) {
    if (options.deleteCustomers) {
      // Remove employees together with the building.
      await deleteCustomersByIds(relatedCustomerIds)
    } else {
      // Keep employees: just unlink them from the building.
      await $fetch(`${url}/rest/v1/customers`, {
        method: 'PATCH',
        headers,
        query: { building_id: existingFilter },
        body: { building_id: null }
      })
    }
  }

  const deleted = await $fetch<BuildingRow[]>(`${url}/rest/v1/buildings`, {
    method: 'DELETE',
    headers: {
      ...headers,
      Prefer: 'return=representation'
    },
    query: { id: existingFilter }
  })

  return deleted.map(row => ({ id: Number(row.id), name: row.name }))
}
