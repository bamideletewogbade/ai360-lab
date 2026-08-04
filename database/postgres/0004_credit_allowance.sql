-- Monthly plan allowances.
--
-- The pricing page promises that included credits reset each month and that
-- unused free credits expire. Purchased top-ups must survive that reset, so a
-- balance has to know which part of itself is this month's allowance.
--
-- Rather than split the balance into two columns, `allowance_credits` tracks
-- how much of `available_credits` came from the current period's grant. Every
-- spend decrements both, so purchased credits are implicitly
-- `available_credits - allowance_credits`, and expiry removes exactly the
-- unspent allowance and nothing else.

alter table public.lab_credit_accounts
  add column if not exists allowance_credits bigint not null default 0,
  add column if not exists allowance_period text,
  add column if not exists allowance_plan text;

alter table public.lab_credit_accounts
  drop constraint if exists lab_credit_accounts_allowance_non_negative;
alter table public.lab_credit_accounts
  add constraint lab_credit_accounts_allowance_non_negative
  check (allowance_credits >= 0);

-- A hold may draw from allowance, purchased credits, or both. Recording the
-- split lets a release return each part to where it came from, so a refund
-- cannot silently convert expiring allowance into permanent credit.
alter table public.lab_credit_reservations
  add column if not exists allowance_drawn bigint not null default 0;

alter table public.lab_credit_reservations
  drop constraint if exists lab_credit_reservations_allowance_drawn_check;
alter table public.lab_credit_reservations
  add constraint lab_credit_reservations_allowance_drawn_check
  check (allowance_drawn >= 0 and allowance_drawn <= credits);

create index if not exists idx_lab_credit_accounts_period
  on public.lab_credit_accounts(allowance_period);
