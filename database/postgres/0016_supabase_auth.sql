-- AI360 now uses Supabase Auth as the identity authority.
--
-- The durable tables keep the historical `clerk_user_id` column name for
-- compatibility with applied migrations and foreign keys. From this migration
-- onward, that column stores the authenticated subject (`auth.jwt()->>'sub'`),
-- which is the Supabase Auth user UUID for new accounts.

create or replace function private.auth_user_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

create or replace function private.clerk_user_id()
returns text
language sql
stable
as $$
  select private.auth_user_id()
$$;

create or replace function private.clerk_org_id()
returns text
language sql
stable
as $$
  select null::text
$$;

comment on column public.lab_users.clerk_user_id is
  'Legacy column name. Stores the external auth subject; for Supabase Auth this is auth.users.id.';

comment on function private.clerk_user_id() is
  'Legacy RLS helper retained for applied policies. Returns the Supabase Auth JWT subject.';

grant execute on function private.auth_user_id() to authenticated;
grant execute on function private.clerk_user_id() to authenticated;
grant execute on function private.clerk_org_id() to authenticated;
