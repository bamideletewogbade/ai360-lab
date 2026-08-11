begin;

-- Personalization that follows a person across devices.
--
-- The two-question first-run intake was remembered only in the browser, so a
-- signed-in person lost their personalization on a new device, and a shared
-- browser could not tell two people apart. This stores the outcome per
-- workspace, so the answer a person gives once is theirs everywhere they sign
-- in. Guests are unaffected: they have no workspace and stay local until they
-- sign in, at which point the client promotes their guest choice here.
create table if not exists public.lab_workspace_onboarding (
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  owner_id text not null references public.lab_users(clerk_user_id) on delete cascade,
  -- 'completed' carries a role and goal; 'skipped' records a deliberate decline
  -- so the intake never returns on its own.
  status text not null check (status in ('completed', 'skipped')),
  role text check (role in ('student', 'professional', 'entrepreneur', 'organization')),
  goal text check (goal in ('learn', 'write', 'research', 'business')),
  -- A completed record must carry both answers; a skip carries neither. This
  -- keeps the row self-consistent with the client contract.
  constraint lab_workspace_onboarding_shape check (
    (status = 'completed' and role is not null and goal is not null) or
    (status = 'skipped' and role is null and goal is null)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_key)
);

create index if not exists idx_lab_workspace_onboarding_owner
  on public.lab_workspace_onboarding(owner_id);

alter table public.lab_workspace_onboarding enable row level security;

drop policy if exists lab_workspace_onboarding_workspace_access on public.lab_workspace_onboarding;
create policy lab_workspace_onboarding_workspace_access on public.lab_workspace_onboarding for all to authenticated
using ((select private.can_access_workspace(workspace_key)))
with check ((select private.can_access_workspace(workspace_key)) and owner_id = (select private.clerk_user_id()));

revoke all on public.lab_workspace_onboarding from anon, authenticated;
grant select on public.lab_workspace_onboarding to authenticated;

commit;
