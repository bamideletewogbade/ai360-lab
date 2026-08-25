begin;

-- Everything in the admin module so far is user-first: a person signs in,
-- `ensureWorkspaceRecord` creates their `lab_users` row, and only then can an
-- operator segment, email, or fund them. Recruiting a pilot runs the other way
-- round — an operator holds a list of addresses and needs to act on people who
-- have no account yet.
--
-- This table is the only one in the module keyed on an email address rather
-- than a user id. It holds the intent to enrol someone until they actually
-- arrive, at which point the row is claimed and the relationship moves to
-- `lab_admin_program_memberships` where the rest of the module can see it.
--
-- Emails are stored already lower-cased so the claim lookup on sign-in is a
-- plain index probe, and so `(program_key, email)` uniquely identifies an
-- invitation without depending on the citext extension. The application layer
-- does the real address validation; the checks here only stop obvious junk.
create table if not exists public.lab_admin_invitations (
  id text primary key,
  program_key text not null,
  email text not null,
  display_name text,
  cohort_key text,
  -- The stage the membership is created in once the invitation is claimed.
  -- Deliberately narrower than the full participation vocabulary: an invitation
  -- can only ever start someone at the beginning of the funnel.
  participation_status text not null default 'enrolled'
    check (participation_status in ('invited', 'enrolled')),
  starting_credits integer not null default 0
    check (starting_credits between 0 and 10000),
  -- 'pending' covers both "never sent" and "send failed, retry available"; the
  -- attempt and its failure reason live in the event table. A terminal failure
  -- state would only have to be cleared by hand before a resend.
  invite_status text not null default 'pending'
    check (invite_status in ('pending', 'sent', 'accepted', 'bounced', 'revoked')),
  claimed_user_id text references public.lab_users(clerk_user_id) on delete set null,
  invited_by text references public.lab_users(clerk_user_id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 240),
  -- The import batch this row arrived in, so an operator can review or revoke a
  -- single upload without guessing at timestamps.
  import_key text,
  sent_at timestamptz,
  accepted_at timestamptz,
  last_attempt_at timestamptz,
  send_attempts integer not null default 0 check (send_attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_key, email),
  check (char_length(program_key) between 2 and 80),
  check (cohort_key is null or char_length(cohort_key) between 2 and 120),
  check (char_length(email) between 3 and 254),
  check (email = lower(email)),
  check (position('@' in email) > 1),
  -- A claimed invitation must record who claimed it and when, so the funnel
  -- counts cannot drift from the membership table.
  check (
    (invite_status = 'accepted') = (claimed_user_id is not null)
    and (invite_status = 'accepted') = (accepted_at is not null)
  )
);

-- The sign-in claim path: one probe per newly created account, so it is kept
-- narrow to the states that can still be claimed.
create index if not exists idx_lab_admin_invitations_claimable
  on public.lab_admin_invitations(email, program_key)
  where invite_status in ('pending', 'sent');

-- Console listing: pending invitations beside real users, newest first.
create index if not exists idx_lab_admin_invitations_program_status
  on public.lab_admin_invitations(program_key, invite_status, created_at desc);

create index if not exists idx_lab_admin_invitations_import
  on public.lab_admin_invitations(import_key, created_at desc)
  where import_key is not null;

create index if not exists idx_lab_admin_invitations_claimed_user
  on public.lab_admin_invitations(claimed_user_id)
  where claimed_user_id is not null;

-- Invitation mail cannot use `lab_admin_contact_events`: that table's composite
-- foreign key requires an existing membership, which by definition an invitee
-- does not have. So this table is both the invitation audit trail and the
-- delivery ledger for the mail sent before an account exists, and it carries
-- the same claim/finish delivery columns. Once an invitation is accepted, all
-- further contact is recorded in `lab_admin_contact_events` as usual.
create table if not exists public.lab_admin_invitation_events (
  id text primary key,
  invitation_id text not null references public.lab_admin_invitations(id) on delete cascade,
  actor_id text references public.lab_users(clerk_user_id) on delete set null,
  action text not null
    check (action in ('imported', 'invited', 'resent', 'accepted', 'revoked', 'bounced')),
  -- Set only for the actions that send mail; null for lifecycle events.
  delivery_status text
    check (delivery_status is null or delivery_status in ('prepared', 'sent', 'failed', 'skipped')),
  recipient_email text,
  provider_message_id text,
  failure_reason text,
  reason text check (reason is null or char_length(reason) <= 240),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lab_admin_invitation_events_invitation_created
  on public.lab_admin_invitation_events(invitation_id, created_at desc);
create index if not exists idx_lab_admin_invitation_events_actor_created
  on public.lab_admin_invitation_events(actor_id, created_at desc)
  where actor_id is not null;

alter table public.lab_admin_invitations enable row level security;
alter table public.lab_admin_invitation_events enable row level security;
revoke all on public.lab_admin_invitations from public, anon, authenticated;
revoke all on public.lab_admin_invitation_events from public, anon, authenticated;

commit;
