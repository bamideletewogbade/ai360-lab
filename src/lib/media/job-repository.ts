import "server-only";
import { getPostgres, isPostgresConfigured } from "@/lib/postgres";
import { ensureWorkspaceRecord } from "@/lib/workspace-db";
import type { WorkspaceAuthContext } from "@/lib/workspace";
import type { MediaIntent } from "@/lib/media/intent";

export type MediaJobStatus =
  "queued" | "submitted" | "running" | "completed" | "failed" | "cancelled";

export type MediaJob = {
  id: string;
  projectId: string | null;
  projectAssetId: string | null;
  mediaType: "image" | "video";
  status: MediaJobStatus;
  intent: MediaIntent;
  provider: string | null;
  model: string | null;
  providerJobId: string | null;
  reservationId: string | null;
  quotedCostUsd: number | null;
  actualCostUsd: number | null;
  errorMessage: string | null;
  outputAssetId: string | null;
  createdAt: string;
  updatedAt: string;
};

type MediaJobRow = {
  id: string;
  project_id: string | null;
  project_asset_id: string | null;
  media_type: "image" | "video";
  status: MediaJobStatus;
  intent: MediaIntent;
  provider: string | null;
  model: string | null;
  provider_job_id: string | null;
  reservation_id: string | null;
  quoted_cost_usd: string | null;
  actual_cost_usd: string | null;
  error_message: string | null;
  output_asset_id: string | null;
  created_at: string;
  updated_at: string;
};

