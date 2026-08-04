-- Credit runtime columns.
--
-- 0002 defined the reservation table for the agent runtime, where a hold always
-- belonged to a run. Chat, image and video reserve credits without a run, and
-- reconciliation needs to know what a reservation actually charged rather than
-- only what it held. These columns close that gap.

alter table public.lab_credit_reservations
  add column if not exists owner_id text references public.lab_users(clerk_user_id) on delete set null,
  add column if not exists request_id text,
  add column if not exists settled_credits bigint,
  add column if not exists metadata jsonb;

alter table public.lab_credit_reservations
  drop constraint if exists lab_credit_reservations_settled_credits_check;

alter table public.lab_credit_reservations
  add constraint lab_credit_reservations_settled_credits_check
  check (settled_credits is null or (settled_credits >= 0 and settled_credits <= credits));

-- Reconciliation reads holds by owner and by the request that created them.
create index if not exists idx_lab_credit_reservations_owner
  on public.lab_credit_reservations(owner_id, created_at desc) where owner_id is not null;
create index if not exists idx_lab_credit_reservations_request
  on public.lab_credit_reservations(request_id) where request_id is not null;
