import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import type { WorkspaceAuthContext } from '@/lib/workspace'

/**
 * Durable record of an agent run.
 *
 * The runtime writes a checkpoint at every meaningful boundary rather than
 * only at the end. Two reasons. A run that dies mid-way leaves evidence of how
 * far it got instead of vanishing, and the recorded boundaries are what a
 * future worker needs in order to resume rather than restart. Nothing here
 * makes a run resumable on its own; it makes resumability possible.
 *
 * Persistence is best-effort. A database problem must degrade the agent to the
 * behaviour it had before durability existed, never fail the user's request.
 */

export const ORCHESTRATION_VERSION = 'plan-execute-verify-1'

export type RunStatus =
  | 'queued' | 'planning' | 'running' | 'verifying'
  | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled'

export type TaskStatus = 'queued' | 'blocked' | 'running' | 'completed' | 'failed' | 'cancelled'

function enabled() {
  return isPostgresConfigured()
}

async function safely<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work()
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'ai360-lab',
      event: 'agent.persistence_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }))
    return fallback
  }
}

export type RunHandle = {
  runId: string
  persisted: boolean
  workspaceKey: string
}

export async function openRun(input: {
  context: WorkspaceAuthContext | null
  runId: string
  goal: string
  coordinatorModel: string
  maxCostUsd: number
  maxDurationMs: number
}): Promise<RunHandle> {
  const handle: RunHandle = {
    runId: input.runId,
    persisted: false,
    workspaceKey: input.context?.workspace.key ?? 'guest',
  }
  if (!enabled() || !input.context) return handle

  return safely(async () => {
    const sql = getPostgres()
    await sql`
      insert into public.lab_agent_runs
        (id, workspace_key, owner_id, goal, status, orchestration_version,
         coordinator_model, max_cost_usd, max_duration_ms, started_at)
      values (${input.runId}, ${input.context!.workspace.key}, ${input.context!.userId},
              ${input.goal.slice(0, 4_000)}, 'planning', ${ORCHESTRATION_VERSION},
              ${input.coordinatorModel}, ${input.maxCostUsd}, ${input.maxDurationMs}, now())
      on conflict (workspace_key, id) do nothing`
    return { ...handle, persisted: true }
  }, handle)
}

export async function setRunStatus(handle: RunHandle, status: RunStatus, extra: {
  actualCostUsd?: number
  errorCode?: string
} = {}) {
  if (!handle.persisted) return
  await safely(async () => {
    const sql = getPostgres()
    const finished = status === 'completed' || status === 'failed' || status === 'cancelled'
    await sql`
      update public.lab_agent_runs
         set status = ${status},
             actual_cost_usd = coalesce(${extra.actualCostUsd ?? null}, actual_cost_usd),
             error_code = coalesce(${extra.errorCode ?? null}, error_code),
             completed_at = case when ${finished} then now() else completed_at end,
             updated_at = now()
       where workspace_key = ${handle.workspaceKey} and id = ${handle.runId}`
  }, undefined)
}

export async function recordTask(handle: RunHandle, task: {
  id: string
  objective: string
  role: string
  sequence: number
  model?: string
}) {
  if (!handle.persisted) return
  await safely(async () => {
    const sql = getPostgres()
    await sql`
      insert into public.lab_agent_tasks
        (id, workspace_key, run_id, objective, specialist_role, status, sequence, model)
      values (${task.id}, ${handle.workspaceKey}, ${handle.runId}, ${task.objective.slice(0, 4_000)},
              ${task.role}, 'queued', ${task.sequence}, ${task.model ?? null})
      on conflict (workspace_key, id) do nothing`
  }, undefined)
}

export async function setTaskStatus(handle: RunHandle, taskId: string, status: TaskStatus, extra: {
  outputData?: Record<string, unknown>
  actualCostUsd?: number
  errorCode?: string
} = {}) {
  if (!handle.persisted) return
  await safely(async () => {
    const sql = getPostgres()
    const finished = status === 'completed' || status === 'failed' || status === 'cancelled'
    await sql`
      update public.lab_agent_tasks
         set status = ${status},
             attempt_count = case when ${status === 'running'} then attempt_count + 1 else attempt_count end,
             started_at = case when ${status === 'running'} then coalesce(started_at, now()) else started_at end,
             completed_at = case when ${finished} then now() else completed_at end,
             output_data = coalesce(${extra.outputData ? sql.json(extra.outputData as never) : null}, output_data),
             actual_cost_usd = coalesce(${extra.actualCostUsd ?? null}, actual_cost_usd),
             error_code = coalesce(${extra.errorCode ?? null}, error_code),
             updated_at = now()
       where workspace_key = ${handle.workspaceKey} and run_id = ${handle.runId} and id = ${taskId}`
  }, undefined)
}

/**
 * Appends to the run's event log.
 *
 * `visibility` separates what a person should see from what an operator needs.
 * Operator events carry model names, costs and failures; user events carry
 * progress. The same log serves both without leaking one into the other.
 */
export async function recordEvent(handle: RunHandle, event: {
  sequence: number
  type: string
  summary: string
  taskId?: string
  visibility?: 'user' | 'operator'
  payload?: Record<string, unknown>
}) {
  if (!handle.persisted) return
  await safely(async () => {
    const sql = getPostgres()
    await sql`
      insert into public.lab_agent_events
        (workspace_key, run_id, task_id, sequence, event_type, visibility, summary, payload)
      values (${handle.workspaceKey}, ${handle.runId}, ${event.taskId ?? null}, ${event.sequence},
              ${event.type}, ${event.visibility ?? 'user'}, ${event.summary.slice(0, 2_000)},
              ${sql.json((event.payload ?? {}) as never)})
      on conflict (workspace_key, run_id, sequence) do nothing`
  }, undefined)
}