function amount(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapJob(row: MediaJobRow): MediaJob {
  return {
    id: row.id,
    projectId: row.project_id,
    projectAssetId: row.project_asset_id,
    mediaType: row.media_type,
    status: row.status,
    intent: row.intent,
    provider: row.provider,
    model: row.model,
    providerJobId: row.provider_job_id,
    reservationId: row.reservation_id,
    quotedCostUsd: amount(row.quoted_cost_usd),
    actualCostUsd: amount(row.actual_cost_usd),
    errorMessage: row.error_message,
    outputAssetId: row.output_asset_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const JOB_SELECT = `
  select job.id, job.project_id, job.project_asset_id, job.media_type, job.status,
         job.intent, job.provider, job.model, job.provider_job_id, job.reservation_id,
         job.quoted_cost_usd, job.actual_cost_usd, job.error_message,
         output.asset_id as output_asset_id, job.created_at, job.updated_at
    from public.lab_media_jobs job
    left join lateral (
      select asset_id from public.lab_media_outputs
       where workspace_key = job.workspace_key and job_id = job.id
       order by selected desc, version desc limit 1
    ) output on true
`;

export function isMediaJobStoreConfigured() {
  return isPostgresConfigured();
}

export async function createMediaJob(input: {
  context: WorkspaceAuthContext;
  id: string;
  projectId?: string;
  projectAssetId?: string;
  intent: MediaIntent;
  idempotencyKey: string;
  quotedCostUsd?: number | null;
  reservationId?: string | null;
}) {
  const sql = getPostgres();
  return sql.begin(async (tx) => {
    await ensureWorkspaceRecord(tx, input.context);
    await tx`
      insert into public.lab_media_jobs
        (id, workspace_key, owner_id, project_id, project_asset_id, media_type,
         intent_version, intent, reservation_id, quoted_cost_usd, idempotency_key)
      values (${input.id.slice(0, 96)}, ${input.context.workspace.key}, ${input.context.userId},
              ${input.projectId?.slice(0, 64) || null}, ${input.projectAssetId?.slice(0, 64) || null},
              ${input.intent.mediaType}, ${input.intent.version}, ${tx.json(input.intent)},
              ${input.reservationId || null}, ${input.quotedCostUsd ?? null}, ${input.idempotencyKey.slice(0, 160)})
      on conflict (idempotency_key) do nothing`;
    const rows = await tx.unsafe<MediaJobRow[]>(
      `${JOB_SELECT}
      where job.workspace_key = $1 and job.idempotency_key = $2 limit 1`,
      [input.context.workspace.key, input.idempotencyKey.slice(0, 160)],
    );
    if (!rows[0]) throw new Error("MEDIA_JOB_NOT_CREATED");
    return mapJob(rows[0]);
  }) as Promise<MediaJob>;
}

export async function readMediaJob(
  context: WorkspaceAuthContext,
  jobId: string,
) {
  const sql = getPostgres();
  const rows = await sql.unsafe<MediaJobRow[]>(
    `${JOB_SELECT}
    where job.workspace_key = $1 and job.id = $2 limit 1`,
    [context.workspace.key, jobId.slice(0, 96)],
  );
  return rows[0] ? mapJob(rows[0]) : null;
}

export async function listMediaJobs(
  context: WorkspaceAuthContext,
  projectId: string,
  limit = 50,
) {
  const sql = getPostgres();
  const rows = await sql.unsafe<MediaJobRow[]>(
    `${JOB_SELECT}
    where job.workspace_key = $1 and job.project_id = $2
    order by job.created_at desc limit $3`,
    [
      context.workspace.key,
      projectId.slice(0, 64),
      Math.min(100, Math.max(1, limit)),
    ],
  );
  return rows.map(mapJob);
}

/**
 * The most recent completed jobs with a stored output, across projects — the
 * Media Studio gallery source so a finished clip (even one delivered after the
 * studio was closed) reappears on the next visit.
 */
export async function listRecentMediaJobs(
  context: WorkspaceAuthContext,
  limit = 24,
) {
  const sql = getPostgres();
  const rows = await sql.unsafe<MediaJobRow[]>(
    `${JOB_SELECT}
    where job.workspace_key = $1 and job.status = 'completed' and output.asset_id is not null
    order by job.created_at desc limit $2`,
    [context.workspace.key, Math.min(50, Math.max(1, limit))],
  );
  return rows.map(mapJob);
}

export async function markMediaJobSubmitted(input: {
  context: WorkspaceAuthContext;
  jobId: string;
  provider: string;
  model: string;
  providerJobId?: string | null;
  status?: "submitted" | "running";
}) {
  const sql = getPostgres();
  await sql`
    update public.lab_media_jobs
       set provider = ${input.provider.slice(0, 50)}, model = ${input.model.slice(0, 160)},
           provider_job_id = ${input.providerJobId?.slice(0, 255) || null},
           status = ${input.status || "submitted"}, started_at = coalesce(started_at, now()), updated_at = now()
     where workspace_key = ${input.context.workspace.key} and id = ${input.jobId.slice(0, 96)}
       and status in ('queued', 'submitted', 'running')`;
}

export async function updateMediaJobResult(input: {
  context: WorkspaceAuthContext;
  jobId: string;
  status: MediaJobStatus;
  actualCostUsd?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const terminal =
    input.status === "completed" ||
    input.status === "failed" ||
    input.status === "cancelled";
  const sql = getPostgres();
  await sql`
    update public.lab_media_jobs
       set status = ${input.status}, actual_cost_usd = coalesce(${input.actualCostUsd ?? null}, actual_cost_usd),
           error_code = ${input.errorCode?.slice(0, 80) || null},
           error_message = ${input.errorMessage?.slice(0, 1_000) || null},
           completed_at = case when ${terminal} then coalesce(completed_at, now()) else completed_at end,
           updated_at = now()
     where workspace_key = ${input.context.workspace.key} and id = ${input.jobId.slice(0, 96)}`;
}

export async function attachMediaOutput(input: {
  context: WorkspaceAuthContext;
  jobId: string;
  outputId: string;
  assetId: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const sql = getPostgres();
  await sql.begin(async (tx) => {
    const [version] = await tx<{ next_version: string }[]>`
      select coalesce(max(version), 0) + 1 as next_version
        from public.lab_media_outputs
       where workspace_key = ${input.context.workspace.key} and job_id = ${input.jobId.slice(0, 96)}`;
    await tx`
      insert into public.lab_media_outputs
        (id, workspace_key, job_id, asset_id, version, selected, metadata)
      values (${input.outputId.slice(0, 96)}, ${input.context.workspace.key}, ${input.jobId.slice(0, 96)},
              ${input.assetId.slice(0, 96)}, ${Number(version?.next_version || 1)}, true,
              ${tx.json(input.metadata || {})})
      on conflict (workspace_key, id) do nothing`;
    await tx`
      update public.lab_media_jobs set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
       where workspace_key = ${input.context.workspace.key} and id = ${input.jobId.slice(0, 96)}`;
  });
}
