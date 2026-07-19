import { postgresQuery } from '../../../utils/postgres'
import { assertInternalApiRequest } from '../../../utils/internal-api'
import type { H3Event } from 'h3'

type QueryValue = string | number | boolean | null | undefined | Array<string | number | boolean | null>

interface ConditionBuild {
  sql: string
  values: unknown[]
}

interface SelectRelation {
  alias: string
  table: string
  columns: string[]
}

interface SelectSpec {
  star: boolean
  columns: string[]
  relations: SelectRelation[]
}

const RESERVED_QUERY_KEYS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'or', 'and'])
const FILTER_OPERATORS = ['ilike', 'gte', 'lte', 'neq', 'eq', 'gt', 'lt', 'is', 'in', 'cs']

function assertIdentifier(value: string, label: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw createError({ statusCode: 400, message: `Invalid ${label}.` })
  }
}

function quoteIdentifier(value: string) {
  assertIdentifier(value, 'identifier')

  return `"${value.replace(/"/g, '""')}"`
}

function tableSql(table: string) {
  assertIdentifier(table, 'table')

  return `public.${quoteIdentifier(table)}`
}

function columnSql(column: string, alias = 't') {
  assertIdentifier(column, 'column')

  return `${alias}.${quoteIdentifier(column)}`
}

function splitTopLevel(input: string) {
  const items: string[] = []
  let current = ''
  let parenDepth = 0
  let braceDepth = 0

  for (const char of input) {
    if (char === '(') parenDepth += 1
    if (char === ')') parenDepth = Math.max(0, parenDepth - 1)
    if (char === '{') braceDepth += 1
    if (char === '}') braceDepth = Math.max(0, braceDepth - 1)

    if (char === ',' && parenDepth === 0 && braceDepth === 0) {
      if (current.trim()) items.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) {
    items.push(current.trim())
  }

  return items
}

function parseSelect(selectRaw?: QueryValue): SelectSpec {
  const select = typeof selectRaw === 'string' ? selectRaw.trim() : '*'
  if (!select || select === '*') {
    return { star: true, columns: [], relations: [] }
  }

  const columns: string[] = []
  const relations: SelectRelation[] = []

  for (const token of splitTopLevel(select)) {
    const relationMatch = /^([A-Za-z_][A-Za-z0-9_]*):([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/.exec(token)
    if (relationMatch) {
      const [, alias = '', table = '', columnsRaw = ''] = relationMatch
      relations.push({
        alias,
        table,
        columns: splitTopLevel(columnsRaw).filter(Boolean)
      })
      continue
    }

    assertIdentifier(token, 'select column')
    columns.push(token)
  }

  return { star: false, columns, relations }
}

function stripWrapping(value: string, left: string, right: string) {
  return value.startsWith(left) && value.endsWith(right)
    ? value.slice(1, -1)
    : value
}

function parseScalar(raw: string) {
  if (raw === 'null') return null
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)

  return raw
}

function parseFilterExpression(expression: string) {
  const operator = FILTER_OPERATORS.find(candidate => expression.startsWith(`${candidate}.`))
  if (!operator) {
    throw createError({ statusCode: 400, message: `Unsupported filter expression "${expression}".` })
  }

  return {
    operator,
    rawValue: expression.slice(operator.length + 1)
  }
}

function parseConditionToken(token: string) {
  const firstDot = token.indexOf('.')
  if (firstDot === -1) {
    throw createError({ statusCode: 400, message: `Invalid filter "${token}".` })
  }

  const column = token.slice(0, firstDot)
  const expression = token.slice(firstDot + 1)
  assertIdentifier(column, 'filter column')

  return {
    column,
    ...parseFilterExpression(expression)
  }
}

function buildCondition(column: string, expression: string, baseIndex: number): ConditionBuild {
  const { operator, rawValue } = parseFilterExpression(expression)
  const columnRef = columnSql(column)

  if (operator === 'is') {
    if (rawValue === 'null') {
      return { sql: `${columnRef} IS NULL`, values: [] }
    }
    if (rawValue === 'not.null') {
      return { sql: `${columnRef} IS NOT NULL`, values: [] }
    }
  }

  if (operator === 'in') {
    const values = splitTopLevel(stripWrapping(rawValue, '(', ')')).map(parseScalar)
    if (!values.length) {
      return { sql: 'false', values: [] }
    }

    const placeholders = values.map((_, index) => `$${baseIndex + index}`).join(', ')
    return { sql: `${columnRef} IN (${placeholders})`, values }
  }

  if (operator === 'cs') {
    const values = splitTopLevel(stripWrapping(rawValue, '{', '}')).map(parseScalar)
    if (!values.length) {
      return { sql: 'true', values: [] }
    }

    const clauses = values.map((_, index) => `$${baseIndex + index} = ANY(${columnRef})`)
    return { sql: clauses.join(' AND '), values }
  }

  const value = parseScalar(rawValue)
  const placeholder = `$${baseIndex}`

  if (operator === 'eq') return { sql: `${columnRef} = ${placeholder}`, values: [value] }
  if (operator === 'neq') return { sql: `${columnRef} <> ${placeholder}`, values: [value] }
  if (operator === 'gt') return { sql: `${columnRef} > ${placeholder}`, values: [value] }
  if (operator === 'gte') return { sql: `${columnRef} >= ${placeholder}`, values: [value] }
  if (operator === 'lt') return { sql: `${columnRef} < ${placeholder}`, values: [value] }
  if (operator === 'lte') return { sql: `${columnRef} <= ${placeholder}`, values: [value] }
  if (operator === 'ilike') return { sql: `${columnRef} ILIKE ${placeholder}`, values: [value] }

  throw createError({ statusCode: 400, message: `Unsupported filter operator "${operator}".` })
}

function queryValues(value: QueryValue): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string | number | boolean => item !== null && item !== undefined)
      .map(String)
  }

  if (value === null || value === undefined) {
    return []
  }

  return [String(value)]
}

