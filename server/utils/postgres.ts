import pg from 'pg'
import type { Pool as PoolType, PoolClient, QueryResultRow } from 'pg'

const { Pool } = pg

let pool: PoolType | null = null
let poolSignature = ''

function readDatabaseConfig() {
  const config = useRuntimeConfig()
  const database = config.database || {}

  const connectionString = typeof database.url === 'string' && database.url.length
    ? database.url
    : process.env.DATABASE_URL

  const host = typeof database.host === 'string' && database.host.length
    ? database.host
    : process.env.POSTGRES_HOST

  const portRaw = database.port || process.env.POSTGRES_PORT || '5432'
  const port = typeof portRaw === 'number' ? portRaw : Number(portRaw)

  const databaseName = typeof database.name === 'string' && database.name.length
    ? database.name
    : process.env.POSTGRES_DATABASE

  const user = typeof database.user === 'string' && database.user.length
    ? database.user
    : process.env.POSTGRES_USER

  const password = typeof database.password === 'string'
    ? database.password
    : process.env.POSTGRES_PASSWORD

  const sslMode = typeof database.ssl === 'string' && database.ssl.length
    ? database.ssl
    : process.env.POSTGRES_SSL

  if (connectionString) {
    return {
      connectionString,
      ssl: sslMode === 'true' || sslMode === 'require' ? { rejectUnauthorized: false } : undefined
    }
  }

  const missing = [
    ['POSTGRES_HOST', host],
    ['POSTGRES_DATABASE', databaseName],
    ['POSTGRES_USER', user]
  ].filter(([, value]) => typeof value !== 'string' || !value.length)

  if (missing.length) {
    throw createError({
      statusCode: 500,
      message: `${missing.map(([name]) => name).join(', ')} must be configured.`
    })
  }

  if (!Number.isInteger(port) || port <= 0) {
    throw createError({
      statusCode: 500,
      message: 'POSTGRES_PORT must be a positive integer.'
    })
  }

  return {
    host,
    port,
    database: databaseName,
    user,
    password: password || undefined,
    ssl: sslMode === 'true' || sslMode === 'require' ? { rejectUnauthorized: false } : undefined
  }
}

function getPool() {
  const config = readDatabaseConfig()
  const signature = JSON.stringify(config)

  if (pool && poolSignature === signature) {
    return pool
  }

  if (pool) {
    void pool.end()
  }

  pool = new Pool({
    ...config,
    max: Number(process.env.POSTGRES_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  })
  poolSignature = signature

  return pool
}

export async function postgresQuery<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return await getPool().query<T>(text, values)
}

export async function withPostgresTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect()

  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')

    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function testPostgresConnection() {
  const result = await postgresQuery<{ ok: number }>('select 1 as ok')

  return result.rows[0]?.ok === 1
}
