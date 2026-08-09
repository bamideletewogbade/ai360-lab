begin;

-- Customer feedback is a separate operational domain. Conversation content is
-- included only when the person explicitly chooses an evidence scope.
create table if not exists public.lab_quality_reports (
  id text primary key,
  workspace_key text references public.lab_workspaces(workspace_key) on delete set null,
  reporter_id text references public.lab_users(clerk_user_id) on delete set null,
  report_kind text not null check (report_kind in ('reaction', 'quality', 'safety', 'product')),
  sentiment text check (sentiment is null or sentiment in ('helpful', 'needs_work', 'serious')),
  category text not null check (category in (
    'wrong_or_outdated', 'bad_sources', 'misunderstood', 'broken_action',
    'bias_or_disrespect', 'unsafe_or_harmful', 'security_or_privacy',
    'slow_or_confusing', 'feature_request', 'other'
  )),
  severity text not null check (severity in ('s0', 's1', 's2', 's3', 's4')),
  status text not null default 'received' check (status in (
    'received', 'evaluating', 'human_review', 'fix_planned', 'verified', 'closed'
  )),
  source_surface text not null check (source_surface in ('quick', 'research', 'studio', 'global', 'other')),
  conversation_id text,
  message_id text,
  request_id text,
  run_id text,
  comment text,
  evidence_scope text not null default 'none' check (evidence_scope in ('none', 'response', 'conversation')),
  evidence_excerpt text,
  immediate_risk boolean not null default false,
  contact_allowed boolean not null default false,
  contact_email text,
  reporter_token_hash text not null check (char_length(reporter_token_hash) = 64),
  client_release text,
  ai_summary text,
  ai_category text,
  ai_confidence numeric(4, 3) check (ai_confidence is null or ai_confidence between 0 and 1),
  ai_recommended_action text,
  evaluated_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contact_allowed or contact_email is null),
  check (evidence_scope <> 'none' or evidence_excerpt is null)
);

create table if not exists public.lab_quality_events (
  id bigint generated always as identity primary key,
  report_id text not null references public.lab_quality_reports(id) on delete cascade,
  actor_type text not null check (actor_type in ('customer', 'system', 'ai', 'human')),
  event_type text not null,
  visibility text not null default 'reviewer' check (visibility in ('customer', 'reviewer', 'system')),
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.lab_quality_actions (
  id text primary key,
  report_id text not null references public.lab_quality_reports(id) on delete cascade,
  action_type text not null check (action_type in (
    'alert_human', 'request_clarification', 'create_eval_case',
    'product_review', 'propose_fix', 'contain_capability'
  )),
  status text not null default 'proposed' check (status in (
    'proposed', 'approved', 'running', 'completed', 'rejected', 'failed'
  )),
  proposed_by text not null check (proposed_by in ('rules', 'ai', 'human')),
  requires_human boolean not null default true,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  decided_by_user_id text references public.lab_users(clerk_user_id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, action_type)
);

create table if not exists public.lab_quality_eval_cases (
  id text primary key,
  report_id text not null unique references public.lab_quality_reports(id) on delete restrict,
  status text not null default 'candidate' check (status in ('candidate', 'approved', 'active', 'rejected', 'retired')),
  benchmark text not null,
  task_summary text not null,
  sanitized_input text,
  expected_checks jsonb not null default '[]'::jsonb,
  approved_by_user_id text references public.lab_users(clerk_user_id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The reviewer queue filters by status and then orders urgent cases first.
create index if not exists idx_lab_quality_reports_queue
  on public.lab_quality_reports(status, severity, created_at);
create index if not exists idx_lab_quality_reports_workspace_created
  on public.lab_quality_reports(workspace_key, created_at desc)
  where workspace_key is not null;
create index if not exists idx_lab_quality_reports_request
  on public.lab_quality_reports(request_id)
  where request_id is not null;
create index if not exists idx_lab_quality_reports_category_created
  on public.lab_quality_reports(category, created_at desc);
create index if not exists idx_lab_quality_events_report_created
  on public.lab_quality_events(report_id, created_at);
create index if not exists idx_lab_quality_actions_report_status
  on public.lab_quality_actions(report_id, status, created_at);

alter table public.lab_quality_reports enable row level security;
alter table public.lab_quality_events enable row level security;
alter table public.lab_quality_actions enable row level security;
alter table public.lab_quality_eval_cases enable row level security;

-- A signed-in customer may see their own receipt. Operational details remain
-- behind server-side reviewer authorization.
drop policy if exists lab_quality_reports_select_own on public.lab_quality_reports;
create policy lab_quality_reports_select_own on public.lab_quality_reports for select to authenticated
using (reporter_id = (select private.clerk_user_id()));

drop policy if exists lab_quality_events_select_own on public.lab_quality_events;
create policy lab_quality_events_select_own on public.lab_quality_events for select to authenticated
using (
  visibility = 'customer'
  and exists (
    select 1 from public.lab_quality_reports report
    where report.id = report_id
      and report.reporter_id = (select private.clerk_user_id())
  )
);

revoke all on public.lab_quality_reports, public.lab_quality_events,
  public.lab_quality_actions, public.lab_quality_eval_cases from anon, authenticated;
grant select on public.lab_quality_reports, public.lab_quality_events to authenticated;

commit;