function buildWhere(query: Record<string, QueryValue>, startIndex = 1): ConditionBuild {
  const clauses: string[] = []
  const values: unknown[] = []

  const addCondition = (condition: ConditionBuild) => {
    clauses.push(condition.sql)
    values.push(...condition.values)
  }

  for (const [key, raw] of Object.entries(query)) {
    if (RESERVED_QUERY_KEYS.has(key)) {
      continue
    }

    assertIdentifier(key, 'filter column')

    for (const expression of queryValues(raw)) {
      addCondition(buildCondition(key, expression, startIndex + values.length))
    }
  }

  for (const expression of queryValues(query.and)) {
    const inner = stripWrapping(expression, '(', ')')
    for (const token of splitTopLevel(inner)) {
      const parsed = parseConditionToken(token)
      addCondition(buildCondition(parsed.column, `${parsed.operator}.${parsed.rawValue}`, startIndex + values.length))
    }
  }

  for (const expression of queryValues(query.or)) {
    const inner = stripWrapping(expression, '(', ')')
    const orClauses: string[] = []
    const orValues: unknown[] = []

    for (const token of splitTopLevel(inner)) {
      const parsed = parseConditionToken(token)
      const condition = buildCondition(parsed.column, `${parsed.operator}.${parsed.rawValue}`, startIndex + values.length + orValues.length)
      orClauses.push(condition.sql)
      orValues.push(...condition.values)
    }

    if (orClauses.length) {
      clauses.push(`(${orClauses.join(' OR ')})`)
      values.push(...orValues)
    }
  }

  return {
    sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '',
    values
  }
}

function buildOrder(orderRaw?: QueryValue) {
  const order = typeof orderRaw === 'number' ? String(orderRaw) : typeof orderRaw === 'string' ? orderRaw : ''
  if (!order.trim()) {
    return ''
  }

  const items = splitTopLevel(order).map((item) => {
    const [column, directionRaw, nullsRaw] = item.split('.')
    if (!column) {
      throw createError({ statusCode: 400, message: 'Invalid order column.' })
    }
    assertIdentifier(column, 'order column')

    const direction = directionRaw?.toLowerCase() === 'desc' ? 'DESC' : 'ASC'
    const nulls = nullsRaw?.toLowerCase() === 'nullsfirst'
      ? ' NULLS FIRST'
      : nullsRaw?.toLowerCase() === 'nullslast'
        ? ' NULLS LAST'
        : ''

    return `${columnSql(column)} ${direction}${nulls}`
  })

  return items.length ? ` ORDER BY ${items.join(', ')}` : ''
}

