-- Preserve the exact allowance grant a reservation drew from. Calendar months
-- alone cannot distinguish a plan replacement or a payment retry in the same
-- month, and may accidentally turn expiring allowance into permanent credit.
alter table public.lab_credit_accounts
  add column if not exists allowance_grant_id text;

alter table public.lab_credit_reservations
  add column if not exists allowance_grant_id text;

update public.lab_credit_accounts
   set allowance_grant_id = 'legacy:' || workspace_key || ':' || allowance_period
 where allowance_grant_id is null
   and allowance_period is not null
   and allowance_credits > 0;

update public.lab_credit_reservations r
   set allowance_grant_id = a.allowance_grant_id
  from public.lab_credit_accounts a
 where r.workspace_key = a.workspace_key
   and r.status = 'held'
   and r.allowance_drawn > 0
   and r.allowance_grant_id is null
   and a.allowance_period = to_char(r.created_at at time zone 'UTC', 'YYYY-MM');

alter table public.lab_credit_accounts
  drop constraint if exists lab_credit_accounts_allowance_grant_id_check;
alter table public.lab_credit_accounts
  add constraint lab_credit_accounts_allowance_grant_id_check
  check (allowance_grant_id is null or char_length(allowance_grant_id) between 1 and 160);

alter table public.lab_credit_reservations
  drop constraint if exists lab_credit_reservations_allowance_grant_id_check;
alter table public.lab_credit_reservations
  add constraint lab_credit_reservations_allowance_grant_id_check
  check (allowance_grant_id is null or char_length(allowance_grant_id) between 1 and 160);
