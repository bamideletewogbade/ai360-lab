begin;

-- A project's knowledge base. The frontier "Projects" concept (OpenAI, Anthropic)
-- is a container: files uploaded once are referenced across every conversation
-- and generation inside that project. This is the first container primitive for
-- AI360 projects, which until now held only a generated pack.
--
-- The extracted text is the grounding value, so it lives in Postgres. Original
-- binaries can move to private object storage later without changing this shape:
-- storage_path stays null until then.
create table if not exists public.lab_project_files (
  id text not null,
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  owner_id text not null references public.lab_users(clerk_user_id) on delete cascade,
  project_id text not null,
  name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  char_count integer not null default 0 check (char_count >= 0),
  extracted_text text not null default '',
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_key, id),
  -- A file belongs to exactly one project in the same workspace, and is removed
  -- with it, so a deleted project never leaves orphaned knowledge behind.
  foreign key (workspace_key, project_id)
    references public.lab_studio_projects(workspace_key, id) on delete cascade
);

create index if not exists idx_lab_project_files_project
  on public.lab_project_files(workspace_key, project_id, created_at desc);
create index if not exists idx_lab_project_files_owner
  on public.lab_project_files(owner_id, created_at desc);

alter table public.lab_project_files enable row level security;

drop policy if exists lab_project_files_workspace_access on public.lab_project_files;
create policy lab_project_files_workspace_access on public.lab_project_files for all to authenticated
using ((select private.can_access_workspace(workspace_key)))
with check ((select private.can_access_workspace(workspace_key)) and owner_id = (select private.clerk_user_id()));

revoke all on public.lab_project_files from anon, authenticated;
grant select on public.lab_project_files to authenticated;

commit;