function buildLimitOffset(query: Record<string, QueryValue>, startIndex: number): ConditionBuild {
  const values: unknown[] = []
  const clauses: string[] = []
  const limit = Number(Array.isArray(query.limit) ? query.limit[0] : query.limit)
  const offset = Number(Array.isArray(query.offset) ? query.offset[0] : query.offset)

  if (Number.isInteger(limit) && limit >= 0) {
    values.push(limit)
    clauses.push(` LIMIT $${startIndex + values.length - 1}`)
  }

  if (Number.isInteger(offset) && offset > 0) {
    values.push(offset)
    clauses.push(` OFFSET $${startIndex + values.length - 1}`)
  }

  return {
    sql: clauses.join(''),
    values
  }
}

function buildSelectList(table: string, select: SelectSpec) {
  const joins: string[] = []
  const selections: string[] = []

  if (select.star) {
    selections.push('t.*')
  } else {
    selections.push(...select.columns.map(column => `${columnSql(column)} AS ${quoteIdentifier(column)}`))
  }

  for (const relation of select.relations) {
    if (table === 'expenses' && relation.table === 'warehouse_items' && relation.alias === 'warehouseItem') {
      joins.push('LEFT JOIN public."warehouse_items" AS "warehouseItem__rel" ON "warehouseItem__rel"."id" = t."warehouse_item_id"')
      const objectFields = relation.columns.map((column) => {
        assertIdentifier(column, 'relation column')
        return `'${column}', "warehouseItem__rel".${quoteIdentifier(column)}`
      })
      selections.push(`CASE WHEN t."warehouse_item_id" IS NULL THEN NULL ELSE json_build_object(${objectFields.join(', ')}) END AS "warehouseItem"`)
      continue
    }

    throw createError({
      statusCode: 400,
      message: `Unsupported embedded relation "${relation.alias}:${relation.table}".`
    })
  }

  return {
    selections: selections.length ? selections.join(', ') : 't.*',
    joins: joins.join(' ')
  }
}

function preferHeader(event: H3Event) {
  return getHeader(event, 'prefer') || ''
}

function shouldReturnRepresentation(event: H3Event) {
  return preferHeader(event).includes('return=representation')
}

function shouldReturnMinimal(event: H3Event) {
  return preferHeader(event).includes('return=minimal')
}

function shouldCountExact(event: H3Event) {
  return preferHeader(event).includes('count=exact')
}

function setCountHeader(event: H3Event, count: number) {
  const range = count > 0 ? `0-${count - 1}/${count}` : '*/0'
  setHeader(event, 'content-range', range)
}

function normalizeRowsBody(body: unknown) {
  if (Array.isArray(body)) {
    return body as Array<Record<string, unknown>>
  }

  if (body && typeof body === 'object') {
    return [body as Record<string, unknown>]
  }

  throw createError({ statusCode: 400, message: 'Request body must be an object or an array.' })
}

