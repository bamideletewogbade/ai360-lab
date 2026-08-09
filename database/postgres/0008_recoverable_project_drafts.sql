begin;

-- A project begins before it has deliverables. Keep that unfinished work as a
-- first-class record so a refresh, a second device, or a dropped mobile
-- connection does not force the person to repeat the brief.
create table if not exists public.lab_studio_drafts (
  id text not null,
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  owner_id text not null references public.lab_users(clerk_user_id) on delete cascade,
  draft_data jsonb not null default '{}'::jsonb,
  client_updated_at bigint not null check (client_updated_at >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_key, id)
);

create index if not exists idx_lab_studio_drafts_workspace_updated
  on public.lab_studio_drafts(workspace_key, client_updated_at desc);

alter table public.lab_studio_drafts enable row level security;

drop policy if exists lab_studio_drafts_workspace_access on public.lab_studio_drafts;
create policy lab_studio_drafts_workspace_access on public.lab_studio_drafts for all to authenticated
using ((select private.can_access_workspace(workspace_key)))
with check ((select private.can_access_workspace(workspace_key)));

revoke all on public.lab_studio_drafts from anon, authenticated;
grant select, insert, update, delete on public.lab_studio_drafts to authenticated;

commit;
