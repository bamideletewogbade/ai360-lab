import { config } from 'dotenv'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'

/**
 * Proves that a generated image and a generated video can actually be stored
 * and read back: upload to the private bucket, write the asset row, download it
 * again through the same path `/api/studio/media?assetId=` uses, then clean up.
 *
 * Database work is rolled back and the objects are removed, so this can be run
 * against production without leaving anything behind.
 *
 *   node scripts/verify-media-roundtrip.mjs [envFile]
 */

const envFile = process.argv[2]
  || (existsSync('ai360-production.env') ? 'ai360-production.env' : '.env.local')
config({ path: envFile, quiet: true })
console.log(`Environment: ${envFile}\n`)

const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_PRIVATE_BUCKET']
  .filter((name) => !process.env[name]?.trim())
if (missing.length) {
  console.log(`Private media storage is not configured here: ${missing.join(', ')} missing.`)
  process.exit(1)
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 1, prepare: false, ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
})
const bucket = process.env.SUPABASE_PRIVATE_BUCKET.trim()
const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SECRET_KEY.trim(), {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

// A one-pixel PNG and a minimal MP4 header: enough to exercise every guard the
// real path applies (mime allowlist, size check, checksum, row constraints)
// without spending a generation.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const MP4 = Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQ==', 'base64')

class Rollback extends Error {}

try {
  const [workspace] = await sql`
    select w.workspace_key, u.clerk_user_id
      from public.lab_workspaces w
      join public.lab_users u on true
     order by w.created_at desc limit 1`
  if (!workspace) throw new Error('No workspace to test against.')
  console.log(`Testing as workspace ${workspace.workspace_key}\n`)

  for (const media of [
    { kind: 'image', mimeType: 'image/png', extension: 'png', bytes: new Uint8Array(PNG) },
    { kind: 'video', mimeType: 'video/mp4', extension: 'mp4', bytes: new Uint8Array(MP4) },
  ]) {
    console.log(`--- ${media.kind} (${media.mimeType}) ---`)
    const workspaceHash = createHash('sha256').update(workspace.workspace_key).digest('hex').slice(0, 24)
    const assetId = `media_${crypto.randomUUID()}`
    const objectPath = `media/${workspaceHash}/_roundtrip/${assetId}.${media.extension}`

    const uploaded = await storage.storage.from(bucket).upload(objectPath, media.bytes, {
      contentType: media.mimeType, cacheControl: '31536000', upsert: false,
    })
    console.log(uploaded.error ? `  upload FAILED: ${uploaded.error.message}` : '  upload ok')
    if (uploaded.error) continue

    try {
      await sql.begin(async (tx) => {
        await tx`
          insert into public.lab_assets
            (id, workspace_key, owner_id, project_id, asset_kind, storage_bucket, storage_path,
             mime_type, byte_size, checksum_sha256, status, metadata)
          values (${assetId}, ${workspace.workspace_key}, ${workspace.clerk_user_id}, null,
                  ${media.kind}, ${bucket}, ${objectPath}, ${media.mimeType}, ${media.bytes.byteLength},
                  ${createHash('sha256').update(media.bytes).digest('hex')}, 'ready', ${tx.json({ roundtrip: true })})`
        const [row] = await tx`
          select storage_bucket, storage_path, mime_type, byte_size
            from public.lab_assets
           where workspace_key = ${workspace.workspace_key} and id = ${assetId}
             and status = 'ready' and deleted_at is null`
        console.log(row ? '  asset row written and readable' : '  asset row NOT readable')
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) {
        console.log(`  database FAILED: ${error.message}${error.code ? ` (pg ${error.code})` : ''}`)
      }
    }

    const downloaded = await storage.storage.from(bucket).download(objectPath)
    console.log(downloaded.error
      ? `  download FAILED: ${downloaded.error.message}`
      : `  download ok (${(await downloaded.data.arrayBuffer()).byteLength} bytes)`)

    await storage.storage.from(bucket).remove([objectPath])
    console.log('  cleaned up')
  }

  console.log('\nStored media already in production:')
  const stored = await sql`
    select asset_kind, count(*) as total from public.lab_assets group by asset_kind`
  console.log(stored.length
    ? stored.map((row) => `  ${row.asset_kind}: ${row.total}`).join('\n')
    : '  none yet')
} finally {
  await sql.end()
}
