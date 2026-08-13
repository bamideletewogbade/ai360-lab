import type { TransactionSql } from 'postgres'
import type { WorkspaceAuthContext } from '@/lib/workspace'

/**
 * Makes sure the identity rows a workspace-scoped record depends on exist.
 *
 * Every table that carries a `workspace_key` has a foreign key to
 * `lab_workspaces`, so this runs before the first write of any request that
 * stores something for a person.
 */
export async function ensureWorkspaceRecord(
  sql: TransactionSql,
  context: WorkspaceAuthContext,
) {
  await sql`
    insert into public.lab_users (clerk_user_id, email, display_name, image_url, deleted_at)
    values (${context.userId}, ${context.profile.email}, ${context.profile.displayName}, ${context.profile.imageUrl}, null)
    on conflict (clerk_user_id) do update set
      email = coalesce(excluded.email, public.lab_users.email),
      display_name = coalesce(excluded.display_name, public.lab_users.display_name),
      image_url = coalesce(excluded.image_url, public.lab_users.image_url),
      deleted_at = null,
      updated_at = now()`
  await sql`
    insert into public.lab_workspaces (workspace_key, workspace_type, subject_id, created_by_user_id)
    values (${context.workspace.key}, ${context.workspace.type}, ${context.workspace.subjectId}, ${context.userId})
    on conflict (workspace_key) do nothing`
}
