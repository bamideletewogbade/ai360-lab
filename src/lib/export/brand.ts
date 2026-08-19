import 'server-only'
import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import { ensureWorkspaceRecord } from '@/lib/workspace-db'
import type { WorkspaceAuthContext } from '@/lib/workspace'
import { normalizeHex, type DocumentBrand } from '@/lib/export/color'

export type { DocumentBrand }

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
 * default look and treats a missing brand as "use it".
 */
export async function resolveDocumentBrand(input: { workspaceKey: string; projectId?: string | null }): Promise<DocumentBrand | undefined> {
  if (!isPostgresConfigured()) return undefined
  const sql = getPostgres()

  if (input.projectId) {
    const [row] = await sql<{ project_data: { brand?: { colors?: unknown } } }[]>`
      select project_data from public.lab_studio_projects
       where workspace_key = ${input.workspaceKey} and id = ${input.projectId} limit 1`
    const fromProject = row ? brandFromProjectColors(row.project_data?.brand?.colors) : null
    if (fromProject) return fromProject
  }

  return (await readBrandKit(input.workspaceKey)) || undefined
}
