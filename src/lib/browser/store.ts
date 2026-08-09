import { getPostgres } from '@/lib/postgres'
import type { BrowserProviderStatus } from '@/lib/browser/provider'
import type { ActionRisk, NormalizedAction } from '@/lib/agent/tool-contracts'

export type StoredBrowserAction = {
  id: string
  runId: string
  status: 'proposed' | 'awaiting_approval' | 'approved' | 'executing' | 'completed' | 'failed' | 'rejected' | 'blocked' | 'cancelled'
  target: string | null
  result: Record<string, unknown> | null
  errorCode: string | null
}

export type StoredBrowserArtifact = {
  id: string
  runId: string
  actionId: string
  objectPath: string
  mimeType: 'image/jpeg'
  byteLength: number
  sha256: string
  expiresAt: string
  deletedAt: string | null
}

export type StoredBrowserSession = {
  id: string
  workspaceKey: string
  runId: string
  provider: string
  providerSessionId: string
  status: BrowserProviderStatus | 'awaiting_takeover'
  allowedDomains: string[]
  lastUrl: string | null
  expiresAt: string
}

export async function createBrowserSessionRecord(input: StoredBrowserSession) {
  const sql = getPostgres()
  await sql`
    insert into public.lab_browser_sessions
      (id, workspace_key, run_id, provider, provider_session_id, status,
       allowed_domains, last_url, started_at, expires_at)
    values (${input.id}, ${input.workspaceKey}, ${input.runId}, ${input.provider},
            ${input.providerSessionId}, ${input.status}, ${input.allowedDomains},
            ${input.lastUrl}, now(), ${input.expiresAt})`
}

export async function loadBrowserSession(workspaceKey: string, id: string): Promise<StoredBrowserSession | null> {
  const sql = getPostgres()
  const [row] = await sql<Array<{
    id: string
    workspace_key: string
    run_id: string
    provider: string
    provider_session_id: string
    status: StoredBrowserSession['status']
    allowed_domains: string[]
    last_url: string | null
    expires_at: Date
  }>>`
    select id, workspace_key, run_id, provider, provider_session_id, status,
           allowed_domains, last_url, expires_at
      from public.lab_browser_sessions
     where workspace_key = ${workspaceKey} and id = ${id}`
  if (!row) return null
  return {
    id: row.id,
    workspaceKey: row.workspace_key,
    runId: row.run_id,
    provider: row.provider,
    providerSessionId: row.provider_session_id,
    status: row.status,
    allowedDomains: row.allowed_domains,
    lastUrl: row.last_url,
    expiresAt: row.expires_at.toISOString(),
  }
}

export async function setBrowserSessionStatus(
  workspaceKey: string,
  id: string,
  status: StoredBrowserSession['status'],
) {
  const sql = getPostgres()
  const closed = status === 'closed' || status === 'expired' || status === 'failed'
  await sql`
    update public.lab_browser_sessions
       set status = ${status},
           closed_at = case when ${closed} then now() else closed_at end,
           updated_at = now()
     where workspace_key = ${workspaceKey} and id = ${id}`
}

