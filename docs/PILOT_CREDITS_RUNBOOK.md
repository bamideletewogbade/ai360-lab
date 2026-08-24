# Private pilot credits

This workflow grants sponsored credits to registered AI360 accounts without
changing any public website copy or creating a payment.

## 1. Prepare the private list

Each tester must register and sign in to AI360 once. Create a CSV outside the
repository using the exact account emails:

```csv
email,credits
first.tester@example.com,100
media.tester@example.com,150
third.tester@example.com,
```

The `credits` column is optional. An empty value receives the command default,
which is 100 credits. A batch is capped at 100 users as an operational safety
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
