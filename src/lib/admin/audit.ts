const ADMIN_AUDIT_TABLE = 'lab_admin_audit_events'

type PostgresErrorLike = {
  code?: unknown
  message?: unknown
  table_name?: unknown
}

/**
 * PostgreSQL reports an undefined relation with SQLSTATE 42P01. Keep this
 * check narrow so unrelated database failures still fail loudly.
 */
export function isMissingAdminAuditTable(error: unknown) {
  if (!error || typeof error !== 'object') return false

  const candidate = error as PostgresErrorLike
  if (candidate.code !== '42P01') return false

  const tableName = typeof candidate.table_name === 'string' ? candidate.table_name : ''
  const message = typeof candidate.message === 'string' ? candidate.message : ''
  return tableName.includes(ADMIN_AUDIT_TABLE) || message.includes(ADMIN_AUDIT_TABLE)
}
