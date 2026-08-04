begin;

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.lab_users (
  clerk_user_id text primary key,
  email text,
  display_name text,
  image_url text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_workspaces (
  workspace_key text primary key,
  workspace_type text not null check (workspace_type in ('user', 'organization')),
  subject_id text not null,
  created_by_user_id text references public.lab_users(clerk_user_id) on delete set null,
  display_name text,
  slug text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_type, subject_id)
);

create table if not exists public.lab_workspace_memberships (
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  user_id text not null references public.lab_users(clerk_user_id) on delete cascade,
  role text not null default 'org:member',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_key, user_id)
);

create table if not exists public.lab_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.lab_conversations (
  id text not null,
  owner_id text not null references public.lab_users(clerk_user_id) on delete cascade,
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  title text not null,
  model text not null default 'auto',
  experience text not null default 'chat' check (experience in ('chat', 'agent', 'studio')),
  client_updated_at bigint not null check (client_updated_at >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_key, id)
);

create table if not exists public.lab_messages (
  id text not null,
  owner_id text not null references public.lab_users(clerk_user_id) on delete cascade,
  workspace_key text not null,
  conversation_id text not null,
  position integer not null check (position >= 0),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  primary key (workspace_key, id),
  unique (workspace_key, conversation_id, position),
  foreign key (workspace_key, conversation_id)
    references public.lab_conversations(workspace_key, id) on delete cascade
);

create table if not exists public.lab_studio_projects (
  id text not null,
  owner_id text not null references public.lab_users(clerk_user_id) on delete cascade,
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  name text not null,
  project_data jsonb not null,
  client_updated_at bigint not null check (client_updated_at >= 0),
  archived_at bigint check (archived_at is null or archived_at >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_key, id)
);

create table if not exists public.lab_usage_events (
  id bigint generated always as identity primary key,
  owner_id text references public.lab_users(clerk_user_id) on delete set null,
  workspace_key text references public.lab_workspaces(workspace_key) on delete set null,
  request_id text not null,
  route text not null,
  feature text not null,
  provider text,
  model text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_usd numeric(14, 8) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  actual_cost_usd numeric(14, 8) check (actual_cost_usd is null or actual_cost_usd >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  outcome text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, route)
);

create table if not exists public.lab_billing_customers (
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  provider text not null,
  provider_customer_id text not null,
  currency text not null default 'GHS' check (char_length(currency) = 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_key, provider),
  unique (provider, provider_customer_id)
);

