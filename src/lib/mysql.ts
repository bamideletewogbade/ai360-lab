import mysql, { type Pool, type PoolConnection } from 'mysql2/promise'

const globalForMySql = globalThis as typeof globalThis & { ai360LabMySqlPool?: Pool }

export function isDatabaseConfigured() {
  return Boolean(
    process.env.MYSQL_HOST &&
      process.env.MYSQL_DATABASE &&
      process.env.MYSQL_USER &&
      process.env.MYSQL_PASSWORD,
  )
}

export function getMySqlPool() {
  if (!isDatabaseConfigured()) {
    throw new Error('AI360_DATABASE_NOT_CONFIGURED')
  }

  if (!globalForMySql.ai360LabMySqlPool) {
    globalForMySql.ai360LabMySqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      database: process.env.MYSQL_DATABASE,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      connectionLimit: 5,
      maxIdle: 5,
      idleTimeout: 60_000,
      enableKeepAlive: true,
      charset: 'utf8mb4',
      dateStrings: true,
    })
  }

  return globalForMySql.ai360LabMySqlPool
}

export async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>) {
  const connection = await getMySqlPool().getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
