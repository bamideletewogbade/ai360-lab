begin;

-- What happens to someone BEFORE they become measurable.
--
-- `lab_usage_events` records provider work, so the moment a person types their
-- first prompt they become visible in detail. Everything earlier — the click on
-- an invitation, the landing, the abandoned sign-up form — leaves no trace at
-- all, and that is where most people are lost.
--
-- Without it, one number ("41 of 63 never activated") has three explanations
-- that demand opposite responses: the mail was never opened, the sign-up broke,
-- or the product did not convince them. Only the third is a reason to change
-- the product, and it is the most expensive to act on wrongly.
--
-- Deliberately NOT recorded here: anything after the workspace opens. Prompts,
-- outcomes, exports and return visits are already in `lab_usage_events` and
-- friends, and duplicating them would create a second version of a number that
-- can disagree with the first. The funnel report joins the two.
--
-- Deliberately NOT recorded ever: prompt or response content, names, email
-- addresses, IP addresses or full referrer URLs. A row says that a step
-- happened, when, on what class of device, and — when an invitation link
-- carried its id — which invited person it belonged to.
create table if not exists public.lab_funnel_events (
  id bigint generated always as identity primary key,

  -- An opaque random value minted in the browser on first arrival. It carries
  -- no meaning off this table; its only job is to let an anonymous landing and
  -- a later sign-in be recognised as the same visit.
  visitor_key text not null check (char_length(visitor_key) between 8 and 64),

  step text not null check (step in (
    'invite_clicked', 'landing_viewed', 'signup_started', 'signup_completed', 'workspace_entered'
  )),

  -- Set when the person arrived through an invitation link. This is what turns
  -- an anonymous drop-off into "Sylvanus stalled at sign-up", which at pilot
  -- sizes is a phone call rather than a statistic.
  invitation_id text references public.lab_admin_invitations(id) on delete set null,

  -- Known only once a session exists. Earlier rows share the visitor key, which
  -- is how a pre-sign-up landing is attributed after the fact.
  user_id text references public.lab_users(clerk_user_id) on delete set null,
  workspace_key text references public.lab_workspaces(workspace_key) on delete set null,

  surface text check (surface is null or surface in ('mobile', 'tablet', 'desktop')),
  -- Host only. A full referrer can carry a query string, and query strings carry
  -- other people's personal data.
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 120),

  occurred_at timestamptz not null default now(),

  -- One row per visitor per step: the table answers "how far did this person
  -- get", not "how many times did they refresh". A repeat is dropped by the
  -- unique index rather than counted.
  unique (visitor_key, step)
);

create index if not exists idx_lab_funnel_events_step_occurred
  on public.lab_funnel_events(step, occurred_at desc);

create index if not exists idx_lab_funnel_events_invitation
  on public.lab_funnel_events(invitation_id)
  where invitation_id is not null;

create index if not exists idx_lab_funnel_events_user
  on public.lab_funnel_events(user_id)
  where user_id is not null;

comment on table public.lab_funnel_events is
  'Pre-activation journey steps: invitation click through to workspace entry. Post-activation behaviour lives in lab_usage_events; the funnel report joins both. Never stores content or personal data.';

-- Written by the server through the service role only. A client posts to
-- /api/funnel, which validates the step and stamps identity itself; no browser
-- role may write here directly, or the funnel could be forged.
alter table public.lab_funnel_events enable row level security;
revoke all on public.lab_funnel_events from anon, authenticated;

commit;
