begin;

-- Browser screenshots are evidence, not model context. The bytes live in a
-- private Storage bucket; this table owns workspace access, integrity and
-- retention metadata without exposing provider URLs or secrets.
create table if not exists public.lab_browser_artifacts (
  id text not null,
  workspace_key text not null,
  run_id text not null,
  action_id text not null,
  object_path text not null,
  mime_type text not null check (mime_type = 'image/jpeg'),
  byte_length integer not null check (byte_length > 0 and byte_length <= 750000),
  sha256 text not null check (char_length(sha256) = 64),
  expires_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (workspace_key, id),
  unique (object_path),
  unique (workspace_key, action_id),
  foreign key (workspace_key, run_id)
    references public.lab_agent_runs(workspace_key, id) on delete cascade,
  foreign key (workspace_key, action_id)
    references public.lab_agent_actions(workspace_key, id) on delete cascade,
  check (expires_at > created_at)
);

create index if not exists idx_lab_browser_artifacts_expiry
  on public.lab_browser_artifacts(expires_at)
  where deleted_at is null;

alter table public.lab_browser_artifacts enable row level security;
drop policy if exists lab_browser_artifacts_select_workspace on public.lab_browser_artifacts;
create policy lab_browser_artifacts_select_workspace on public.lab_browser_artifacts
  for select to authenticated
  using ((select private.can_access_workspace(workspace_key)));

revoke all on public.lab_browser_artifacts from anon, authenticated;
grant select on public.lab_browser_artifacts to authenticated;

commit;
