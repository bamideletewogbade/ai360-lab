begin;

create table if not exists public.lab_assets (
  id text not null,
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  owner_id text not null references public.lab_users(clerk_user_id) on delete cascade,
  project_id text,
  conversation_id text,
  asset_kind text not null check (asset_kind in ('upload', 'image', 'video', 'audio', 'document', 'export', 'brand_guide', 'other')),
  storage_bucket text not null,
  storage_path text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  checksum_sha256 text check (checksum_sha256 is null or char_length(checksum_sha256) = 64),
  status text not null default 'ready' check (status in ('uploading', 'processing', 'ready', 'failed', 'quarantined', 'deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (workspace_key, id),
  unique (storage_bucket, storage_path)
);

create table if not exists public.lab_agent_runs (
  id text not null,
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  owner_id text not null references public.lab_users(clerk_user_id) on delete cascade,
  project_id text,
  conversation_id text,
  goal text not null,
  status text not null default 'queued' check (status in ('queued', 'planning', 'running', 'verifying', 'awaiting_approval', 'completed', 'failed', 'cancelled')),
  orchestration_version text not null,
  coordinator_model text,
  max_cost_usd numeric(14, 8) check (max_cost_usd is null or max_cost_usd >= 0),
  actual_cost_usd numeric(14, 8) check (actual_cost_usd is null or actual_cost_usd >= 0),
  max_duration_ms integer check (max_duration_ms is null or max_duration_ms > 0),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_key, id)
);

create table if not exists public.lab_agent_tasks (
  id text not null,
  workspace_key text not null,
  run_id text not null,
  objective text not null,
  specialist_role text not null,
  status text not null default 'queued' check (status in ('queued', 'blocked', 'running', 'completed', 'failed', 'cancelled')),
  sequence integer not null check (sequence >= 0),
  model text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 1 check (max_attempts between 1 and 5),
  max_cost_usd numeric(14, 8) check (max_cost_usd is null or max_cost_usd >= 0),
  actual_cost_usd numeric(14, 8) check (actual_cost_usd is null or actual_cost_usd >= 0),
  input_data jsonb not null default '{}'::jsonb,
  output_data jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_key, id),
  unique (workspace_key, run_id, id),
  unique (workspace_key, run_id, sequence),
  foreign key (workspace_key, run_id)
    references public.lab_agent_runs(workspace_key, id) on delete cascade
);

create table if not exists public.lab_agent_task_dependencies (
  workspace_key text not null,
  run_id text not null,
  task_id text not null,
  depends_on_task_id text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_key, run_id, task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id),
  foreign key (workspace_key, run_id, task_id)
    references public.lab_agent_tasks(workspace_key, run_id, id) on delete cascade,
  foreign key (workspace_key, run_id, depends_on_task_id)
    references public.lab_agent_tasks(workspace_key, run_id, id) on delete cascade,
  foreign key (workspace_key, run_id)
    references public.lab_agent_runs(workspace_key, id) on delete cascade
);

create table if not exists public.lab_agent_events (
  id bigint generated always as identity primary key,
  workspace_key text not null,
  run_id text not null,
  task_id text,
  sequence bigint not null check (sequence >= 0),
  event_type text not null,
  visibility text not null default 'user' check (visibility in ('user', 'operator')),
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_key, run_id, sequence),
  foreign key (workspace_key, run_id)
    references public.lab_agent_runs(workspace_key, id) on delete cascade,
  foreign key (workspace_key, run_id, task_id)
    references public.lab_agent_tasks(workspace_key, run_id, id) on delete cascade
);

create table if not exists public.lab_agent_artifacts (
  id text not null,
  workspace_key text not null,
  run_id text not null,
  task_id text,
  asset_id text,
  artifact_type text not null,
  title text not null,
  content_data jsonb,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'passed', 'needs_revision', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_key, id),
  foreign key (workspace_key, run_id)
    references public.lab_agent_runs(workspace_key, id) on delete cascade,
  foreign key (workspace_key, run_id, task_id)
    references public.lab_agent_tasks(workspace_key, run_id, id) on delete cascade,
  foreign key (workspace_key, asset_id)
    references public.lab_assets(workspace_key, id) on delete restrict
);

create table if not exists public.lab_agent_approvals (
  id text not null,
  workspace_key text not null,
  run_id text not null,
  task_id text,
  approval_type text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  summary text not null,
  estimated_cost_usd numeric(14, 8) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  requested_by text not null,
  decided_by_user_id text references public.lab_users(clerk_user_id) on delete set null,
  idempotency_key text not null unique,
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_key, id),
  foreign key (workspace_key, run_id)
    references public.lab_agent_runs(workspace_key, id) on delete cascade,
  foreign key (workspace_key, run_id, task_id)
    references public.lab_agent_tasks(workspace_key, run_id, id) on delete cascade
);

