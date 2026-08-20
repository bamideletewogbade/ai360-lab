begin;

-- Workspace-wide brand knowledge: the sibling of lab_project_files, scoped to
-- the whole workspace instead of one project. A business's voice and facts
-- apply to every conversation and generated document, not just work inside
-- one project, so this is not keyed to a project the way lab_project_files
-- is. Kept purely by workspace_key (no owner_id in reads) because it is
-- shared context, like the brand kit's colours, not a personal preference.
create table if not exists public.lab_brand_knowledge (
  id text not null,
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  owner_id text not null references public.lab_users(clerk_user_id) on delete cascade,
  name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  char_count integer not null default 0 check (char_count >= 0),
  extracted_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_key, id)
);

create index if not exists idx_lab_brand_knowledge_workspace
  on public.lab_brand_knowledge(workspace_key, created_at desc);

alter table public.lab_brand_knowledge enable row level security;

drop policy if exists lab_brand_knowledge_workspace_access on public.lab_brand_knowledge;
create policy lab_brand_knowledge_workspace_access on public.lab_brand_knowledge for all to authenticated
using ((select private.can_access_workspace(workspace_key)))
with check ((select private.can_access_workspace(workspace_key)) and owner_id = (select private.clerk_user_id()));

revoke all on public.lab_brand_knowledge from anon, authenticated;
grant select on public.lab_brand_knowledge to authenticated;

-- A workspace's logo is stored as an ordinary lab_assets row (asset_kind
-- 'upload', same private bucket every generated file already uses) and
-- referenced here so a document build knows which asset to fetch and embed.
-- No formal foreign key: lab_assets' primary key is composite
-- (workspace_key, id), and every other loose reference to it in this schema
-- (lab_media_outputs.asset_id included) is a plain column checked at read
-- time rather than a declared FK, so this matches existing practice.
alter table public.lab_brand_kits add column if not exists logo_asset_id text;

-- Setting a logo must not require setting colours first. The original
-- migration made both colours mandatory because a kit only ever meant
-- colours at the time; a logo-only kit is now a real, valid row. The hex
-- format check constraints already tolerate this — a check constraint only
-- rejects a value that evaluates to false, and `null ~* pattern` evaluates
-- to null, not false, so a null colour was already going to pass them.
alter table public.lab_brand_kits alter column primary_color drop not null;
alter table public.lab_brand_kits alter column accent_color drop not null;

commit;
