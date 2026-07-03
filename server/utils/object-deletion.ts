import type { PoolClient, QueryResultRow } from 'pg'
import { withPostgresTransaction } from './postgres'

export interface DeletedObjectRow {
  id: number
  name: string
}

interface ObjectDeleteRow extends QueryResultRow {
  id: number | string
  name: string
}

interface ColumnRow extends QueryResultRow {
  column_name: string
}

interface ForeignKeyReferenceRow extends QueryResultRow {
  table_name: string
  column_name: string
  is_not_null: boolean
}

const DELETE_REFERENCE_TABLES = new Set([
  'object_task_lists',
  'telegram_group_bindings'
])

export function parseObjectId(idRaw: string | number | undefined | null) {
  const id = Number(idRaw)
  if (idRaw === undefined || idRaw === null || !Number.isSafeInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Некорректный id объекта.' })
  }

  return id
}

export function parseObjectIds(idsRaw: unknown) {
  if (!Array.isArray(idsRaw)) {
    throw createError({ statusCode: 400, statusMessage: 'ids должен быть массивом.' })
  }

  if (!idsRaw.length) {
    throw createError({ statusCode: 400, statusMessage: 'Выберите хотя бы один объект.' })
  }

  const ids = idsRaw.map((idRaw) => {
    const id = Number(idRaw)
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'ids содержит некорректный id объекта.' })
    }

    return id
  })

  return Array.from(new Set(ids))
}

function normalizeObjectRows(rows: ObjectDeleteRow[]): DeletedObjectRow[] {
  return rows.map(row => ({
    id: Number(row.id),
    name: row.name
  }))
}

function quoteIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw createError({ statusCode: 500, statusMessage: `Некорректное имя в схеме базы: ${value}.` })
  }

  return `"${value.replace(/"/g, '""')}"`
}

async function getExistingColumns(client: PoolClient, table: string, columns: string[]) {
  const result = await client.query<ColumnRow>(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
        and column_name = any($2::text[])
    `,
    [table, columns]
  )

  return new Set(result.rows.map(row => row.column_name))
}

async function deleteObjectTaskItems(client: PoolClient, objectIds: number[]) {
  const taskListColumns = await getExistingColumns(client, 'object_task_lists', ['id', 'object_id'])
  const taskItemColumns = await getExistingColumns(client, 'object_task_items', ['task_list_id'])

  if (!taskListColumns.has('id') || !taskListColumns.has('object_id') || !taskItemColumns.has('task_list_id')) {
    return
  }

  await client.query(
    `
      delete from public.object_task_items
      where task_list_id in (
        select id
        from public.object_task_lists
        where object_id = any($1::bigint[])
      )
    `,
    [objectIds]
  )
}

async function getObjectForeignKeyReferences(client: PoolClient) {
  const result = await client.query<ForeignKeyReferenceRow>(
    `
      select
        cls.relname as table_name,
        att.attname as column_name,
        att.attnotnull as is_not_null
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      join pg_namespace ns on ns.oid = cls.relnamespace
      join unnest(con.conkey) with ordinality as cols(attnum, ord) on true
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = cols.attnum
      where con.contype = 'f'
        and con.confrelid = 'public.objects'::regclass
        and ns.nspname = 'public'
        and array_length(con.conkey, 1) = 1
      order by cls.relname, att.attname
    `
  )

  return result.rows
}

async function detachOrDeleteReferences(client: PoolClient, objectIds: number[]) {
  await deleteObjectTaskItems(client, objectIds)

  const references = await getObjectForeignKeyReferences(client)

  for (const reference of references) {
    if (reference.table_name === 'objects') {
      continue
    }

    const table = `public.${quoteIdentifier(reference.table_name)}`
    const column = quoteIdentifier(reference.column_name)
    const shouldDeleteRows = reference.is_not_null || DELETE_REFERENCE_TABLES.has(reference.table_name)

    if (shouldDeleteRows) {
      await client.query(
        `delete from ${table} where ${column} = any($1::bigint[])`,
        [objectIds]
      )
      continue
    }

    await client.query(
      `update ${table} set ${column} = null where ${column} = any($1::bigint[])`,
      [objectIds]
    )
  }
}

function sortRowsByRequestedIds(rows: DeletedObjectRow[], requestedIds: number[]) {
  const order = new Map(requestedIds.map((id, index) => [id, index]))

  return [...rows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

function mapObjectDeletionError(error: unknown): never {
  const pgError = error as { code?: string, constraint?: string, detail?: string, message?: string }

  if (pgError?.code === '23503') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Нельзя удалить объект: в базе остались связанные записи. Проверьте ограничения внешних ключей для objects.',
      data: {
        code: pgError.code,
        constraint: pgError.constraint,
        detail: pgError.detail
      }
    })
  }

  if (pgError?.code === '42P01' || pgError?.code === '42703') {
    throw createError({
      statusCode: 500,
      statusMessage: 'Схема базы данных не совпадает с кодом удаления объектов.',
      data: {
        code: pgError.code,
        detail: pgError.message
      }
    })
  }

  throw error
}

export async function deleteObjectsByIds(ids: number[]) {
  const objectIds = Array.from(new Set(ids))

  if (!objectIds.length) {
    return []
  }

  try {
    return await withPostgresTransaction(async (client) => {
      const existingResult = await client.query<ObjectDeleteRow>(
        `
          select id, name
          from public.objects
          where id = any($1::bigint[])
        `,
        [objectIds]
      )
      const existingRows = normalizeObjectRows(existingResult.rows)
      const existingIds = existingRows.map(row => row.id)

      if (!existingIds.length) {
        return []
      }

      await detachOrDeleteReferences(client, existingIds)

      const deletedResult = await client.query<ObjectDeleteRow>(
        `
          delete from public.objects
          where id = any($1::bigint[])
          returning id, name
        `,
        [existingIds]
      )

      return sortRowsByRequestedIds(normalizeObjectRows(deletedResult.rows), objectIds)
    })
  } catch (error) {
    mapObjectDeletionError(error)
  }
}
