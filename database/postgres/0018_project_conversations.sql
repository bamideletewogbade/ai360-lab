begin;

-- Conversations that belong to a project.
--
-- A project has been a container for a generated pack and, since 0012, for
-- knowledge files. The frontier shape (OpenAI, Anthropic) is that a project also
-- holds its own chats: several conversations against one shared brief and
-- knowledge base, so a person can keep "pricing questions" apart from "launch
-- copy" without losing the context both depend on.
--
-- This is deliberately one nullable column rather than a new table. Every
-- conversation already syncs, streams, recovers unfinished runs and is scoped by
-- workspace; a project chat is the same object with an owner. Nothing about an
-- existing conversation changes, and project_id stays null for every row already
-- in the table, so this migration is additive for production data.
alter table public.lab_conversations
  add column if not exists project_id text;

-- A project chat belongs to exactly one project in the same workspace. On
-- delete the link is cleared rather than cascaded: losing a project must never
-- silently destroy the conversations held inside it. The chat simply returns to
-- the person's main list, which is the honest fallback.
alter table public.lab_conversations
  drop constraint if exists lab_conversations_project_fk;
alter table public.lab_conversations
  add constraint lab_conversations_project_fk
  foreign key (workspace_key, project_id)
  references public.lab_studio_projects(workspace_key, id) on delete set null;

-- Listing one project's chats, newest first, is the only new read pattern.
-- Partial, because the overwhelming majority of rows carry no project.
create index if not exists idx_lab_conversations_project
  on public.lab_conversations(workspace_key, project_id, client_updated_at desc)
  where project_id is not null;

commit;