/**
 * Records that a run paused for a human decision.
 *
 * The row is the evidence that the pause happened and what was shown at the
 * time. Approval is carried back by the follow-up request rather than read from
 * here, so a lost row delays nothing.
 */
export async function recordApprovalRequest(handle: RunHandle, approval: {
  id: string
  approvalType: string
  summary: string
  estimatedCostUsd?: number
  requestedBy: string
}) {
  if (!handle.persisted) return
  await safely(async () => {
    const sql = getPostgres()
    await sql`
      insert into public.lab_agent_approvals
        (id, workspace_key, run_id, approval_type, status, summary, estimated_cost_usd, requested_by, idempotency_key)
      values (${approval.id}, ${handle.workspaceKey}, ${handle.runId}, ${approval.approvalType}, 'pending',
              ${approval.summary.slice(0, 2_000)}, ${approval.estimatedCostUsd ?? null},
              ${approval.requestedBy}, ${`approval:${handle.workspaceKey}:${approval.id}`.slice(0, 160)})
      on conflict (idempotency_key) do nothing`
  }, undefined)
}

/**
 * Saves what the person would see if they came back right now.
 *
 * Written at every visible boundary rather than only at the end, so a run that
 * loses its connection can still be followed. Progress is a small array of
 * steps, not the streamed text, because writing a row per token would cost more
 * than it saves.
 */
export async function saveProgress(handle: RunHandle, progress: {
  steps: Array<{ id: string; label: string; status: string }>
  plan?: { objectives: string[]; depth: string; awaitingApproval: boolean; estimatedCredits: number } | null
}) {
  if (!handle.persisted) return
  await safely(async () => {
    const sql = getPostgres()
    await sql`
      update public.lab_agent_runs
         set progress = ${sql.json(progress.steps as never)},
             plan = ${progress.plan ? sql.json(progress.plan as never) : null},
             last_seen_at = now(),
             updated_at = now()
       where workspace_key = ${handle.workspaceKey} and id = ${handle.runId}`
  }, undefined)
}

/** Stores the finished answer so it survives the connection that asked for it. */
export async function saveResult(handle: RunHandle, result: {
  content: string
  sources: Array<{ url: string; title: string }>
  usage: { totalTokens?: number; cost?: number }
}) {
  if (!handle.persisted) return
  await safely(async () => {
    const sql = getPostgres()
    await sql`
      update public.lab_agent_runs
         set result_content = ${result.content},
             result_sources = ${sql.json(result.sources as never)},
             result_usage = ${sql.json(result.usage as never)},
             updated_at = now()
       where workspace_key = ${handle.workspaceKey} and id = ${handle.runId}`
  }, undefined)
}

export type StoredRun = {
  runId: string
  status: RunStatus
  goal: string
  steps: Array<{ id: string; label: string; status: string }>
  plan: { objectives: string[]; depth: string; awaitingApproval: boolean; estimatedCredits: number } | null
  content: string | null
  sources: Array<{ url: string; title: string }>
  usage: { totalTokens?: number; cost?: number } | null
  errorCode: string | null
  activity: Array<{ type: string; summary: string; createdAt: string }>
}

/** What a returning client needs to pick up where it left off. */
export async function loadRun(workspaceKey: string, runId: string): Promise<StoredRun | null> {
  if (!enabled()) return null
  return safely(async () => {
    const sql = getPostgres()
    const [row] = await sql<Array<{
      id: string
      status: RunStatus
      goal: string
      progress: Array<{ id: string; label: string; status: string }> | null
      plan: StoredRun['plan']
      result_content: string | null
      result_sources: StoredRun['sources'] | null
      result_usage: StoredRun['usage']
      error_code: string | null
    }>>`
      select id, status, goal, progress, plan, result_content, result_sources, result_usage, error_code
        from public.lab_agent_runs
       where workspace_key = ${workspaceKey} and id = ${runId}`
    if (!row) return null
    const events = await sql<Array<{ event_type: string; summary: string; created_at: Date }>>`
      select event_type, summary, created_at
        from public.lab_agent_events
       where workspace_key = ${workspaceKey} and run_id = ${runId} and visibility = 'user'
       order by sequence desc
       limit 12`
    return {
      runId: row.id,
      status: row.status,
      goal: row.goal,
      steps: row.progress ?? [],
      plan: row.plan ?? null,
      content: row.result_content,
      sources: row.result_sources ?? [],
      usage: row.result_usage ?? null,
      errorCode: row.error_code,
      activity: events.reverse().map((event) => ({
        type: event.event_type,
        summary: event.summary,
        createdAt: event.created_at.toISOString(),
      })),
    }
  }, null)
}

export async function recordArtifact(handle: RunHandle, artifact: {
  id: string
  title: string
  artifactType: string
  content: Record<string, unknown>
  verification: 'pending' | 'passed' | 'needs_revision' | 'rejected'
}) {
  if (!handle.persisted) return
  await safely(async () => {
    const sql = getPostgres()
    await sql`
      insert into public.lab_agent_artifacts
        (id, workspace_key, run_id, artifact_type, title, content_data, verification_status)
      values (${artifact.id}, ${handle.workspaceKey}, ${handle.runId}, ${artifact.artifactType},
              ${artifact.title.slice(0, 500)}, ${sql.json(artifact.content as never)}, ${artifact.verification})
      on conflict (workspace_key, id) do update
         set content_data = excluded.content_data,
             verification_status = excluded.verification_status,
             updated_at = now()`
  }, undefined)
}
