import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import { ensureWorkspaceRecord } from '@/lib/workspace-db'
import type { WorkspaceAuthContext } from '@/lib/workspace'

/**
 * A project's knowledge base.
 *
 * The container model that OpenAI and Anthropic use for Projects rests on one
 * primitive: files uploaded once are referenced across every conversation and
 * generation inside that project. This repository owns that primitive. The
 * extracted text is the grounding value, so it is what is stored and served;
 * original binaries can move to private object storage later without changing
 * this contract.
 */

export type ProjectFile = {
  id: string
  projectId: string
  name: string
  mimeType: string
  sizeBytes: number
  charCount: number
  createdAt: string
}

/** Per-file stored text cap, and the total budget when grounding a request. */
export const MAX_FILE_TEXT = 200_000
export const MAX_KNOWLEDGE_CHARS = 120_000

type FileRow = {
  id: string
  project_id: string
  name: string
  mime_type: string
  size_bytes: string
  char_count: number
  created_at: Date
}

function fromRow(row: FileRow): ProjectFile {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    charCount: row.char_count,
    createdAt: row.created_at.toISOString(),
  }
}

/**
 * Joins file texts into one grounding block within a budget.
 *
 * Pure so the budgeting is unit tested without a database. A file is labelled by
 * name so the model can attribute what it read, and the block is truncated at
 * the budget rather than dropping whole files, so the earliest knowledge always
 * survives.
 */
export function mergeKnowledge(
  files: Array<{ name: string; text: string }>,
  maxChars = MAX_KNOWLEDGE_CHARS,
): string {
  let out = ''
  for (const file of files) {
    if (!file.text) continue
    const block = `\n\n--- ${file.name} ---\n${file.text}`
    if (out.length >= maxChars) break
    out += out.length + block.length > maxChars ? block.slice(0, maxChars - out.length) : block
  }
  return out.trim()
}

export async function addProjectFile(
  context: WorkspaceAuthContext,
  input: { projectId: string; name: string; mimeType: string; sizeBytes: number; extractedText: string },
): Promise<ProjectFile> {
  if (!isPostgresConfigured()) throw new Error('AI360_POSTGRES_NOT_CONFIGURED')
  const sql = getPostgres()
  const id = `pf_${crypto.randomUUID().replaceAll('-', '')}`
  const text = input.extractedText.slice(0, MAX_FILE_TEXT)

  return sql.begin(async (tx) => {
    await ensureWorkspaceRecord(tx, context)
    // The project must exist in this workspace. The foreign key enforces this,
    // but checking first turns a constraint violation into a clean 404.
    const [project] = await tx`
      select 1 from public.lab_studio_projects
       where workspace_key = ${context.workspace.key} and id = ${input.projectId}`
    if (!project) throw new Error('PROJECT_NOT_FOUND')

    const [row] = await tx<FileRow[]>`
      insert into public.lab_project_files
        (id, workspace_key, owner_id, project_id, name, mime_type, size_bytes, char_count, extracted_text)
      values
        (${id}, ${context.workspace.key}, ${context.userId}, ${input.projectId},
         ${input.name.slice(0, 255)}, ${input.mimeType.slice(0, 255)}, ${input.sizeBytes},
         ${text.length}, ${text})
      returning id, project_id, name, mime_type, size_bytes, char_count, created_at`
    return fromRow(row)
  }) as Promise<ProjectFile>
}

export async function listProjectFiles(context: WorkspaceAuthContext, projectId: string): Promise<ProjectFile[]> {
  if (!isPostgresConfigured()) return []
  const rows = await getPostgres()<FileRow[]>`
    select id, project_id, name, mime_type, size_bytes, char_count, created_at
      from public.lab_project_files
     where workspace_key = ${context.workspace.key} and project_id = ${projectId}
     order by created_at desc limit 200`
  return rows.map(fromRow)
}

export async function deleteProjectFile(context: WorkspaceAuthContext, projectId: string, fileId: string): Promise<boolean> {
  if (!isPostgresConfigured()) return false
  const result = await getPostgres()`
    delete from public.lab_project_files
     where workspace_key = ${context.workspace.key} and project_id = ${projectId} and id = ${fileId}`
  return result.count > 0
}

/** The concatenated knowledge for one project, bounded, ready to ground a request. */
export async function getProjectKnowledge(
  context: WorkspaceAuthContext,
  projectId: string,
  maxChars = MAX_KNOWLEDGE_CHARS,
): Promise<string> {
  if (!isPostgresConfigured()) return ''
  const rows = await getPostgres()<{ name: string; extracted_text: string }[]>`
    select name, extracted_text from public.lab_project_files
     where workspace_key = ${context.workspace.key} and project_id = ${projectId}
     order by created_at asc`
  return mergeKnowledge(rows.map((row) => ({ name: row.name, text: row.extracted_text })), maxChars)
}
