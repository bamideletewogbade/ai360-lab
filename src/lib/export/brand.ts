import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import { ensureWorkspaceRecord } from '@/lib/workspace-db'
import type { WorkspaceAuthContext } from '@/lib/workspace'
import { normalizeHex, type DocumentBrand } from '@/lib/export/color'
import { readImageDimensions } from '@/lib/export/image-dimensions'

export type { DocumentBrand }

/** Applied when a logo is set but no colours are — every builder already has this look, so it's simply named here rather than left implicit. */
const DEFAULT_BRAND_COLORS: DocumentBrand = { primary: '#101112', accent: '#56595C' }

type ProjectBrandColor = { name?: unknown; hex?: unknown; role?: unknown }

/**
 * Picks a primary and accent out of a Studio project's free-form brand
 * colours (`{ name, hex, role }`, role is model-written text, not an enum).
 * Prefers an entry whose role names it; falls back to array order, which is
 * also how the coordinator that generates them is prompted to lead with the
 * most important colour first.
 */
export function brandFromProjectColors(colors: unknown): DocumentBrand | null {
  if (!Array.isArray(colors)) return null
  const entries = colors.filter((entry): entry is ProjectBrandColor => Boolean(entry) && typeof entry === 'object')
  const byRole = (needle: string) => entries.find((entry) => typeof entry.role === 'string' && entry.role.toLowerCase().includes(needle))

  const primaryEntry = byRole('primary') || entries[0]
  const primary = primaryEntry ? normalizeHex(primaryEntry.hex) : null
  if (!primary) return null

  const accentEntry = byRole('accent') || entries.find((entry) => entry !== primaryEntry)
  const accent = (accentEntry && normalizeHex(accentEntry.hex)) || primary
  return { primary, accent }
}

export function isDocumentBrandKitConfigured() {
  return isPostgresConfigured()
}

/** The saved workspace-level kit, or null if none has been set. */
export async function readBrandKit(workspaceKey: string): Promise<DocumentBrand | null> {
  if (!isPostgresConfigured()) return null
  const [row] = await getPostgres()<{ primary_color: string; accent_color: string }[]>`
    select primary_color, accent_color from public.lab_brand_kits
     where workspace_key = ${workspaceKey} limit 1`
  if (!row) return null
  const primary = normalizeHex(row.primary_color)
  if (!primary) return null
  return { primary, accent: normalizeHex(row.accent_color) || primary }
}

export async function writeBrandKit(context: WorkspaceAuthContext, brand: DocumentBrand) {
  if (!isPostgresConfigured()) return { saved: false }
  await getPostgres().begin(async (tx) => {
    await ensureWorkspaceRecord(tx, context)
    await tx`
      insert into public.lab_brand_kits (workspace_key, owner_id, primary_color, accent_color)
      values (${context.workspace.key}, ${context.userId}, ${brand.primary}, ${brand.accent})
      on conflict (workspace_key) do update set
        owner_id = excluded.owner_id,
        primary_color = excluded.primary_color,
        accent_color = excluded.accent_color,
        updated_at = now()`
  })
  return { saved: true }
}

export async function deleteBrandKit(context: WorkspaceAuthContext) {
  if (!isPostgresConfigured()) return { deleted: false }
  await getPostgres()`delete from public.lab_brand_kits where workspace_key = ${context.workspace.key}`
  return { deleted: true }
}

/**
 * The brand a document should use: a project's own colours when it has them
 * (set once during the Create coordinator flow), otherwise the workspace's
 * saved kit, otherwise `undefined` — every builder already has a sensible
 * default look and treats a missing brand as "use it". The logo, when one is
 * set, always comes from the workspace kit — a project's brand colours have
 * no logo concept of their own — and layers onto whichever colours won.
 */
export async function resolveDocumentBrand(input: { workspaceKey: string; projectId?: string | null }): Promise<DocumentBrand | undefined> {
  if (!isPostgresConfigured()) return undefined
  const sql = getPostgres()

  let colors: DocumentBrand | null = null
  if (input.projectId) {
    const [row] = await sql<{ project_data: { brand?: { colors?: unknown } } }[]>`
      select project_data from public.lab_studio_projects
       where workspace_key = ${input.workspaceKey} and id = ${input.projectId} limit 1`
    colors = row ? brandFromProjectColors(row.project_data?.brand?.colors) : null
  }
  if (!colors) colors = await readBrandKit(input.workspaceKey)

  const logoAssetId = await readBrandLogoAssetId(input.workspaceKey)
  const logo = logoAssetId ? await downloadBrandLogo(input.workspaceKey, logoAssetId).catch(() => null) : null

  if (!colors && !logo) return undefined
  return { ...(colors ?? DEFAULT_BRAND_COLORS), logo: logo ?? undefined }
}

// ---------------------------------------------------------------------------
// Logo storage.
//
// Same bucket, same path-hashing, same upload/cleanup contract as
// `@/lib/media/storage`'s `persistGeneratedMedia` — the only real difference
// is that a logo has no media job to attach to, so the row it inserts is a
// single `lab_assets` write rather than a job-plus-output pair.
// ---------------------------------------------------------------------------

const MAX_LOGO_BYTES = 3 * 1024 * 1024
const LOGO_TYPES = new Set(['image/png', 'image/jpeg'])
let storageClientSingleton: SupabaseClient | null = null

export class BrandStorageNotConfiguredError extends Error {
  constructor() {
    super('Private brand storage is not configured.')
    this.name = 'BrandStorageNotConfiguredError'
  }
}

export function isBrandStorageConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && process.env.SUPABASE_SECRET_KEY?.trim()
    && process.env.SUPABASE_PRIVATE_BUCKET?.trim(),
  )
}

function storageConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const secret = process.env.SUPABASE_SECRET_KEY?.trim()
  const bucket = process.env.SUPABASE_PRIVATE_BUCKET?.trim()
  if (!url || !secret || !bucket) throw new BrandStorageNotConfiguredError()
  return { url, secret, bucket }
}

function storageClient() {
  if (storageClientSingleton) return storageClientSingleton
  const { url, secret } = storageConfiguration()
  storageClientSingleton = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  return storageClientSingleton
}

function logoExtension(mimeType: string) {
  return mimeType === 'image/jpeg' ? 'jpg' : 'png'
}

async function deleteBrandAsset(workspaceKey: string, assetId: string) {
  const sql = getPostgres()
  const [asset] = await sql<{ storage_bucket: string; storage_path: string }[]>`
    select storage_bucket, storage_path from public.lab_assets
     where workspace_key = ${workspaceKey} and id = ${assetId}`
  if (asset) await storageClient().storage.from(asset.storage_bucket).remove([asset.storage_path]).catch(() => undefined)
  await sql`delete from public.lab_assets where workspace_key = ${workspaceKey} and id = ${assetId}`
}

export async function persistBrandLogo(
  context: WorkspaceAuthContext,
  input: { bytes: Uint8Array; mimeType: string },
): Promise<{ assetId: string }> {
  if (!LOGO_TYPES.has(input.mimeType)) throw new Error('Logos must be a PNG or JPEG image.')
  if (!input.bytes.byteLength || input.bytes.byteLength > MAX_LOGO_BYTES) throw new Error('That logo file is too large (3 MB max).')
  if (!readImageDimensions(input.bytes, input.mimeType)) throw new Error('That file is not a valid PNG or JPEG image.')
  const { bucket } = storageConfiguration()
  const workspaceHash = createHash('sha256').update(context.workspace.key).digest('hex').slice(0, 24)
  const assetId = `logo_${randomUUID()}`
  const objectPath = `brand/${workspaceHash}/${assetId}.${logoExtension(input.mimeType)}`
  const sha256 = createHash('sha256').update(input.bytes).digest('hex')

  const uploaded = await storageClient().storage.from(bucket).upload(objectPath, input.bytes, {
    contentType: input.mimeType, cacheControl: '31536000', upsert: false,
  })
  if (uploaded.error) throw uploaded.error

  try {
    const sql = getPostgres()
    const previousLogoAssetId = await sql.begin(async (tx) => {
      await ensureWorkspaceRecord(tx, context)
      const [existing] = await tx<{ logo_asset_id: string | null }[]>`
        select logo_asset_id from public.lab_brand_kits where workspace_key = ${context.workspace.key}`
      await tx`
        insert into public.lab_assets
          (id, workspace_key, owner_id, asset_kind, storage_bucket, storage_path, mime_type, byte_size, checksum_sha256, status, metadata)
        values (${assetId}, ${context.workspace.key}, ${context.userId}, 'upload', ${bucket}, ${objectPath},
                ${input.mimeType}, ${input.bytes.byteLength}, ${sha256}, 'ready', ${tx.json({ purpose: 'workspace_logo' })})`
      await tx`
        insert into public.lab_brand_kits (workspace_key, owner_id, logo_asset_id)
        values (${context.workspace.key}, ${context.userId}, ${assetId})
        on conflict (workspace_key) do update set
          owner_id = excluded.owner_id, logo_asset_id = excluded.logo_asset_id, updated_at = now()`
      return existing?.logo_asset_id ?? null
    }) as string | null
    // Replacing a logo removes the one it replaces, so storage does not
    // quietly accumulate every version anyone has ever uploaded.
    if (previousLogoAssetId && previousLogoAssetId !== assetId) {
      await deleteBrandAsset(context.workspace.key, previousLogoAssetId).catch(() => undefined)
    }
    return { assetId }
  } catch (error) {
    await storageClient().storage.from(bucket).remove([objectPath]).catch(() => undefined)
    throw error
  }
}

export async function deleteBrandLogo(context: WorkspaceAuthContext): Promise<{ deleted: boolean }> {
  if (!isPostgresConfigured()) return { deleted: false }
  const sql = getPostgres()
  const [row] = await sql<{ logo_asset_id: string | null }[]>`
    select logo_asset_id from public.lab_brand_kits where workspace_key = ${context.workspace.key}`
  if (!row?.logo_asset_id) return { deleted: false }
  await deleteBrandAsset(context.workspace.key, row.logo_asset_id)
  await sql`update public.lab_brand_kits set logo_asset_id = null, updated_at = now() where workspace_key = ${context.workspace.key}`
  return { deleted: true }
}

/** The saved logo's asset id, or null. Cheap — does not fetch the bytes. */
export async function readBrandLogoAssetId(workspaceKey: string): Promise<string | null> {
  if (!isPostgresConfigured()) return null
  const [row] = await getPostgres()<{ logo_asset_id: string | null }[]>`
    select logo_asset_id from public.lab_brand_kits where workspace_key = ${workspaceKey}`
  return row?.logo_asset_id ?? null
}

export async function downloadBrandLogo(workspaceKey: string, assetId: string) {
  const sql = getPostgres()
  const [asset] = await sql<{ storage_bucket: string; storage_path: string; mime_type: string }[]>`
    select storage_bucket, storage_path, mime_type from public.lab_assets
     where workspace_key = ${workspaceKey} and id = ${assetId} and status = 'ready' and deleted_at is null`
  if (!asset) return null
  const downloaded = await storageClient().storage.from(asset.storage_bucket).download(asset.storage_path)
  if (downloaded.error) throw downloaded.error
  return { bytes: new Uint8Array(await downloaded.data.arrayBuffer()), mimeType: asset.mime_type }
}
