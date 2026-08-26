# Private pilot credits

This workflow grants sponsored credits to registered AI360 accounts without
changing any public website copy or creating a payment.

## 1. Prepare the private list

Each tester must register and sign in to AI360 once. Create a CSV outside the
repository using the exact account emails:

```csv
email,credits
first.tester@example.com,25
media.tester@example.com,40
third.tester@example.com,
```

The `credits` column is optional. An empty value receives the command default,
which is 25 credits. A batch is capped at 100 users as an operational safety
guard.

## 2. Preview against production

Run this where `DATABASE_URL` points to the production database:

```powershell
npm run credits:pilot -- --file C:\secure\pilot-users.csv --cohort pilot-2026-09
```

Preview mode is the default and makes no changes. The entire batch is blocked
if an email has not registered or resolves to more than one active account.

## 3. Apply the reviewed batch

```powershell
npm run credits:pilot -- --file C:\secure\pilot-users.csv --cohort pilot-2026-09 --apply
```

Grants are recorded in the credit ledger with `source_type = sponsored_seat`
and the cohort as `source_id`. Re-running the same cohort is safe: its existing
grants are skipped instead of duplicated.

Use a new cohort label for a deliberate refill, for example
`pilot-2026-09-refill-1`.

Do not commit the real tester CSV. It contains personal information.

## 3a. Sponsor a plan tier, not just a balance

Credits alone do not change what a workspace is entitled to. Plan resolution
reads the subscription table, so a tester holding sponsored credits is still on
**Explorer — ten chat messages a day**. Past that cap every message costs one
credit, and the allowance drains on the cheapest work in the product instead of
the research, agent, image and video work a pilot exists to measure.

Add `--entitlement` so testers land on a real plan:

```powershell
npm run credits:pilot -- --file C:\secure\pilot-users.csv --cohort pilot-2026-09 --entitlement everyday --apply
```

This grants the plan's included credits (Everyday: 120) **and** its daily chat
cap (60), for 35 days by default — use `--days` to change it, up to 120. The
`--credits` column is ignored in this mode: the plan allowance is the grant.

Any unspent Explorer allowance is withdrawn first, exactly as a real paid
activation does, so balances do not stack. The command refuses to sponsor a
workspace that already has active paid access, because doing so could move a
paying customer onto a smaller plan.

Sponsored access ends by itself when the period lapses; the workspace falls
back to Explorer and keeps whatever credits it was given.

## 4. Open the private cohort report

Allow only the staff accounts that should see tester emails and account-level
usage. Configure one of these server-side values and redeploy:

```dotenv
AI360_PILOT_OPERATOR_IDS=authenticated_user_id
# Or, for simpler setup with a verified account:
AI360_PILOT_OPERATOR_EMAILS=founder@example.com
```

Sign in with an allowed account and open `/admin`, then the Cohorts view. The
newest sponsored cohort is selected automatically. It shows activation, repeat
use, feature counts, settled credits, failures and measured provider cost.
**Export** downloads the same metadata-only report as CSV or Excel.

(An earlier version of this runbook pointed at `/pilot`. That route no longer
exists — the cohort report moved into the admin console.)

The report never selects prompt or response content. Counts begin at each
tester's first grant in the chosen cohort. "Current balance" can include other
grants, while "credits used" is the settled consumption recorded after the
cohort grant.
