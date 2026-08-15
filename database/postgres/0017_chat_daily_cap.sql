-- Durable per-day free-chat counters.
--
-- Everyday chat is included with a plan and bounded by a per-workspace daily
-- fair-use cap instead of a credit meter. The counter has to live in Postgres:
-- an in-memory counter reset on every deploy, and a per-process counter would
-- multiply the allowance across server instances. Keying by UTC date also makes
-- the product's "resets at midnight UTC" message literally true.
--
-- Subject keys mirror the rate limiter in src/lib/guardrails.ts:
--   ws:<workspace key> for signed-in users, ip:<address> for anonymous callers.
-- The chat route reads a row's count after an atomic upsert and compares it
-- against the plan's allowance (Explorer 10, Everyday 60, Builder 120, Team
-- 150). Signed-in users past the cap are metered at one credit per extra
-- message; anonymous callers, who have no credit account to overflow onto, are
-- hard-stopped with a sign-in hint.

create table if not exists public.lab_chat_daily_counters (
  subject_key text not null,
  usage_date date not null,
  count bigint not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (subject_key, usage_date)
);

create index if not exists idx_lab_chat_daily_counters_updated
  on public.lab_chat_daily_counters(updated_at);

comment on table public.lab_chat_daily_counters is
  'Free-chat turns consumed per subject per UTC day. Written by the chat route before each plain-chat turn.';

-- Internal bookkeeping only. The chat route writes through the service role;
-- no client role may read or write these counters.
alter table public.lab_chat_daily_counters enable row level security;

revoke all on public.lab_chat_daily_counters from anon, authenticated;
