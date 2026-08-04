import postgres, { type Sql } from 'postgres'

const shared = globalThis as typeof globalThis & { ai360LabPostgres?: Sql }

export function isPostgresConfigured() {
  return Boolean(process.env.DATABASE_URL)
}

export function getPostgres() {
  if (!process.env.DATABASE_URL) throw new Error('AI360_POSTGRES_NOT_CONFIGURED')

  if (!shared.ai360LabPostgres) {
    shared.ai360LabPostgres = postgres(process.env.DATABASE_URL, {
      // This remains compatible with both Supabase session and transaction pools.
      prepare: false,
      max: Number(process.env.DATABASE_POOL_SIZE || 5),
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
      connection: {
        application_name: 'ai360-lab',
      },
    })
  }

  return shared.ai360LabPostgres
}

export async function checkPostgresConnection() {
  await getPostgres()`select 1 as ready`
}
