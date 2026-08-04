import { config } from 'dotenv'
import postgres from 'postgres'

// Next.js reads .env.local automatically; a plain Node script does not.
config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!connectionString) throw new Error('Missing DIRECT_URL or DATABASE_URL')

const sql = postgres(connectionString, { max: 1, prepare: false, ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require' })
const failures = []

try {
  const tables = await sql`
    select c.relname as table_name, c.relrowsecurity as rls,
           (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname`

  console.log('TABLE                                 RLS   POLICIES')
  for (const table of tables) {
    console.log(table.table_name.padEnd(37), (table.rls ? 'on' : 'OFF').padEnd(5), table.policies)
  }
  console.log(`\n${tables.length} tables`)

  if (!tables.length) failures.push('no tables found; run npm run db:postgres:migrate first')
  const unprotected = tables.filter((table) => !table.rls).map((table) => table.table_name)
  if (unprotected.length) failures.push(`row-level security is off: ${unprotected.join(', ')}`)

  // The browser-facing anon role must never reach application data directly.
  const anonGrants = await sql`
    select table_name, string_agg(distinct privilege_type, ',') as privileges
      from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public'
     group by table_name order by table_name`
  console.log(`\nanon role grants: ${anonGrants.length ? anonGrants.map((row) => `${row.table_name}=${row.privileges}`).join('; ') : 'none'}`)
  if (anonGrants.length) failures.push(`anon role can reach ${anonGrants.length} table(s)`)

  const applied = await sql`select migration_name, applied_at from private.lab_schema_migrations order by migration_name`
  console.log('\nmigrations applied:')
  for (const migration of applied) console.log(`  ${migration.migration_name}  ${migration.applied_at.toISOString()}`)
  if (!applied.length) failures.push('no migrations recorded')

  console.log(`\nextensions: ${(await sql`select extname from pg_extension order by extname`).map((row) => row.extname).join(', ')}`)
} finally {
  await sql.end()
}

if (failures.length) {
  console.error('\nFAILED:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exitCode = 1
} else {
  console.log('\nPostgres schema, row-level security and role grants verified.')
}
