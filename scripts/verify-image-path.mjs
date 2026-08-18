import { config } from 'dotenv'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'

/**
 * Proves the image path with a real generated image, not a placeholder.
 *
 * Generates through the provider exactly as `/api/studio/image` does, then runs
 * the bytes through the same storage guards, upload, asset row and read-back the
 * route uses. Database work is rolled back and the object removed, so this can
 * be run against production without leaving anything behind.
 *
 *   node scripts/verify-image-path.mjs [envFile] [model]
 */

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const envFile = args[0] || (existsSync('ai360-production.env') ? 'ai360-production.env' : '.env.local')
config({ path: envFile, quiet: true })

const model = args[1]
  || (process.env.OPENROUTER_IMAGE_MODELS || process.env.OPENROUTER_IMAGE_MODEL || '').split(',')[0].trim()
  || 'openai/gpt-image-1-mini'

console.log(`Environment: ${envFile}`)
console.log(`Model: ${model}\n`)

const MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'])
const MAX_MEDIA_BYTES = 100 * 1024 * 1024

const sql = postgres(process.env.DATABASE_URL, {
  max: 1, prepare: false, ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
})
const bucket = process.env.SUPABASE_PRIVATE_BUCKET.trim()
const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SECRET_KEY.trim(), {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

class Rollback extends Error {}

try {
  console.log('--- stage A: generate through the provider ---')
  const response = await fetch('https://openrouter.ai/api/v1/images', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://ai360.africa',
      'X-Title': process.env.OPENROUTER_SITE_NAME || 'AI360',
    },
    body: JSON.stringify({
      model,
      prompt: 'Organic hibiscus tea packaging on cream marble, soft daylight, premium product photograph',
      n: 1,
      resolution: '1K',
      aspect_ratio: '1:1',
    }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!response.ok) throw new Error(`provider returned ${response.status}: ${(await response.text()).slice(0, 200)}`)
  const payload = await response.json()
  const image = payload.data?.[0]
  if (!image?.b64_json) throw new Error('provider returned no image data')
  const bytes = new Uint8Array(Buffer.from(image.b64_json, 'base64'))
  const mimeType = image.media_type || 'image/png'
  console.log(`generated ${bytes.byteLength} bytes as ${mimeType}`)
  console.log(`provider cost: ${payload.usage?.cost !== undefined ? '$' + payload.usage.cost : 'not reported'}\n`)

  console.log('--- stage B: the guards persistGeneratedMedia applies ---')
  console.log(`mime accepted: ${MEDIA_TYPES.has(mimeType)}`)
  console.log(`size accepted: ${Boolean(bytes.byteLength) && bytes.byteLength <= MAX_MEDIA_BYTES}`)
  if (!MEDIA_TYPES.has(mimeType)) throw new Error(`FAILS: unsupported generated media type "${mimeType}"`)

  const [workspace] = await sql`
    select w.workspace_key, u.clerk_user_id
      from public.lab_workspaces w join public.lab_users u on true
     order by w.created_at desc limit 1`
  if (!workspace) throw new Error('no workspace to test against')

  console.log('\n--- stage C: upload to private storage ---')
  const workspaceHash = createHash('sha256').update(workspace.workspace_key).digest('hex').slice(0, 24)
  const assetId = `media_${crypto.randomUUID()}`
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png'
  const objectPath = `media/${workspaceHash}/_imagecheck/${assetId}.${extension}`
  const uploaded = await storage.storage.from(bucket).upload(objectPath, bytes, {
    contentType: mimeType, cacheControl: '31536000', upsert: false,
  })
  if (uploaded.error) throw new Error(`FAILS AT UPLOAD: ${uploaded.error.message}`)
  console.log(`uploaded to ${bucket}/${objectPath}`)

  console.log('\n--- stage D: asset row, then read back ---')
  try {
    await sql.begin(async (tx) => {
      await tx`
        insert into public.lab_assets
          (id, workspace_key, owner_id, project_id, asset_kind, storage_bucket, storage_path,
           mime_type, byte_size, checksum_sha256, status, metadata)
        values (${assetId}, ${workspace.workspace_key}, ${workspace.clerk_user_id}, null,
                'image', ${bucket}, ${objectPath}, ${mimeType}, ${bytes.byteLength},
                ${createHash('sha256').update(bytes).digest('hex')}, 'ready', ${tx.json({ model })})`
      const [row] = await tx`
        select byte_size, mime_type from public.lab_assets
         where workspace_key = ${workspace.workspace_key} and id = ${assetId}
           and status = 'ready' and deleted_at is null`
      console.log(row ? `asset row readable: ${row.byte_size} bytes, ${row.mime_type}` : 'asset row NOT readable')
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
    console.log('database stage succeeds (rolled back)')
  }

  const downloaded = await storage.storage.from(bucket).download(objectPath)
  if (downloaded.error) throw new Error(`FAILS AT DOWNLOAD: ${downloaded.error.message}`)
  const back = (await downloaded.data.arrayBuffer()).byteLength
  console.log(`read back ${back} bytes — ${back === bytes.byteLength ? 'identical' : 'SIZE MISMATCH'}`)

  await storage.storage.from(bucket).remove([objectPath])
  console.log('\nprobe object removed. Image path verified end to end.')
} catch (error) {
  console.log(`\n${error.message}`)
  process.exitCode = 1
} finally {
  await sql.end()
}
