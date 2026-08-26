begin;

-- Indexes for the spend circuit breaker.
--
-- The caps read `lab_cost_ledger` rather than keeping their own counters. A
-- counter table would need two correct write paths — usage events for text,
-- image, voice and agent work, media jobs for renders — and the whole reason
-- that view exists (0019) is that summing either source alone gives a wrong
-- answer. A counter that silently misses one path is worse than no cap at all:
-- it reads as protection while never firing.
--
-- Reading the truth instead costs one indexed range scan per scope per request,
-- which these indexes make cheap. `idx_lab_usage_workspace_created` already
-- covers the per-workspace question; what is missing is the whole-platform
-- question and the per-user one.

-- Application-wide daily spend. Partial, so it holds only rows that cost money
-- — a small fraction of the usage table.
create index if not exists idx_lab_usage_cost_created
  on public.lab_usage_events(created_at desc)
  where actual_cost_usd > 0;

-- Per-user daily spend. Distinct from the workspace index because an
-- organization workspace has many users, and a per-seat ceiling is the only
-- thing that stops one member draining a shared pool.
create index if not exists idx_lab_usage_cost_owner_created
  on public.lab_usage_events(owner_id, created_at desc)
  where actual_cost_usd > 0;

-- The render side of the same two questions. `idx_lab_media_jobs_cost_occurred`
-- (0011) already answers the application-wide one on the same expression.
create index if not exists idx_lab_media_jobs_cost_workspace_occurred
  on public.lab_media_jobs(workspace_key, (coalesce(completed_at, updated_at, created_at)) desc)
  where actual_cost_usd > 0;

create index if not exists idx_lab_media_jobs_cost_owner_occurred
  on public.lab_media_jobs(owner_id, (coalesce(completed_at, updated_at, created_at)) desc)
  where actual_cost_usd > 0;

comment on index public.idx_lab_usage_cost_created is
  'Supports the application-wide daily spend cap in src/lib/billing/spend-caps.ts.';

commit;
