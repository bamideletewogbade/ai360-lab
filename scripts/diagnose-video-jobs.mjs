import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'

/**
 * Read-only diagnosis for "the clip renders at the provider but Studio stays on
 * Rendering…".
 *
 * A video only reaches the person after three separate stages succeed, in three
 * different requests: the provider finishes, the file downloads, the file is
 * stored. This prints the state of all three so the failing one is obvious
 * instead of inferred. Nothing here writes application data; the only write is
 * a throwaway object used to prove the private bucket accepts uploads, and it
 * is removed again.
 *
 *   node scripts/diagnose-video-jobs.mjs            # production env file
 *   node scripts/diagnose-video-jobs.mjs .env.local # a specific env file
 */

const envFile = process.argv[2]
  || (existsSync('ai360-production.env') ? 'ai360-production.env' : '.env.local')
config({ path: envFile, quiet: true })
console.log(`Environment: ${envFile}\n`)

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
})

const line = (title) => console.log(`\n=== ${title} ===`)

try {
  line('1. Durable video jobs (most recent 15)')
  const jobs = await sql`
    select job.id, job.status, job.model, job.provider_job_id, job.error_code,
           job.error_message, job.quoted_cost_usd, job.actual_cost_usd,
           job.reservation_id, job.created_at, job.completed_at,
           output.asset_id
      from public.lab_media_jobs job
      left join lateral (
        select asset_id from public.lab_media_outputs
         where workspace_key = job.workspace_key and job_id = job.id
         order by version desc limit 1
      ) output on true
     where job.media_type = 'video'
     order by job.created_at desc
     limit 15`
  for (const job of jobs) {
    console.log([
      job.created_at.toISOString(),
      job.status.padEnd(9),
      (job.model || '-').padEnd(22),
      `provider=${job.provider_job_id || '-'}`,
      `asset=${job.asset_id || 'NONE'}`,
      `error=${job.error_code || '-'}`,
      job.error_message ? `(${job.error_message})` : '',
    ].join('  '))
  }
  if (!jobs.length) console.log('No video jobs recorded — the durable job store is not being written at all.')

  line('2. Stored assets for those jobs')
  const assets = await sql`
    select id, mime_type, byte_size, storage_bucket, storage_path, status, created_at
      from public.lab_assets
     where asset_kind = 'video'
     order by created_at desc limit 10`
  for (const asset of assets) {
    console.log(`${asset.created_at.toISOString()}  ${asset.status}  ${asset.mime_type}  ${asset.byte_size} bytes  ${asset.storage_bucket}/${asset.storage_path}`)
  }
  if (!assets.length) console.log('No video asset rows — delivery (download + upload) has never completed.')

  line('3. Credit holds still open on video jobs')
  const holds = await sql`
    select r.id, r.status, r.credits, r.settled_credits, r.created_at, r.expires_at
      from public.lab_credit_reservations r
     where r.id in (select reservation_id from public.lab_media_jobs
                     where media_type = 'video' and reservation_id is not null)
     order by r.created_at desc limit 10`
  for (const hold of holds) {
    console.log(`${hold.created_at.toISOString()}  ${hold.status.padEnd(8)} held=${hold.credits} settled=${hold.settled_credits ?? '-'} expires=${hold.expires_at?.toISOString?.() || '-'}`)
  }

  line('4. Provider status for the newest unfinished job')
  const [pending] = jobs.filter((job) => job.provider_job_id && job.status !== 'completed')
  if (!pending) {
    console.log('No unfinished job with a provider id to re-check.')
  } else if (!process.env.OPENROUTER_API_KEY) {
    console.log('OPENROUTER_API_KEY is not in this env file; skipped.')
  } else {
    const response = await fetch(`https://openrouter.ai/api/v1/videos/${encodeURIComponent(pending.provider_job_id)}`, {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(30_000),
    })
    const payload = await response.json().catch(() => ({}))
    console.log(`job ${pending.id} -> HTTP ${response.status}`)
    console.log(`provider status: ${payload.status}`)
    console.log(`top-level keys: ${Object.keys(payload).join(', ')}`)
    console.log(`unsigned_urls: ${Array.isArray(payload.unsigned_urls) ? `${payload.unsigned_urls.length} url(s)` : 'absent'}`)
    if (payload.error) console.log(`provider error: ${JSON.stringify(payload.error).slice(0, 300)}`)

    // This is the exact call the status handler makes to fetch the clip.
    const content = await fetch(`https://openrouter.ai/api/v1/videos/${encodeURIComponent(pending.provider_job_id)}/content?index=0`, {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      method: 'HEAD',
      signal: AbortSignal.timeout(60_000),
    }).catch((error) => ({ ok: false, status: 0, headers: new Headers(), statusText: error.message }))
    console.log(`/content?index=0 -> HTTP ${content.status} ${content.ok ? '' : content.statusText || ''} content-type=${content.headers?.get?.('content-type') || '-'} length=${content.headers?.get?.('content-length') || '-'}`)
  }

  line('5. Private media storage (the last delivery stage)')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secret = process.env.SUPABASE_SECRET_KEY?.trim()
  const bucket = process.env.SUPABASE_PRIVATE_BUCKET?.trim()
  console.log(`url=${url ? 'set' : 'MISSING'} secret=${secret ? 'set' : 'MISSING'} bucket=${bucket || 'MISSING'}`)
  if (url && secret && bucket) {
    const storage = createClient(url, secret, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
    const buckets = await storage.storage.listBuckets()
    console.log(buckets.error
      ? `listBuckets failed: ${buckets.error.message}`
      : `buckets visible: ${buckets.data.map((entry) => entry.name).join(', ') || '(none)'}`)
    const probePath = `media/_diagnostic/${Date.now()}.mp4`
    const upload = await storage.storage.from(bucket).upload(probePath, new Uint8Array([0, 0, 0, 1]), {
      contentType: 'video/mp4', upsert: false,
    })
    console.log(upload.error
      ? `UPLOAD FAILED: ${upload.error.message}`
      : `upload to ${bucket} works (${probePath})`)
    if (!upload.error) await storage.storage.from(bucket).remove([probePath])
  }
} finally {
  await sql.end()
}