create table if not exists public.lab_payment_attempts (
  id text primary key,
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  owner_id text not null references public.lab_users(clerk_user_id) on delete cascade,
  provider text not null,
  provider_reference text,
  idempotency_key text not null unique,
  plan_slug text not null,
  cadence text not null check (cadence in ('monthly', 'annual', 'one_time')),
  payment_method text not null default 'unknown' check (payment_method in ('mobile_money', 'card', 'bank', 'unknown')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'GHS' check (char_length(currency) = 3),
  status text not null default 'created',
  failure_code text,
  checkout_url text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create table if not exists public.lab_subscriptions (
  id text primary key,
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  provider text not null,
  provider_subscription_id text,
  plan_slug text not null,
  catalog_version text not null,
  cadence text not null check (cadence in ('monthly', 'annual')),
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create table if not exists public.lab_credit_ledger (
  id bigint generated always as identity primary key,
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  entry_type text not null check (entry_type in ('grant', 'reservation', 'settlement', 'release', 'top_up', 'refund', 'adjustment', 'expiry')),
  credits_delta bigint not null,
  balance_after bigint not null check (balance_after >= 0),
  source_type text not null,
  source_id text not null,
  idempotency_key text not null unique,
  expires_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.lab_billing_webhook_events (
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload_hash text not null check (char_length(payload_hash) = 64),
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create index if not exists idx_lab_workspaces_created_by on public.lab_workspaces(created_by_user_id);
create index if not exists idx_lab_memberships_user_status on public.lab_workspace_memberships(user_id, status);
create index if not exists idx_lab_webhooks_type_processed on public.lab_webhook_events(event_type, processed_at);
create index if not exists idx_lab_conversations_workspace_updated on public.lab_conversations(workspace_key, client_updated_at desc);
create index if not exists idx_lab_conversations_owner_updated on public.lab_conversations(owner_id, client_updated_at desc);
create index if not exists idx_lab_messages_owner on public.lab_messages(owner_id);
create index if not exists idx_lab_projects_workspace_updated on public.lab_studio_projects(workspace_key, client_updated_at desc);
create index if not exists idx_lab_projects_workspace_archive on public.lab_studio_projects(workspace_key, archived_at, client_updated_at desc);
create index if not exists idx_lab_projects_owner_updated on public.lab_studio_projects(owner_id, client_updated_at desc);
create index if not exists idx_lab_usage_workspace_created on public.lab_usage_events(workspace_key, created_at desc);
create index if not exists idx_lab_usage_owner_created on public.lab_usage_events(owner_id, created_at desc);
create index if not exists idx_lab_payment_workspace_created on public.lab_payment_attempts(workspace_key, created_at desc);
create index if not exists idx_lab_payment_status_updated on public.lab_payment_attempts(status, updated_at desc);
create index if not exists idx_lab_subscription_workspace_status on public.lab_subscriptions(workspace_key, status);
create index if not exists idx_lab_credit_workspace_created on public.lab_credit_ledger(workspace_key, created_at desc);
create index if not exists idx_lab_credit_expiry on public.lab_credit_ledger(expires_at) where expires_at is not null;
create index if not exists idx_lab_billing_webhooks_processed on public.lab_billing_webhook_events(processed_at);

create or replace function private.clerk_user_id()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif((select auth.jwt())->>'sub', '')
$$;

create or replace function private.clerk_org_id()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif((select auth.jwt())->>'org_id', ''),
    nullif((select auth.jwt())->'o'->>'id', '')
  )
$$;

create or replace function private.can_access_workspace(target_workspace_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lab_workspaces workspace
    where workspace.workspace_key = target_workspace_key
      and workspace.deleted_at is null
      and (
        (workspace.workspace_type = 'user' and workspace.subject_id = private.clerk_user_id())
        or
        (workspace.workspace_type = 'organization' and workspace.subject_id = private.clerk_org_id())
      )
  )
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.clerk_user_id() to authenticated;
grant execute on function private.clerk_org_id() to authenticated;
grant execute on function private.can_access_workspace(text) to authenticated;

alter table public.lab_users enable row level security;
alter table public.lab_workspaces enable row level security;
alter table public.lab_workspace_memberships enable row level security;
alter table public.lab_webhook_events enable row level security;
alter table public.lab_conversations enable row level security;
alter table public.lab_messages enable row level security;
alter table public.lab_studio_projects enable row level security;
alter table public.lab_usage_events enable row level security;
alter table public.lab_billing_customers enable row level security;
alter table public.lab_payment_attempts enable row level security;
alter table public.lab_subscriptions enable row level security;
alter table public.lab_credit_ledger enable row level security;
alter table public.lab_billing_webhook_events enable row level security;

drop policy if exists lab_users_select_self on public.lab_users;
create policy lab_users_select_self on public.lab_users for select to authenticated
using (clerk_user_id = (select private.clerk_user_id()));

drop policy if exists lab_workspaces_select_current on public.lab_workspaces;
create policy lab_workspaces_select_current on public.lab_workspaces for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

drop policy if exists lab_memberships_select_self on public.lab_workspace_memberships;
create policy lab_memberships_select_self on public.lab_workspace_memberships for select to authenticated
using (user_id = (select private.clerk_user_id()));

drop policy if exists lab_conversations_workspace_access on public.lab_conversations;
create policy lab_conversations_workspace_access on public.lab_conversations for all to authenticated
using ((select private.can_access_workspace(workspace_key)))
with check ((select private.can_access_workspace(workspace_key)) and owner_id = (select private.clerk_user_id()));

drop policy if exists lab_messages_workspace_access on public.lab_messages;
create policy lab_messages_workspace_access on public.lab_messages for all to authenticated
using ((select private.can_access_workspace(workspace_key)))
with check ((select private.can_access_workspace(workspace_key)) and owner_id = (select private.clerk_user_id()));

drop policy if exists lab_projects_workspace_access on public.lab_studio_projects;
create policy lab_projects_workspace_access on public.lab_studio_projects for all to authenticated
using ((select private.can_access_workspace(workspace_key)))
with check ((select private.can_access_workspace(workspace_key)) and owner_id = (select private.clerk_user_id()));

drop policy if exists lab_usage_select_workspace on public.lab_usage_events;
create policy lab_usage_select_workspace on public.lab_usage_events for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

drop policy if exists lab_billing_customers_select_workspace on public.lab_billing_customers;
create policy lab_billing_customers_select_workspace on public.lab_billing_customers for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

drop policy if exists lab_payment_attempts_select_workspace on public.lab_payment_attempts;
create policy lab_payment_attempts_select_workspace on public.lab_payment_attempts for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

drop policy if exists lab_subscriptions_select_workspace on public.lab_subscriptions;
create policy lab_subscriptions_select_workspace on public.lab_subscriptions for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

drop policy if exists lab_credit_ledger_select_workspace on public.lab_credit_ledger;
create policy lab_credit_ledger_select_workspace on public.lab_credit_ledger for select to authenticated
using ((select private.can_access_workspace(workspace_key)));

revoke all on all tables in schema public from anon, authenticated;
grant select on public.lab_users, public.lab_workspaces, public.lab_workspace_memberships,
  public.lab_usage_events, public.lab_billing_customers, public.lab_payment_attempts,
  public.lab_subscriptions, public.lab_credit_ledger to authenticated;
grant select, insert, update, delete on public.lab_conversations, public.lab_messages,
  public.lab_studio_projects to authenticated;

commit;
