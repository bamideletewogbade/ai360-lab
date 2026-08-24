begin;

-- Immutable operator history for every privileged balance change. Credit
-- entries remain the financial source of truth; this table answers who made
-- the change, why, and what they saw before confirming it.
create table if not exists public.lab_admin_audit_events (
  id text primary key,
  actor_id text references public.lab_users(clerk_user_id) on delete set null,
  target_workspace_key text references public.lab_workspaces(workspace_key) on delete set null,
  action text not null check (action in ('credit_grant', 'credit_refund')),
  credits_delta bigint not null check (credits_delta > 0),
  balance_before bigint not null check (balance_before >= 0),
  balance_after bigint not null check (balance_after >= 0),
  reason text not null check (char_length(reason) between 3 and 240),
  request_id text not null,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lab_admin_audit_events_target_created
  on public.lab_admin_audit_events(target_workspace_key, created_at desc);
create index if not exists idx_lab_admin_audit_events_actor_created
  on public.lab_admin_audit_events(actor_id, created_at desc)
  where actor_id is not null;

alter table public.lab_admin_audit_events enable row level security;
revoke all on public.lab_admin_audit_events from public, anon, authenticated;

commit;
