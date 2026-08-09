# AI360 rollback and restore runbook

## Application rollback

Use this when the process is healthy but a newly deployed application release
causes errors, broken journeys or incorrect output.

1. Disable the affected capability first. Billing, browser work and team
   workspaces already have independent feature flags.
2. Record the failing commit, first observed time, affected route and request
   references.
3. Redeploy the last known-good commit through Hostinger.
4. Do not reverse an applied database migration by editing or deleting its SQL
   file. Application code must remain backward compatible with additive schema.
5. Run the deployed smoke suite against the restored release.
6. Verify `/api/ready`, one signed-in workspace and credit balances before
   reopening the affected capability.

## Database restore

Use this only for confirmed data corruption, destructive operator error or a
failed migration that cannot be corrected forward.

1. Stop writes by disabling paid and action-capable features. If broad writes
   are unsafe, place the application in provider-level maintenance mode.
2. Record the incident time and determine the required recovery point.
3. Preserve the current database before restoring anything.
4. Restore into a separate Supabase project or isolated database first.
5. Run migrations and `npm run db:postgres:verify` against the restored copy.
6. Run `data:verify`, `credits:verify` and `runs:verify` against that copy.
7. Reconcile payment attempts, subscriptions, credit accounts and the
   append-only ledger before changing the application connection.
8. Point staging at the restored copy and run the deployed smoke suite.
9. Change production only after two-person review of the recovery point and
   reconciliation results.

## Migration failure

Migrations are ordered, checksummed and additive. If a new migration fails:

- leave the failed release undeployed
- preserve the error and database state
- create a new corrective migration
- never change a migration already recorded in `private.lab_schema_migrations`
- rerun schema verification before retrying the application release

## Evidence to retain

- release and rollback commit SHAs
- migration names and checksums
- backup or recovery-point identifier
- readiness and smoke-test output
- request references and redacted runtime events
- credit and payment reconciliation results
- decision owner, start time and recovery time
