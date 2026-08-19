begin;

-- A workspace's own colours, applied to every document it generates.
--
-- Generated PDF, Word, Excel and PowerPoint files were fixed to AI360's own
-- black-and-paper look regardless of who asked for them. One workspace-level
-- kit — a primary and an accent colour — lets a document look like the
-- business that asked for it instead of like AI360's own product. A project
-- with its own brand colours (set during the Create coordinator flow) takes
-- precedence over this at generation time; this is the fallback every other
-- document uses. Kept to two colours deliberately: body text stays a fixed,
-- readable neutral so a document can never come out illegible.
create table if not exists public.lab_brand_kits (
  workspace_key text not null references public.lab_workspaces(workspace_key) on delete cascade,
  owner_id text not null references public.lab_users(clerk_user_id) on delete cascade,
  primary_color text not null,
  accent_color text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lab_brand_kits_primary_color_hex check (primary_color ~* '^#[0-9a-f]{6}$'),
  constraint lab_brand_kits_accent_color_hex check (accent_color ~* '^#[0-9a-f]{6}$'),
  primary key (workspace_key)
);

create index if not exists idx_lab_brand_kits_owner
  on public.lab_brand_kits(owner_id);

alter table public.lab_brand_kits enable row level security;

drop policy if exists lab_brand_kits_workspace_access on public.lab_brand_kits;
create policy lab_brand_kits_workspace_access on public.lab_brand_kits for all to authenticated
using ((select private.can_access_workspace(workspace_key)))
with check ((select private.can_access_workspace(workspace_key)) and owner_id = (select private.clerk_user_id()));

revoke all on public.lab_brand_kits from anon, authenticated;
grant select on public.lab_brand_kits to authenticated;

commit;
