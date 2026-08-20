begin;

-- Supabase grants table and view privileges to `anon` and `authenticated`
-- explicitly through its default privileges. Revoking from `public` in 0019
-- therefore did not remove those role-specific grants. Spend data is an
-- operator-only concern, so close both browser-facing roles explicitly.
revoke all on public.lab_cost_ledger from public, anon, authenticated;

-- `owner_id` is a cascading foreign key. Postgres does not add an index for a
-- foreign key automatically; without this, deleting a user would scan the
-- entire workspace knowledge table while holding locks.
create index if not exists idx_lab_brand_knowledge_owner
  on public.lab_brand_knowledge(owner_id);

commit;

