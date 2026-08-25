begin;

-- Finance reporting groups settled media charges by feature and time window.
create index if not exists idx_lab_credit_reservations_media_settled
  on public.lab_credit_reservations(feature, settled_at desc)
  where status = 'settled' and feature in ('image', 'video');

-- `lab_cost_ledger` reads these two cost-bearing sources underneath its view.
create index if not exists idx_lab_usage_cost_feature_created
  on public.lab_usage_events(feature, created_at desc)
  where actual_cost_usd > 0;

create index if not exists idx_lab_media_jobs_cost_occurred
  on public.lab_media_jobs((coalesce(completed_at, updated_at, created_at)) desc)
  where actual_cost_usd > 0;

commit;
