import { config } from 'dotenv'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'

/**
 * Replays the delivery stage of a stuck video job — download the finished clip,
 * upload it, then write the asset/output rows — and rolls the database work
 * back at the end. The point is to surface the real exception that production
 * only records as "the finished clip could not be saved yet".
 *
 *   node scripts/diagnose-video-delivery.mjs [envFile] [--commit]
 */

const args = process.argv.slice(2)
const commit = args.includes('--commit')
const envFile = args.find((arg) => !arg.startsWith('--'))
  || (existsSync('ai360-production.env') ? 'ai360-production.env' : '.env.local')
config({ path: envFile, quiet: true })
console.log(`Environment: ${envFile}   mode: ${commit ? 'COMMIT' : 'dry run (rolled back)'}\n`)

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
})
const bucket = process.env.SUPABASE_PRIVATE_BUCKET.trim()
const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SECRET_KEY.trim(), {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

class Rollback extends Error {}

try {
  const [job] = await sql`
    select id, workspace_key, owner_id, project_id, intent, provider_job_id, status
      from public.lab_media_jobs
     where media_type = 'video' and provider_job_id is not null
       and not exists (select 1 from public.lab_media_outputs o
                        where o.workspace_key = lab_media_jobs.workspace_key and o.job_id = lab_media_jobs.id)
     order by created_at desc limit 1`
  if (!job) throw new Error('No undelivered video job to replay.')
  console.log(`Job ${job.id}  status=${job.status}  provider=${job.provider_job_id}`)

  const [owner] = await sql`select clerk_user_id from public.lab_users where clerk_user_id = ${job.owner_id}`
  console.log(`owner row present: ${Boolean(owner)}`)
  const [workspace] = await sql`select workspace_key from public.lab_workspaces where workspace_key = ${job.workspace_key}`
  console.log(`workspace row present: ${Boolean(workspace)}\n`)

  console.log('--- stage A: download from provider ---')
  const status = await fetch(`https://openrouter.ai/api/v1/videos/${encodeURIComponent(job.provider_job_id)}`, {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    signal: AbortSignal.timeout(30_000),
  })
  const statusBody = await status.json()
  console.log(`status ${status.status} -> ${statusBody.status}`)

  let bytes
  let mimeType
  try {
    const response = await fetch(`https://openrouter.ai/api/v1/videos/${encodeURIComponent(job.provider_job_id)}/content?index=0`, {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(120_000),
    })
    console.log(`/content?index=0 -> HTTP ${response.status} content-type=${response.headers.get('content-type')}`)
    if (!response.ok) throw new Error(`Video download returned ${response.status}`)
    bytes = new Uint8Array(await response.arrayBuffer())
    mimeType = response.headers.get('content-type')?.split(';')[0] || 'video/mp4'
  } catch (primary) {
    console.log(`primary download failed: ${primary.message}`)
    for (const url of statusBody.unsigned_urls || []) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
        console.log(`fallback url -> HTTP ${response.status} content-type=${response.headers.get('content-type')}`)
        if (!response.ok) continue
        bytes = new Uint8Array(await response.arrayBuffer())
        mimeType = response.headers.get('content-type')?.split(';')[0] || 'video/mp4'
        break
      } catch (fallbackError) {
        console.log(`fallback failed: ${fallbackError.message}`)
      }
    }
  }
  if (!bytes) throw new Error('DELIVERY FAILS AT STAGE A: the clip could not be downloaded at all.')
  console.log(`downloaded ${bytes.byteLength} bytes as ${mimeType}\n`)

  console.log('--- stage B: guards in persistGeneratedMedia ---')
  const MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'])
  console.log(`mime accepted: ${MEDIA_TYPES.has(mimeType)}`)
  console.log(`size accepted: ${Boolean(bytes.byteLength) && bytes.byteLength <= 100 * 1024 * 1024}`)
  if (!MEDIA_TYPES.has(mimeType)) throw new Error(`DELIVERY FAILS AT STAGE B: unsupported generated media type "${mimeType}".`)

  console.log('\n--- stage C: upload to private storage ---')
  const workspaceHash = createHash('sha256').update(job.workspace_key).digest('hex').slice(0, 24)
  const assetId = `media_${crypto.randomUUID()}`
  const outputId = `output_${crypto.randomUUID()}`
  const objectPath = `media/${workspaceHash}/${job.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96)}/${assetId}.mp4`
  const uploaded = await storage.storage.from(bucket).upload(objectPath, bytes, {
    contentType: mimeType, cacheControl: '31536000', upsert: false,
  })
  if (uploaded.error) throw new Error(`DELIVERY FAILS AT STAGE C: ${uploaded.error.message}`)
  console.log(`uploaded to ${bucket}/${objectPath}`)

  console.log('\n--- stage D: database rows ---')
  try {
    await sql.begin(async (tx) => {
      const [locked] = await tx`select id from public.lab_media_jobs
         where workspace_key = ${job.workspace_key} and id = ${job.id} for update`
      if (!locked) throw new Error('MEDIA_JOB_NOT_FOUND')
      const [version] = await tx`select coalesce(max(version), 0) + 1 as next_version
          from public.lab_media_outputs
         where workspace_key = ${job.workspace_key} and job_id = ${job.id}`
      await tx`
        insert into public.lab_assets
          (id, workspace_key, owner_id, project_id, asset_kind, storage_bucket, storage_path,
           mime_type, byte_size, checksum_sha256, status, metadata)
        values (${assetId}, ${job.workspace_key}, ${job.owner_id}, ${job.project_id || null},
                'video', ${bucket}, ${objectPath}, ${mimeType}, ${bytes.byteLength},
                ${createHash('sha256').update(bytes).digest('hex')}, 'ready', ${tx.json({ model: 'google/veo-3.1-fast' })})`
      await tx`
        insert into public.lab_media_outputs
          (id, workspace_key, job_id, asset_id, version, selected, metadata)
        values (${outputId}, ${job.workspace_key}, ${job.id}, ${assetId},
                ${Number(version?.next_version || 1)}, true, ${tx.json({})})`
      await tx`
        update public.lab_media_jobs
           set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
         where workspace_key = ${job.workspace_key} and id = ${job.id}`
      console.log('all rows written')
      if (!commit) throw new Rollback('rolled back')
    })
    console.log(commit ? 'COMMITTED — the clip is now delivered.' : 'unexpected: dry run committed')
  } catch (error) {
    if (error instanceof Rollback) {
      console.log('database stage succeeds (rolled back, nothing persisted)')
    } else {
      console.log(`DELIVERY FAILS AT STAGE D: ${error.constructor.name}: ${error.message}`)
      if (error.code) console.log(`  pg code=${error.code} constraint=${error.constraint_name || '-'} detail=${error.detail || '-'}`)
    }
  }
  if (!commit) {
    await storage.storage.from(bucket).remove([objectPath])
    console.log('probe object removed')
  }
} catch (error) {
  console.log(`\n${error.message}`)
  if (error.code) console.log(`  pg code=${error.code} detail=${error.detail || '-'}`)
} finally {
  await sql.end()
}
