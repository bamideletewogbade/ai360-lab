begin;

-- Pilot participation is a program attribute, not a separate product area.
-- Keeping it in a dedicated admin-only table lets operators segment people,
-- track follow-up state, and run deliberate cohort actions without changing
-- the customer account itself.
create table if not exists public.lab_admin_program_memberships (
  program_key text not null,
  user_id text not null references public.lab_users(clerk_user_id) on delete cascade,
  cohort_key text,
  participation_status text not null default 'enrolled'
    check (participation_status in ('invited', 'enrolled', 'activated', 'returning', 'completed', 'withdrawn')),
  feedback_status text not null default 'not_requested'
    check (feedback_status in ('not_requested', 'requested', 'received', 'reviewed')),
  email_status text not null default 'contactable'
    check (email_status in ('contactable', 'unsubscribed', 'suppressed')),
  assigned_to text references public.lab_users(clerk_user_id) on delete set null,
  next_follow_up_at timestamptz,
  internal_note text check (internal_note is null or char_length(internal_note) <= 1000),
  invited_at timestamptz,
  enrolled_at timestamptz,
  last_contacted_at timestamptz,
  contact_count integer not null default 0 check (contact_count >= 0),
  created_by text references public.lab_users(clerk_user_id) on delete set null,
  updated_by text references public.lab_users(clerk_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (program_key, user_id),
  check (char_length(program_key) between 2 and 80),
  check (cohort_key is null or char_length(cohort_key) between 2 and 120)
);

create index if not exists idx_lab_admin_program_memberships_segment
  on public.lab_admin_program_memberships(program_key, participation_status, cohort_key, updated_at desc);
create index if not exists idx_lab_admin_program_memberships_follow_up
  on public.lab_admin_program_memberships(next_follow_up_at)
  where next_follow_up_at is not null and participation_status not in ('completed', 'withdrawn');
create index if not exists idx_lab_admin_program_memberships_assignee
  on public.lab_admin_program_memberships(assigned_to, updated_at desc)
  where assigned_to is not null;

create table if not exists public.lab_admin_program_events (
  id text primary key,
  program_key text not null,
  user_id text not null references public.lab_users(clerk_user_id) on delete cascade,
  actor_id text references public.lab_users(clerk_user_id) on delete set null,
  action text not null check (action in ('membership_updated', 'membership_removed')),
  reason text not null check (char_length(reason) between 3 and 240),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lab_admin_program_events_member_created
  on public.lab_admin_program_events(program_key, user_id, created_at desc);

-- One row per recipient and action. This is both contact history and a durable
-- delivery audit; recipients are never bundled into a shared provider message.
create table if not exists public.lab_admin_contact_events (
  id text primary key,
  program_key text not null,
  user_id text not null,
  actor_id text references public.lab_users(clerk_user_id) on delete set null,
  channel text not null check (channel in ('email', 'manual')),
  template_key text not null,
  subject text not null check (char_length(subject) between 1 and 200),
  delivery_status text not null
    check (delivery_status in ('prepared', 'sent', 'failed', 'skipped')),
  recipient_email text,
  provider_message_id text,
  failure_reason text,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (program_key, user_id)
    references public.lab_admin_program_memberships(program_key, user_id) on delete cascade
);

create index if not exists idx_lab_admin_contact_events_member_created
  on public.lab_admin_contact_events(program_key, user_id, created_at desc);
create index if not exists idx_lab_admin_contact_events_actor_created
  on public.lab_admin_contact_events(actor_id, created_at desc)
  where actor_id is not null;

-- Existing sponsored-seat grants become pilot participants automatically.
-- Subsequent grants are handled by the admin operation endpoint.
insert into public.lab_admin_program_memberships
  (program_key, user_id, cohort_key, participation_status, enrolled_at, created_at, updated_at)
select 'pilot', sponsored.user_id, sponsored.cohort_key, 'enrolled', sponsored.granted_at, sponsored.granted_at, now()
  from (
    select distinct on (workspace.subject_id)
           workspace.subject_id as user_id, ledger.source_id as cohort_key, ledger.created_at as granted_at
      from public.lab_credit_ledger ledger
      join public.lab_workspaces workspace on workspace.workspace_key = ledger.workspace_key
     where ledger.source_type = 'sponsored_seat'
       and ledger.entry_type = 'grant'
       and ledger.credits_delta > 0
       and workspace.workspace_type = 'user'
     order by workspace.subject_id, ledger.created_at desc
  ) sponsored
on conflict (program_key, user_id) do nothing;

alter table public.lab_admin_program_memberships enable row level security;
alter table public.lab_admin_program_events enable row level security;
alter table public.lab_admin_contact_events enable row level security;
revoke all on public.lab_admin_program_memberships from public, anon, authenticated;
revoke all on public.lab_admin_program_events from public, anon, authenticated;
revoke all on public.lab_admin_contact_events from public, anon, authenticated;

commit;
