import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getPostgres } from '@/lib/postgres'
import type { WorkspaceAuthContext } from '@/lib/workspace'
import { EXPORT_MIME, type ExportFormat } from '@/lib/export/render'

/**
 * Durable storage for documents the assistant produces.
 *
 * Deliberately a sibling of the media pipeline rather than a branch of it. That
 * one requires a media job row and updates it on success, which is right for a
 * paid render with a provider behind it and wrong for a file generated inline
 * from text we already have. Both write to `lab_assets`, so a document and an
 * image are the same kind of thing to everything downstream.
 *
 * A stored document is what makes an assistant-generated file worth more than a
 * browser download: it survives a refresh, a flat battery and a change of
 * device, which on these connections is the difference between having the file
 * and having had it.
 */

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
const DOCUMENT_MIMES = new Set<string>(Object.values(EXPORT_MIME))
let client: SupabaseClient | null = null

export class DocumentStoreNotConfiguredError extends Error {
  constructor() {
    super('Private document storage is not configured.')
    this.name = 'DocumentStoreNotConfiguredError'
  }
}

export function isDocumentStoreConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && process.env.SUPABASE_SECRET_KEY?.trim()
    && process.env.SUPABASE_PRIVATE_BUCKET?.trim(),
  )
}

function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secret = process.env.SUPABASE_SECRET_KEY?.trim()
  const bucket = process.env.SUPABASE_PRIVATE_BUCKET?.trim()
  if (!url || !secret || !bucket) throw new DocumentStoreNotConfiguredError()
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

export type StoredDocument = {
  assetId: string
  filename: string
  mimeType: string
  byteSize: number
  format: ExportFormat
}

export async function persistGeneratedDocument(input: {
  context: WorkspaceAuthContext
  bytes: Buffer
  mimeType: string
  filename: string
  format: ExportFormat
  conversationId?: string | null
  projectId?: string | null
  metadata?: Record<string, string | number | boolean | null>
}): Promise<StoredDocument> {
  if (!DOCUMENT_MIMES.has(input.mimeType)) throw new Error('Unsupported generated document type.')
  if (!input.bytes.byteLength || input.bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error('Generated document has an invalid size.')
  }
  const { bucket } = configuration()
  const workspaceHash = createHash('sha256').update(input.context.workspace.key).digest('hex').slice(0, 24)
  const assetId = `doc_${randomUUID()}`
  const objectPath = `documents/${workspaceHash}/${assetId}.${input.format}`
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
        (id, workspace_key, owner_id, project_id, conversation_id, asset_kind, storage_bucket,
         storage_path, mime_type, byte_size, checksum_sha256, status, metadata)
      values (${assetId}, ${input.context.workspace.key}, ${input.context.userId},
              (select project.id from public.lab_studio_projects project
                where project.workspace_key = ${input.context.workspace.key}
                  and project.id = ${input.projectId || null}),
              ${input.conversationId || null}, 'document', ${bucket},
              ${objectPath}, ${input.mimeType}, ${input.bytes.byteLength}, ${sha256}, 'ready',
              ${sql.json({ filename: input.filename, format: input.format, ...(input.metadata || {}) })})`
    return {
      assetId,
      filename: input.filename,
      mimeType: input.mimeType,
      byteSize: input.bytes.byteLength,
      format: input.format,
    }
  } catch (error) {
    // Never leave an object behind that no row points at.
    await storageClient().storage.from(bucket).remove([objectPath]).catch(() => undefined)
    throw error
  }
}

export type GeneratedDocumentSummary = {
  assetId: string
  filename: string
  format: ExportFormat
  mimeType: string
  byteSize: number
  createdAt: string
  projectId: string | null
  conversationId: string | null
}

/** Every document the assistant has produced for this workspace, newest first — the Library's document source. */
export async function listGeneratedDocuments(context: WorkspaceAuthContext, limit = 100): Promise<GeneratedDocumentSummary[]> {
  const sql = getPostgres()
  const rows = await sql<{
    id: string; project_id: string | null; conversation_id: string | null
    mime_type: string; byte_size: string; metadata: { filename?: string; format?: string }; created_at: string
  }[]>`
    select id, project_id, conversation_id, mime_type, byte_size, metadata, created_at
      from public.lab_assets
     where workspace_key = ${context.workspace.key} and asset_kind = 'document'
       and status = 'ready' and deleted_at is null
     order by created_at desc limit ${Math.min(200, Math.max(1, limit))}`
  return rows.map((row) => ({
    assetId: row.id,
    filename: row.metadata?.filename || 'ai360-document',
    format: (row.metadata?.format as ExportFormat) || 'pdf',
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    createdAt: row.created_at,
    projectId: row.project_id,
    conversationId: row.conversation_id,
  }))
}

export async function readGeneratedDocument(context: WorkspaceAuthContext, assetId: string) {
  const sql = getPostgres()
  const [asset] = await sql<{
    storage_bucket: string; storage_path: string; mime_type: string; byte_size: string; metadata: { filename?: string }
  }[]>`
    select storage_bucket, storage_path, mime_type, byte_size, metadata
      from public.lab_assets
     where workspace_key = ${context.workspace.key} and id = ${safeSegment(assetId)}
       and asset_kind = 'document' and status = 'ready' and deleted_at is null`
  if (!asset) return null
  const downloaded = await storageClient().storage.from(asset.storage_bucket).download(asset.storage_path)
  if (downloaded.error) throw downloaded.error
  return {
    bytes: await downloaded.data.arrayBuffer(),
    mimeType: asset.mime_type,
    byteSize: Number(asset.byte_size),
    filename: asset.metadata?.filename || `ai360-document`,
  }
}
