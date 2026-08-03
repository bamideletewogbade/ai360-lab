import type { ResultSetHeader } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import type { WorkspaceAuthContext } from '@/lib/workspace'

export async function ensureWorkspaceRecord(
  connection: PoolConnection,
  context: WorkspaceAuthContext,
) {
  await connection.execute<ResultSetHeader>(
    'INSERT IGNORE INTO lab_users (clerk_user_id) VALUES (?)',
    [context.userId],
  )
  await connection.execute<ResultSetHeader>(
    `INSERT INTO lab_workspaces (workspace_key, workspace_type, subject_id, created_by_user_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE workspace_key = VALUES(workspace_key)`,
    [context.workspace.key, context.workspace.type, context.workspace.subjectId, context.userId],
  )
}
