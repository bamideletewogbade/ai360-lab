import 'server-only'
import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getPostgres } from '@/lib/postgres'
import type { WorkspaceAuthContext } from '@/lib/workspace'
import { attachMediaOutput } from '@/lib/media/job-repository'

const MAX_MEDIA_BYTES = 100 * 1024 * 1024
const MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'])
let client: SupabaseClient | null = null

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secret = process.env.SUPABASE_SECRET_KEY?.trim()
  const bucket = process.env.SUPABASE_PRIVATE_BUCKET?.trim()
  if (!url || !secret || !bucket) throw new Error('Private media storage is not configured.')
  return { url, secret, bucket }
}

function storageClient() {
  if (client) return client
  const { url, secret } = configuration()
  client = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  return client
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96)
}

function extension(mimeType: string) {
  return mimeType === 'image/jpeg' ? 'jpg'
    : mimeType === 'image/webp' ? 'webp'
      : mimeType === 'video/webm' ? 'webm'
        : mimeType === 'video/mp4' ? 'mp4'
          : 'png'
}

export async function persistGeneratedMedia(input: {
  context: WorkspaceAuthContext
  jobId: string
  projectId?: string | null
  bytes: Uint8Array
  mimeType: string
  metadata?: Record<string, string | number | boolean | null>
}) {
  if (!MEDIA_TYPES.has(input.mimeType)) throw new Error('Unsupported generated media type.')
  if (!input.bytes.byteLength || input.bytes.byteLength > MAX_MEDIA_BYTES) throw new Error('Generated media has an invalid size.')
  const { bucket } = configuration()
  const workspaceHash = createHash('sha256').update(input.context.workspace.key).digest('hex').slice(0, 24)
  const assetId = `media_${crypto.randomUUID()}`
  const outputId = `output_${crypto.randomUUID()}`
  const objectPath = `media/${workspaceHash}/${safeSegment(input.jobId)}/${assetId}.${extension(input.mimeType)}`
  const sha256 = createHash('sha256').update(input.bytes).digest('hex')
  const uploaded = await storageClient().storage.from(bucket).upload(objectPath, input.bytes, {
    contentType: input.mimeType,
    cacheControl: '31536000',
    upsert: false,
  })
  if (uploaded.error) throw uploaded.error

  try {
    const sql = getPostgres()
    await sql`
      insert into public.lab_assets
        (id, workspace_key, owner_id, project_id, asset_kind, storage_bucket, storage_path,
         mime_type, byte_size, checksum_sha256, status, metadata)
      values (${assetId}, ${input.context.workspace.key}, ${input.context.userId}, ${input.projectId || null},
              ${input.mimeType.startsWith('video/') ? 'video' : 'image'}, ${bucket}, ${objectPath},
              ${input.mimeType}, ${input.bytes.byteLength}, ${sha256}, 'ready', ${sql.json(input.metadata || {})})`
    await attachMediaOutput({
      context: input.context,
      jobId: input.jobId,
      outputId,
      assetId,
      metadata: input.metadata,
    })
    return { assetId, objectPath, mimeType: input.mimeType, byteSize: input.bytes.byteLength, sha256 }
  } catch (error) {
    await storageClient().storage.from(bucket).remove([objectPath]).catch(() => undefined)
    throw error
  }
}

export async function downloadGeneratedMedia(context: WorkspaceAuthContext, assetId: string) {
  const sql = getPostgres()
  const [asset] = await sql<{ storage_bucket: string; storage_path: string; mime_type: string; byte_size: string }[]>`
    select storage_bucket, storage_path, mime_type, byte_size
      from public.lab_assets
     where workspace_key = ${context.workspace.key} and id = ${assetId.slice(0, 96)}
       and status = 'ready' and deleted_at is null`
  if (!asset) return null
  const downloaded = await storageClient().storage.from(asset.storage_bucket).download(asset.storage_path)
  if (downloaded.error) throw downloaded.error
  return { bytes: await downloaded.data.arrayBuffer(), mimeType: asset.mime_type, byteSize: Number(asset.byte_size) }
}
