begin;

-- One place to ask what AI360 actually spent.
--
-- Cost has always lived in two tables. Text, image, voice and agent work record
-- it on `lab_usage_events`; a video records it on `lab_media_jobs`, because a
-- render is a durable job that outlives the request which started it. Summing
-- either one alone gives a wrong answer, and summing both naively double-counted
-- video until `video.status` stopped carrying a cost.
--
-- That is not a thing anyone should have to remember while reading a pricing
-- report. This view unions the two into a single cost ledger with one row per
-- real charge, so the honest number is the obvious one to reach for.
create or replace view public.lab_cost_ledger as
  select
    'usage_event'::text                       as source,
    events.workspace_key,
    events.owner_id,
    events.feature,
    events.provider,
    events.model,
    events.actual_cost_usd                    as cost_usd,
    events.outcome,
    events.created_at                         as occurred_at
  from public.lab_usage_events as events
  where coalesce(events.actual_cost_usd, 0) > 0

  union all

  -- A render's authoritative cost, settled once when the job reaches a terminal
  -- state. Reported as `video` so it lines up with the credit feature rather
  -- than with whichever route happened to observe it finishing.
  select
    'media_job'::text                         as source,
    jobs.workspace_key,
    jobs.owner_id,
    'video'::text                             as feature,
    'openrouter'::text                        as provider,
    jobs.model,
    jobs.actual_cost_usd                      as cost_usd,
    jobs.status                               as outcome,
    coalesce(jobs.completed_at, jobs.updated_at, jobs.created_at) as occurred_at
  from public.lab_media_jobs as jobs
  where coalesce(jobs.actual_cost_usd, 0) > 0;

comment on view public.lab_cost_ledger is
  'Every real AI cost in one place: lab_usage_events for text, image, voice and agent work, lab_media_jobs for video renders. Sum cost_usd here rather than either table alone.';

-- Reading spend is an operator and reporting concern, never a customer one, so
-- the view stays on the service role that already reaches these tables.
revoke all on public.lab_cost_ledger from public;

commit;
