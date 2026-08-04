import { config } from 'dotenv'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import postgres from 'postgres'

// Next.js reads .env.local automatically; a plain Node script does not.
config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!connectionString) throw new Error('Missing DIRECT_URL or DATABASE_URL')

const sql = postgres(connectionString, {
  max: 1,
  prepare: false,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
})

try {
  await sql.unsafe(`
    create schema if not exists private;
    create table if not exists private.lab_schema_migrations (
      migration_name text primary key,
      checksum_sha256 text not null check (char_length(checksum_sha256) = 64),
      applied_at timestamptz not null default now()
    );
    revoke all on private.lab_schema_migrations from public;
  `)

  const migrationDirectory = new URL('../database/postgres/', import.meta.url)
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right))

  for (const migrationFile of migrationFiles) {
    const migration = await readFile(new URL(migrationFile, migrationDirectory), 'utf8')
    const checksum = createHash('sha256').update(migration).digest('hex')
    const [applied] = await sql`
      select checksum_sha256
      from private.lab_schema_migrations
      where migration_name = ${migrationFile}
    `

    if (applied) {
      if (applied.checksum_sha256 !== checksum) {
        throw new Error(`Applied migration ${migrationFile} has changed. Create a new migration instead.`)
      }
      console.log(`Skipped ${migrationFile} (already applied)`)
      continue
    }

    await sql.unsafe(migration)
    await sql`
      insert into private.lab_schema_migrations (migration_name, checksum_sha256)
      values (${migrationFile}, ${checksum})
    `
    console.log(`Applied ${migrationFile}`)
  }
  console.log('AI 360 Lab Postgres schema is ready.')
} finally {
  await sql.end()
}
