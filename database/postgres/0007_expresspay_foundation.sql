begin;

-- ExpressPay redirects and Mobile Money notifications are untrusted signals.
-- These fields record the later server-to-server query and the single moment
-- at which a verified payment changed entitlement and credits.
alter table public.lab_payment_attempts
  add column if not exists provider_transaction_id text,
  add column if not exists provider_status_text text,
  add column if not exists verified_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists last_checked_at timestamptz;

create unique index if not exists idx_lab_payment_provider_transaction
  on public.lab_payment_attempts(provider, provider_transaction_id)
  where provider_transaction_id is not null;

-- The operational queue contains only payments that may still change state.
create index if not exists idx_lab_payment_reconciliation_queue
  on public.lab_payment_attempts(updated_at, id)
  where status in ('created', 'initiating', 'pending', 'review');

-- A workspace has one renewable manual monthly entitlement per provider. Each
-- successful one-time payment extends it; no card or wallet token is stored.
create unique index if not exists idx_lab_subscription_provider_workspace
  on public.lab_subscriptions(provider, workspace_key);

commit;