export async function createBrowserAction(input: {
  workspaceKey: string
  runId: string
  action: NormalizedAction
  risk: ActionRisk
  payloadHash: string
}) {
  const sql = getPostgres()
  return sql.begin(async (transaction) => {
    const lockKey = `${input.workspaceKey}:${input.runId}`
    await transaction`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
    const [existing] = await transaction<Array<{ id: string }>>`
      select id from public.lab_agent_actions where idempotency_key = ${input.action.idempotencyKey}`
    if (existing) return { id: existing.id, created: false }

    const [row] = await transaction<Array<{ id: string }>>`
      insert into public.lab_agent_actions
        (id, workspace_key, run_id, sequence, action_kind, capability, risk, status,
         target, payload_hash, sanitized_input, expected_outcome,
         verification_status, idempotency_key, started_at)
      select ${input.action.id}, ${input.workspaceKey}, ${input.runId},
             coalesce(max(sequence), -1) + 1, ${input.action.kind}, ${input.action.capability},
             ${input.risk}, 'executing', ${input.action.url ?? input.action.target ?? null},
             ${input.payloadHash},
             ${transaction.json(input.action.input as never)}, ${input.action.expectedOutcome},
             'pending', ${input.action.idempotencyKey}, now()
        from public.lab_agent_actions
       where workspace_key = ${input.workspaceKey} and run_id = ${input.runId}
      returning id`
    return { id: row.id, created: true }
  })
}

export async function completeBrowserAction(input: {
  workspaceKey: string
  actionId: string
  result: Record<string, unknown>
  verified: boolean
}) {
  const sql = getPostgres()
  await sql`
    update public.lab_agent_actions
       set status = 'completed', result_data = ${sql.json(input.result as never)},
           verification_status = ${input.verified ? 'passed' : 'failed'},
           completed_at = now(), updated_at = now()
     where workspace_key = ${input.workspaceKey} and id = ${input.actionId}`
}

export async function loadBrowserAction(workspaceKey: string, actionId: string): Promise<StoredBrowserAction | null> {
  const sql = getPostgres()
  const [row] = await sql<Array<{
    id: string
    run_id: string
    status: StoredBrowserAction['status']
    target: string | null
    result_data: Record<string, unknown> | null
    error_code: string | null
  }>>`
    select id, run_id, status, target, result_data, error_code
      from public.lab_agent_actions
     where workspace_key = ${workspaceKey} and id = ${actionId}`
  return row ? {
    id: row.id,
    runId: row.run_id,
    status: row.status,
    target: row.target,
    result: row.result_data,
    errorCode: row.error_code,
  } : null
}

export async function setBrowserActionInvocation(input: {
  workspaceKey: string
  actionId: string
  invocationId: string
  providerSessionId: string | null
  status: 'queued' | 'running'
}) {
  const sql = getPostgres()
  await sql`
    update public.lab_agent_actions
       set result_data = ${sql.json({
         invocationId: input.invocationId,
         providerSessionId: input.providerSessionId,
         workerStatus: input.status,
       } as never)}, updated_at = now()
     where workspace_key = ${input.workspaceKey} and id = ${input.actionId}
       and status = 'executing'`
}

export async function failBrowserAction(input: {
  workspaceKey: string
  actionId: string
  errorCode: string
}) {
  const sql = getPostgres()
  await sql`
    update public.lab_agent_actions
       set status = 'failed', verification_status = 'failed',
           error_code = ${input.errorCode.slice(0, 120)}, completed_at = now(), updated_at = now()
     where workspace_key = ${input.workspaceKey} and id = ${input.actionId}`
}

export async function appendBrowserRunEvent(input: {
  workspaceKey: string
  runId: string
  type: string
  summary: string
  visibility?: 'user' | 'operator'
  payload?: Record<string, unknown>
}) {
  const sql = getPostgres()
  await sql.begin(async (transaction) => {
    const lockKey = `events:${input.workspaceKey}:${input.runId}`
    await transaction`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
    await transaction`
      insert into public.lab_agent_events
        (workspace_key, run_id, sequence, event_type, visibility, summary, payload)
      select ${input.workspaceKey}, ${input.runId}, coalesce(max(sequence), -1) + 1,
             ${input.type.slice(0, 120)}, ${input.visibility ?? 'user'},
             ${input.summary.slice(0, 2_000)},
             ${transaction.json((input.payload ?? {}) as never)}
        from public.lab_agent_events
       where workspace_key = ${input.workspaceKey} and run_id = ${input.runId}`
  })
}

export async function recordBrowserArtifact(input: {
  id: string
  workspaceKey: string
  runId: string
  actionId: string
  objectPath: string
  byteLength: number
  sha256: string
  expiresAt: string
}) {
  const sql = getPostgres()
  await sql`
    insert into public.lab_browser_artifacts
      (id, workspace_key, run_id, action_id, object_path, mime_type, byte_length, sha256, expires_at)
    values (${input.id}, ${input.workspaceKey}, ${input.runId}, ${input.actionId}, ${input.objectPath},
            'image/jpeg', ${input.byteLength}, ${input.sha256}, ${input.expiresAt})
    on conflict (workspace_key, action_id) do nothing`
}

function artifactFromRow(row: {
  id: string
  run_id: string
  action_id: string
  object_path: string
  mime_type: 'image/jpeg'
  byte_length: number
  sha256: string
  expires_at: Date
  deleted_at: Date | null
}): StoredBrowserArtifact {
  return {
    id: row.id,
    runId: row.run_id,
    actionId: row.action_id,
    objectPath: row.object_path,
    mimeType: row.mime_type,
    byteLength: row.byte_length,
    sha256: row.sha256,
    expiresAt: row.expires_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  }
}

export async function loadBrowserArtifact(workspaceKey: string, artifactId: string): Promise<StoredBrowserArtifact | null> {
  const sql = getPostgres()
  const [row] = await sql<Array<Parameters<typeof artifactFromRow>[0]>>`
    select id, run_id, action_id, object_path, mime_type, byte_length, sha256, expires_at, deleted_at
      from public.lab_browser_artifacts
     where workspace_key = ${workspaceKey} and id = ${artifactId}`
  return row ? artifactFromRow(row) : null
}

export async function expiredBrowserArtifacts(limit = 100) {
  const sql = getPostgres()
  const rows = await sql<Array<{ workspace_key: string } & Parameters<typeof artifactFromRow>[0]>>`
    select workspace_key, id, run_id, action_id, object_path, mime_type, byte_length, sha256,
           expires_at, deleted_at
      from public.lab_browser_artifacts
     where deleted_at is null and expires_at <= now()
     order by expires_at asc
     limit ${Math.min(1000, Math.max(1, limit))}`
  return rows.map((row) => ({ workspaceKey: row.workspace_key, ...artifactFromRow(row) }))
}

export async function markBrowserArtifactsDeleted(objectPaths: string[]) {
  if (!objectPaths.length) return
  const sql = getPostgres()
  await sql`
    update public.lab_browser_artifacts
       set deleted_at = now()
     where object_path = any(${objectPaths}) and deleted_at is null`
}
