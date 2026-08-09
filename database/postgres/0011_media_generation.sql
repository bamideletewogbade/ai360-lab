begin;

-- A media job is the durable boundary between a project request and whichever
-- provider currently fulfils it. Provider details can change without changing
-- the customer-facing intent or losing the history of an approved generation.
create table if not exists public.lab_media_jobs (
  id text not null,
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  owner_id text not null references public.lab_users(clerk_user_id) on delete cascade,
  project_id text,
  project_asset_id text,
  media_type text not null check (media_type in ('image', 'video')),
  status text not null default 'queued' check (status in (
    'queued', 'submitted', 'running', 'completed', 'failed', 'cancelled'
  )),
  intent_version integer not null default 1 check (intent_version > 0),
  intent jsonb not null,
  provider text,
  model text,
  provider_job_id text,
  reservation_id text references public.lab_credit_reservations(id) on delete restrict,
  quoted_cost_usd numeric(14, 8) check (quoted_cost_usd is null or quoted_cost_usd >= 0),
  actual_cost_usd numeric(14, 8) check (actual_cost_usd is null or actual_cost_usd >= 0),
  idempotency_key text not null unique,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_key, id)
);

-- Outputs are versioned separately from jobs. A generation may later produce
-- several candidates, and a selected output can remain stable while another
-- revision is generated.
create table if not exists public.lab_media_outputs (
  id text not null,
  workspace_key text not null,
  job_id text not null,
  asset_id text not null,
  version integer not null check (version > 0),
  selected boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (workspace_key, id),
  unique (workspace_key, job_id, version),
  foreign key (workspace_key, job_id)
    references public.lab_media_jobs(workspace_key, id) on delete cascade,
  foreign key (workspace_key, asset_id)
    references public.lab_assets(workspace_key, id) on delete restrict
);

create index if not exists idx_lab_media_jobs_workspace_project
  on public.lab_media_jobs(workspace_key, project_id, created_at desc);
create index if not exists idx_lab_media_jobs_owner_created
  on public.lab_media_jobs(owner_id, created_at desc);
create index if not exists idx_lab_media_jobs_active
  on public.lab_media_jobs(workspace_key, updated_at)
  where status in ('queued', 'submitted', 'running');
create unique index if not exists idx_lab_media_jobs_provider_job
  on public.lab_media_jobs(provider, provider_job_id)
  where provider_job_id is not null;
create index if not exists idx_lab_media_jobs_reservation
  on public.lab_media_jobs(reservation_id)
  where reservation_id is not null;
create index if not exists idx_lab_media_outputs_job
  on public.lab_media_outputs(workspace_key, job_id, version desc);
create index if not exists idx_lab_media_outputs_asset
  on public.lab_media_outputs(workspace_key, asset_id);

alter table public.lab_media_jobs enable row level security;
alter table public.lab_media_outputs enable row level security;

drop policy if exists lab_media_jobs_select_workspace on public.lab_media_jobs;
create policy lab_media_jobs_select_workspace on public.lab_media_jobs for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

drop policy if exists lab_media_outputs_select_workspace on public.lab_media_outputs;
create policy lab_media_outputs_select_workspace on public.lab_media_outputs for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

revoke all on public.lab_media_jobs, public.lab_media_outputs from anon, authenticated;
grant select on public.lab_media_jobs, public.lab_media_outputs to authenticated;

commit;
