begin;

-- Provider callbacks are retried. This ledger makes processing idempotent
-- without holding a database transaction open while a finished video is
-- downloaded and placed in private storage.
create table if not exists public.lab_media_webhook_events (
  idempotency_key text primary key,
  provider_job_id text not null,
  event_type text not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lab_media_webhook_provider_job
  on public.lab_media_webhook_events(provider_job_id, created_at desc);

alter table public.lab_media_webhook_events enable row level security;
revoke all on public.lab_media_webhook_events from anon, authenticated;

commit;