function buildInsert(table: string, rows: Array<Record<string, unknown>>, query: Record<string, QueryValue>, event: H3Event) {
  const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row))))
  if (!columns.length) {
    throw createError({ statusCode: 400, message: 'Request body must contain at least one column.' })
  }

  for (const column of columns) {
    assertIdentifier(column, 'insert column')
  }

  const values: unknown[] = []
  const tuples = rows.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(Object.prototype.hasOwnProperty.call(row, column) ? row[column] : null)
      return `$${values.length}`
    })
    return `(${placeholders.join(', ')})`
  })

  const conflictRaw = Array.isArray(query.on_conflict) ? query.on_conflict[0] : query.on_conflict
  const conflictColumns = typeof conflictRaw === 'string' && conflictRaw.length
    ? conflictRaw.split(',').map(column => column.trim()).filter(Boolean)
    : []

  let conflictSql = ''
  if (conflictColumns.length && preferHeader(event).includes('resolution=merge-duplicates')) {
    for (const column of conflictColumns) {
      assertIdentifier(column, 'conflict column')
    }

    const updateColumns = columns.filter(column => !conflictColumns.includes(column))
    conflictSql = updateColumns.length
      ? ` ON CONFLICT (${conflictColumns.map(quoteIdentifier).join(', ')}) DO UPDATE SET ${updateColumns.map(column => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`).join(', ')}`
      : ` ON CONFLICT (${conflictColumns.map(quoteIdentifier).join(', ')}) DO NOTHING`
  }

  const returning = shouldReturnRepresentation(event) ? ' RETURNING *' : ''
  const sql = `INSERT INTO ${tableSql(table)} (${columns.map(quoteIdentifier).join(', ')}) VALUES ${tuples.join(', ')}${conflictSql}${returning}`

  return { sql, values }
}

async function handleGet(event: H3Event, table: string, query: Record<string, QueryValue>) {
  const select = parseSelect(query.select)
  const { selections, joins } = buildSelectList(table, select)
  const where = buildWhere(query)
  const order = buildOrder(query.order)
  const limit = buildLimitOffset(query, where.values.length + 1)
  const result = await postgresQuery(
    `SELECT ${selections} FROM ${tableSql(table)} AS t ${joins}${where.sql}${order}${limit.sql}`,
    [...where.values, ...limit.values]
  )

  if (shouldCountExact(event)) {
    const countResult = await postgresQuery<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${tableSql(table)} AS t ${joins}${where.sql}`,
      where.values
    )
    setCountHeader(event, Number(countResult.rows[0]?.count || 0))
  }

  return result.rows
}

async function handlePost(event: H3Event, table: string, query: Record<string, QueryValue>) {
  const rows = normalizeRowsBody(await readBody(event))
  const insert = buildInsert(table, rows, query, event)
  const result = await postgresQuery(insert.sql, insert.values)
  setResponseStatus(event, 201)

  return shouldReturnRepresentation(event) ? result.rows : []
}

async function handlePatch(event: H3Event, table: string, query: Record<string, QueryValue>) {
  const body = await readBody<Record<string, unknown>>(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, message: 'PATCH body must be an object.' })
  }

  const columns = Object.keys(body)
  if (!columns.length) {
    return []
  }

  const values: unknown[] = []
  const assignments = columns.map((column) => {
    assertIdentifier(column, 'patch column')
    values.push(body[column])
    return `${quoteIdentifier(column)} = $${values.length}`
  })
  const where = buildWhere(query, values.length + 1)
  const returning = shouldReturnRepresentation(event) ? ' RETURNING *' : ''
  const result = await postgresQuery(
    `UPDATE ${tableSql(table)} AS t SET ${assignments.join(', ')}${where.sql}${returning}`,
    [...values, ...where.values]
  )

  return shouldReturnRepresentation(event) ? result.rows : []
}

async function handleDelete(event: H3Event, table: string, query: Record<string, QueryValue>) {
  const where = buildWhere(query)
  const returning = shouldReturnRepresentation(event) ? ' RETURNING *' : ''
  const result = await postgresQuery(
    `DELETE FROM ${tableSql(table)} AS t${where.sql}${returning}`,
    where.values
  )

  if (shouldCountExact(event)) {
    setCountHeader(event, result.rowCount || 0)
  }

  if (shouldReturnMinimal(event)) {
    return null
  }

  return shouldReturnRepresentation(event) ? result.rows : []
}

function mapDatabaseError(error: unknown): never {
  const pgError = error as { code?: string, message?: string, detail?: string }
  const code = pgError?.code
  const message = pgError?.message || 'Database request failed.'
  const statusCode = code === '23505'
    ? 409
    : code === '42P01'
      ? 404
      : 400

  throw createError({
    statusCode,
    message: message,
    data: {
      code,
      message,
      detail: pgError?.detail
    }
  })
}

export default eventHandler(async (event) => {
  assertInternalApiRequest(event)

  const table = getRouterParam(event, 'table') || ''
  assertIdentifier(table, 'table')

  const query = getQuery(event) as Record<string, QueryValue>
  const method = event.node.req.method || 'GET'

  try {
    if (method === 'GET') return await handleGet(event, table, query)
    if (method === 'POST') return await handlePost(event, table, query)
    if (method === 'PATCH') return await handlePatch(event, table, query)
    if (method === 'DELETE') return await handleDelete(event, table, query)
  } catch (error) {
    mapDatabaseError(error)
  }

  throw createError({ statusCode: 405, message: `Method ${method} is not supported.` })
})
