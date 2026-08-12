begin;

-- Personalization is per member, not per workspace.
--
-- Inside an organization each member keeps their own first-run answer instead of
-- the whole org inheriting the choice of whoever signed in first. Personal
-- workspaces are unchanged: the member is the workspace subject, so there is
-- still exactly one row. Existing rows have a unique workspace_key and so remain
-- unique under the wider key.
alter table public.lab_workspace_onboarding
  drop constraint lab_workspace_onboarding_pkey,
  add constraint lab_workspace_onboarding_pkey primary key (workspace_key, owner_id);

commit;
