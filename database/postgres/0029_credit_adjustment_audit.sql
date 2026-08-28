begin;

-- Let the operator audit record a balance going DOWN.
--
-- `lab_admin_audit_events` was written on the assumption that an operator can
-- only ever add credits: `action` was limited to `credit_grant` and
-- `credit_refund`, and `credits_delta` was constrained to be strictly positive.
-- That held for as long as the only operator actions were granting an allowance
-- and refunding failed work.
--
-- It stopped holding the first time a grant had to be corrected. Two pilot
-- participants claimed their invitation while the code still handed out the full
-- commercial Everyday allowance of 120 credits, against a policy of 10. Bringing
-- them back in line is a legitimate, deliberate operator action — and there was
-- nowhere to record it. The only options were to file a reduction as a
-- `credit_refund`, which states the opposite of what happened, or to leave the
-- operator audit silent and rely on the credit ledger alone.
--
-- Neither is acceptable for a table whose purpose is answering "who changed this
-- balance, and why". So `credit_adjustment` is added as a first-class action.
--
-- The positive-delta rule is kept for the two actions that always add, rather
-- than dropped for everything: a `credit_grant` that removes credits is still a
-- bug, and losing that check to enable an unrelated case would be a poor trade.
-- Only `credit_adjustment` may carry a negative delta, and it may never carry
-- zero — an audit row recording no change is noise, not evidence.
--
-- `balance_before` and `balance_after` remain non-negative. A correction may
-- never drive somebody's balance below zero, which is the same invariant
-- `lab_credit_ledger` already enforces on its own `balance_after`.

alter table public.lab_admin_audit_events
  drop constraint if exists lab_admin_audit_events_action_check;

alter table public.lab_admin_audit_events
  add constraint lab_admin_audit_events_action_check
  check (action in ('credit_grant', 'credit_refund', 'credit_adjustment'));

alter table public.lab_admin_audit_events
  drop constraint if exists lab_admin_audit_events_credits_delta_check;

-- Signed, but only where a sign is meaningful. Grants and refunds still have to
-- be positive; an adjustment may go either way but never nowhere.
alter table public.lab_admin_audit_events
  add constraint lab_admin_audit_events_credits_delta_check
  check (
    case
      when action = 'credit_adjustment' then credits_delta <> 0
      else credits_delta > 0
    end
  );

-- Corrections are read as a set — "what have we adjusted, and when" — rather
-- than looked up one workspace at a time, so the index leads with the action.
create index if not exists idx_lab_admin_audit_events_action_created
  on public.lab_admin_audit_events (action, created_at desc);

commit;
