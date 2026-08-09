begin;

-- A browser session is an isolated execution environment, never the durable
-- owner of a run. Signed live-view URLs and credentials are deliberately not
-- stored here.
create table if not exists public.lab_browser_sessions (
  id text not null,
  workspace_key text not null,
  run_id text not null,
  provider text not null,
  provider_session_id text not null,
  status text not null default 'starting' check (status in (
    'starting', 'ready', 'running', 'awaiting_takeover', 'closed', 'expired', 'failed'
  )),
  allowed_domains text[] not null default '{}',
  last_url text,
  started_at timestamptz,
  expires_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_key, id),
  unique (provider, provider_session_id),
  foreign key (workspace_key, run_id)
    references public.lab_agent_runs(workspace_key, id) on delete cascade,
  check (expires_at > created_at)
);

-- One row per proposed action gives retries, approvals and verification a
-- stable identity. Input is sanitized before storage and never contains
-- passwords, OTP values, payment credentials or raw screenshots.
create table if not exists public.lab_agent_actions (
  id text not null,
  workspace_key text not null,
  run_id text not null,
  task_id text,
  browser_session_id text,
  sequence bigint not null check (sequence >= 0),
  action_kind text not null check (action_kind in (
    'observe_dom', 'screenshot', 'navigate', 'click', 'type', 'scroll', 'wait',
    'upload', 'download', 'submit', 'external_write', 'ask_user', 'finish'
  )),
  capability text not null check (capability in (
    'browser.observe', 'browser.navigate', 'browser.interact',
    'browser.transfer', 'external.write', 'desktop.control', 'orchestration.control'
  )),
  risk text not null check (risk in ('passive', 'reversible', 'consequential', 'prohibited')),
  status text not null default 'proposed' check (status in (
    'proposed', 'awaiting_approval', 'approved', 'executing',
    'completed', 'failed', 'rejected', 'blocked', 'cancelled'
  )),
  target text,
  payload_hash text not null check (char_length(payload_hash) = 64),
  sanitized_input jsonb not null default '{}'::jsonb,
  result_data jsonb,
  expected_outcome text not null,
  verification_status text not null default 'pending' check (verification_status in (
    'pending', 'passed', 'failed', 'not_applicable'
  )),
  approval_id text,
  idempotency_key text not null unique,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_key, id),
  unique (workspace_key, run_id, sequence),
  foreign key (workspace_key, run_id)
    references public.lab_agent_runs(workspace_key, id) on delete cascade,
  foreign key (workspace_key, run_id, task_id)
    references public.lab_agent_tasks(workspace_key, run_id, id) on delete cascade,
  foreign key (workspace_key, browser_session_id)
    references public.lab_browser_sessions(workspace_key, id) on delete set null,
  foreign key (workspace_key, approval_id)
    references public.lab_agent_approvals(workspace_key, id) on delete restrict
);

-- Bind a decision to one immutable action payload. Existing plan approvals can
-- leave these fields null; action approvals must populate all of them.
alter table public.lab_agent_approvals
  add column if not exists action_id text,
  add column if not exists action_kind text,
  add column if not exists target text,
  add column if not exists payload_hash text,
  add column if not exists approval_scope jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lab_agent_approvals_payload_hash_check'
      and conrelid = 'public.lab_agent_approvals'::regclass
  ) then
    alter table public.lab_agent_approvals
      add constraint lab_agent_approvals_payload_hash_check
      check (payload_hash is null or char_length(payload_hash) = 64);
  end if;
end
$$;

create index if not exists idx_lab_browser_sessions_active
  on public.lab_browser_sessions(workspace_key, expires_at)
  where status in ('starting', 'ready', 'running', 'awaiting_takeover');
create index if not exists idx_lab_agent_actions_run_sequence
  on public.lab_agent_actions(workspace_key, run_id, sequence);
create index if not exists idx_lab_agent_actions_approval_queue
  on public.lab_agent_actions(workspace_key, created_at)
  where status = 'awaiting_approval';
alter table public.lab_browser_sessions enable row level security;
alter table public.lab_agent_actions enable row level security;

drop policy if exists lab_browser_sessions_select_workspace on public.lab_browser_sessions;
create policy lab_browser_sessions_select_workspace on public.lab_browser_sessions for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

drop policy if exists lab_agent_actions_select_workspace on public.lab_agent_actions;
create policy lab_agent_actions_select_workspace on public.lab_agent_actions for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

revoke all on public.lab_browser_sessions, public.lab_agent_actions from anon, authenticated;
grant select on public.lab_browser_sessions, public.lab_agent_actions to authenticated;

commit;
