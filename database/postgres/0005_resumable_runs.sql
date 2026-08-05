-- Resumable agent runs.
--
-- A run used to live entirely inside the HTTP request that started it. On a
-- connection that drops, which is the normal case on a Ghanaian mobile network,
-- the work and the credits went with it.
--
-- These columns let a run outlive the connection that started it: progress is
-- written as it happens, the finished answer is stored, and a returning client
-- can ask what happened rather than starting again.

alter table public.lab_agent_runs
  add column if not exists result_content text,
  add column if not exists result_sources jsonb,
  add column if not exists result_usage jsonb,
  add column if not exists progress jsonb not null default '[]'::jsonb,
  add column if not exists plan jsonb,
  add column if not exists last_seen_at timestamptz;

-- A client returning after a dropped connection looks its run up by owner.
create index if not exists idx_lab_agent_runs_owner_recent
  on public.lab_agent_runs(owner_id, created_at desc);

-- Runs left running with nothing attached to them are the ones to sweep.
create index if not exists idx_lab_agent_runs_unfinished
  on public.lab_agent_runs(status, updated_at)
  where status in ('queued', 'planning', 'running', 'verifying');
