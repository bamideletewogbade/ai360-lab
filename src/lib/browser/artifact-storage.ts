import 'server-only'
import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VisualObservationResult } from '@/lib/browser/provider'

const MAX_SCREENSHOT_BYTES = 750_000
const DEFAULT_RETENTION_HOURS = 24
let client: SupabaseClient | null = null
let bucketPromise: Promise<void> | null = null

function storageConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secret = process.env.SUPABASE_SECRET_KEY?.trim()
  const bucket = process.env.SUPABASE_PRIVATE_BUCKET?.trim()
  if (!url || !secret || !bucket) throw new Error('Private screenshot storage is not configured.')
  return { url, secret, bucket }
}

function storageClient() {
  if (client) return client
  const { url, secret } = storageConfiguration()
  client = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  return client
}

async function ensurePrivateBucket() {
  if (bucketPromise) return bucketPromise
  bucketPromise = (async () => {
    const { bucket } = storageConfiguration()
    const storage = storageClient().storage
    const existing = await storage.getBucket(bucket)
    if (!existing.error) {
      if (existing.data.public) throw new Error('Screenshot bucket must be private.')
      return
    }
    const created = await storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: MAX_SCREENSHOT_BYTES,
      allowedMimeTypes: ['image/jpeg'],
    })
    if (created.error && !/already exists|duplicate/i.test(created.error.message)) throw created.error
  })().catch((error) => {
    bucketPromise = null
    throw error
  })
  return bucketPromise
}

function retentionHours() {
  const value = Number(process.env.AI360_BROWSER_SCREENSHOT_RETENTION_HOURS || DEFAULT_RETENTION_HOURS)
  return Number.isFinite(value) ? Math.min(168, Math.max(1, Math.floor(value))) : DEFAULT_RETENTION_HOURS
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96)
}

export function validateScreenshot(screenshot: VisualObservationResult['screenshot']) {
  if (screenshot.mimeType !== 'image/jpeg') throw new Error('Unsupported screenshot type.')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(screenshot.bytesBase64)) throw new Error('Invalid screenshot encoding.')
  const bytes = Buffer.from(screenshot.bytesBase64, 'base64')
  if (!bytes.length || bytes.length > MAX_SCREENSHOT_BYTES || bytes.length !== screenshot.byteLength) {
    throw new Error('Invalid screenshot size.')
  }
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== screenshot.sha256) throw new Error('Screenshot integrity check failed.')
  return bytes
}

export async function uploadBrowserScreenshot(input: {
  workspaceKey: string
  runId: string
  actionId: string
  screenshot: VisualObservationResult['screenshot']
}) {
  await ensurePrivateBucket()
  const { bucket } = storageConfiguration()
  const bytes = validateScreenshot(input.screenshot)
  const workspace = createHash('sha256').update(input.workspaceKey).digest('hex').slice(0, 24)
  const objectPath = `browser/${workspace}/${safeSegment(input.runId)}/${safeSegment(input.actionId)}.jpg`
  const uploaded = await storageClient().storage.from(bucket).upload(objectPath, bytes, {
    contentType: 'image/jpeg',
    cacheControl: '60',
    upsert: false,
  })
  if (uploaded.error && !/already exists|duplicate/i.test(uploaded.error.message)) throw uploaded.error
  return {
    objectPath,
    byteLength: bytes.length,
    sha256: input.screenshot.sha256,
    expiresAt: new Date(Date.now() + retentionHours() * 60 * 60 * 1000).toISOString(),
  }
}

export async function downloadBrowserArtifact(objectPath: string) {
  await ensurePrivateBucket()
  const { bucket } = storageConfiguration()
  const result = await storageClient().storage.from(bucket).download(objectPath)
  if (result.error) throw result.error
  return result.data.arrayBuffer()
}

export async function removeBrowserArtifacts(paths: string[]) {
  if (!paths.length) return
  await ensurePrivateBucket()
  const { bucket } = storageConfiguration()
  const result = await storageClient().storage.from(bucket).remove(paths.slice(0, 1000))
  if (result.error) throw result.error
}
