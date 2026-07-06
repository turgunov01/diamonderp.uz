import type { PoolClient, QueryResultRow } from 'pg'
import { withPostgresTransaction } from './postgres'

export interface DeletedCustomerRow {
  id: number
  username: string
}

interface CustomerDeleteRow extends QueryResultRow {
  id: number | string
  username: string
}

interface ForeignKeyReferenceRow extends QueryResultRow {
  table_name: string
  column_name: string
  is_not_null: boolean
}

export function parseCustomerIds(idsRaw: unknown) {
  if (!Array.isArray(idsRaw)) {
    throw createError({ statusCode: 400, statusMessage: 'ids должен быть массивом.' })
  }

  const ids = idsRaw.map((idRaw) => {
    const id = Number(idRaw)
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'ids содержит некорректный id сотрудника.' })
    }

    return id
  })

  return Array.from(new Set(ids))
}

function quoteIdentifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw createError({ statusCode: 500, statusMessage: `Некорректное имя в схеме базы: ${value}.` })
  }

  return `"${value.replace(/"/g, '""')}"`
}

function normalizeCustomerRows(rows: CustomerDeleteRow[]): DeletedCustomerRow[] {
  return rows.map(row => ({
    id: Number(row.id),
    username: row.username
  }))
}

async function getCustomerForeignKeyReferences(client: PoolClient) {
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
        and con.confrelid = 'public.customers'::regclass
        and ns.nspname = 'public'
        and array_length(con.conkey, 1) = 1
      order by cls.relname, att.attname
    `
  )

  return result.rows
}

async function detachOrDeleteReferences(client: PoolClient, customerIds: number[]) {
  const references = await getCustomerForeignKeyReferences(client)

  for (const reference of references) {
    if (reference.table_name === 'customers') {
      continue
    }

    const table = `public.${quoteIdentifier(reference.table_name)}`
    const column = quoteIdentifier(reference.column_name)

    if (reference.is_not_null) {
      await client.query(
        `delete from ${table} where ${column} = any($1::bigint[])`,
        [customerIds]
      )
      continue
    }

    await client.query(
      `update ${table} set ${column} = null where ${column} = any($1::bigint[])`,
      [customerIds]
    )
  }
}

function mapCustomerDeletionError(error: unknown): never {
  const pgError = error as { code?: string, constraint?: string, detail?: string, message?: string }

  if (pgError?.code === '23503') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Нельзя удалить сотрудников: в базе остались связанные записи. Проверьте ограничения внешних ключей для customers.',
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
      statusMessage: 'Схема базы данных не совпадает с кодом удаления сотрудников.',
      data: {
        code: pgError.code,
        detail: pgError.message
      }
    })
  }

  throw error
}

/**
 * Delete customers (employees) by id. Child tables referencing customers are
 * cleaned up first: NOT NULL references are deleted, nullable references are
 * unlinked (set null). This mirrors the object-deletion strategy and stays
 * correct even when the live DB's FK on-delete rules differ from the scripts.
 */
export async function deleteCustomersByIds(ids: number[]): Promise<DeletedCustomerRow[]> {
  const customerIds = Array.from(new Set(ids))

  if (!customerIds.length) {
    return []
  }

  try {
    return await withPostgresTransaction(async (client) => {
      const existingResult = await client.query<CustomerDeleteRow>(
        `
          select id, username
          from public.customers
          where id = any($1::bigint[])
        `,
        [customerIds]
      )
      const existingRows = normalizeCustomerRows(existingResult.rows)
      const existingIds = existingRows.map(row => row.id)

      if (!existingIds.length) {
        return []
      }

      await detachOrDeleteReferences(client, existingIds)

      const deletedResult = await client.query<CustomerDeleteRow>(
        `
          delete from public.customers
          where id = any($1::bigint[])
          returning id, username
        `,
        [existingIds]
      )

      return normalizeCustomerRows(deletedResult.rows)
    })
  } catch (error) {
    mapCustomerDeletionError(error)
  }
}
