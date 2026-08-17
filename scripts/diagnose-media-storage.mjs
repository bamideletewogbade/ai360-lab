import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import postgres from 'postgres'

/**
 * What the production runtime itself recorded about media storage.
 *
 * The image route stores the real storage exception on the job row
 * (`error_code = 'storage_failed'`), while the video route only records a
 * generic retry note — so image jobs are where production's own words about the
 * storage failure can be read back.
 *
 *   node scripts/diagnose-media-storage.mjs [envFile]
 */

const envFile = process.argv[2]
  || (existsSync('ai360-production.env') ? 'ai360-production.env' : '.env.local')
config({ path: envFile, quiet: true })
console.log(`Environment: ${envFile}\n`)

const sql = postgres(process.env.DATABASE_URL, {
  max: 1, prepare: false, ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
})

try {
  console.log('=== every asset row ever written, by kind ===')
  const assets = await sql`
    select asset_kind, count(*) as total, max(created_at) as newest
      from public.lab_assets group by asset_kind order by total desc`
  console.log(assets.length
    ? assets.map((row) => `${row.asset_kind.padEnd(12)} ${String(row.total).padStart(5)}  newest ${row.newest.toISOString()}`).join('\n')
    : 'lab_assets is completely empty — no media has ever been stored.')

  console.log('\n=== media jobs by type, status and error ===')
  const jobs = await sql`
    select media_type, status, error_code, count(*) as total
      from public.lab_media_jobs
     group by media_type, status, error_code order by media_type, total desc`
  console.log(jobs.map((row) => `${row.media_type.padEnd(6)} ${row.status.padEnd(10)} ${(row.error_code || '-').padEnd(18)} ${row.total}`).join('\n'))

  console.log('\n=== what production said when storage failed (image jobs) ===')
  const failures = await sql`
    select id, media_type, created_at, error_code, error_message
      from public.lab_media_jobs
     where error_code in ('storage_failed', 'delivery_retry')
     order by created_at desc limit 20`
  for (const failure of failures) {
    console.log(`${failure.created_at.toISOString()}  ${failure.media_type}  ${failure.error_code}: ${failure.error_message}`)
  }
  if (!failures.length) console.log('(none recorded)')
} finally {
  await sql.end()
}