create table if not exists public.lab_credit_accounts (
  workspace_key text primary key references public.lab_workspaces(workspace_key) on delete cascade,
  available_credits bigint not null default 0 check (available_credits >= 0),
  reserved_credits bigint not null default 0 check (reserved_credits >= 0),
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_credit_reservations (
  id text primary key,
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  run_id text,
  feature text not null,
  credits bigint not null check (credits > 0),
  status text not null default 'held' check (status in ('held', 'settled', 'released', 'expired')),
  idempotency_key text not null unique,
  expires_at timestamptz not null,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_key, run_id)
    references public.lab_agent_runs(workspace_key, id) on delete restrict
);

create index if not exists idx_lab_assets_workspace_created
  on public.lab_assets(workspace_key, created_at desc) where deleted_at is null;
create index if not exists idx_lab_assets_workspace_project
  on public.lab_assets(workspace_key, project_id, created_at desc) where project_id is not null and deleted_at is null;
create index if not exists idx_lab_agent_runs_workspace_status_created
  on public.lab_agent_runs(workspace_key, status, created_at desc);
create index if not exists idx_lab_agent_runs_owner_created
  on public.lab_agent_runs(owner_id, created_at desc);
create index if not exists idx_lab_agent_tasks_run_status
  on public.lab_agent_tasks(workspace_key, run_id, status, sequence);
create index if not exists idx_lab_agent_events_run_sequence
  on public.lab_agent_events(workspace_key, run_id, sequence);
create index if not exists idx_lab_agent_artifacts_run
  on public.lab_agent_artifacts(workspace_key, run_id, created_at);
create index if not exists idx_lab_agent_approvals_pending
  on public.lab_agent_approvals(workspace_key, created_at) where status = 'pending';
create index if not exists idx_lab_credit_reservations_expiry
  on public.lab_credit_reservations(expires_at) where status = 'held';

alter table public.lab_assets enable row level security;
alter table public.lab_agent_runs enable row level security;
alter table public.lab_agent_tasks enable row level security;
alter table public.lab_agent_task_dependencies enable row level security;
alter table public.lab_agent_events enable row level security;
alter table public.lab_agent_artifacts enable row level security;
alter table public.lab_agent_approvals enable row level security;
alter table public.lab_credit_accounts enable row level security;
alter table public.lab_credit_reservations enable row level security;

drop policy if exists lab_assets_select_workspace on public.lab_assets;
create policy lab_assets_select_workspace on public.lab_assets for select to authenticated
using ((select private.can_access_workspace(workspace_key)) and deleted_at is null);

drop policy if exists lab_agent_runs_select_workspace on public.lab_agent_runs;
create policy lab_agent_runs_select_workspace on public.lab_agent_runs for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

drop policy if exists lab_agent_tasks_select_workspace on public.lab_agent_tasks;
create policy lab_agent_tasks_select_workspace on public.lab_agent_tasks for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

drop policy if exists lab_agent_dependencies_select_workspace on public.lab_agent_task_dependencies;
create policy lab_agent_dependencies_select_workspace on public.lab_agent_task_dependencies for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

drop policy if exists lab_agent_events_select_workspace on public.lab_agent_events;
create policy lab_agent_events_select_workspace on public.lab_agent_events for select to authenticated
using ((select private.can_access_workspace(workspace_key)) and visibility = 'user');

drop policy if exists lab_agent_artifacts_select_workspace on public.lab_agent_artifacts;
create policy lab_agent_artifacts_select_workspace on public.lab_agent_artifacts for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

drop policy if exists lab_agent_approvals_select_workspace on public.lab_agent_approvals;
create policy lab_agent_approvals_select_workspace on public.lab_agent_approvals for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

drop policy if exists lab_credit_accounts_select_workspace on public.lab_credit_accounts;
create policy lab_credit_accounts_select_workspace on public.lab_credit_accounts for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

drop policy if exists lab_credit_reservations_select_workspace on public.lab_credit_reservations;
create policy lab_credit_reservations_select_workspace on public.lab_credit_reservations for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

revoke all on public.lab_assets, public.lab_agent_runs, public.lab_agent_tasks,
  public.lab_agent_task_dependencies, public.lab_agent_events,
  public.lab_agent_artifacts, public.lab_agent_approvals,
  public.lab_credit_accounts, public.lab_credit_reservations from anon, authenticated;

grant select on public.lab_assets, public.lab_agent_runs, public.lab_agent_tasks,
  public.lab_agent_task_dependencies, public.lab_agent_events,
  public.lab_agent_artifacts, public.lab_agent_approvals,
  public.lab_credit_accounts, public.lab_credit_reservations to authenticated;

-- Supabase-specific private object bucket. The guarded dynamic statement keeps
-- this migration portable for local Postgres validation where Storage is absent.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    execute $storage$
      insert into storage.buckets (id, name, public, file_size_limit)
      values ('ai360-private', 'ai360-private', false, 104857600)
      on conflict (id) do update
        set public = excluded.public,
            file_size_limit = excluded.file_size_limit
    $storage$;
  end if;
end
$$;

commit;
