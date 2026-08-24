# AI360 Admin Console

The private admin console replaces the former pilot cohort page. Open `/admin`
after signing in with an approved operator account.

## Deploy the database boundary

Run the normal Postgres migration workflow before deploying the application:

```powershell
npm run db:migrate
```

Migration `0023_admin_console.sql` adds the private, immutable operator audit
table used by credit grants and refunds. The console intentionally fails closed
if the reporting database or this migration is unavailable.

## Configure operator access

Read-only console access:

```dotenv
AI360_ADMIN_OPERATOR_IDS=authenticated_user_id
# Or
AI360_ADMIN_OPERATOR_EMAILS=founder@example.com
```

Credit mutations can be restricted to a smaller set:

```dotenv
AI360_CREDIT_OPERATOR_IDS=authenticated_user_id
# Or
AI360_CREDIT_OPERATOR_EMAILS=finance@example.com
```

Organization admins also receive both capabilities. Existing pilot operator
values remain accepted during the transition so a deployment does not lock out
the current team. Quality reviewers may inspect the console but cannot mutate
credits unless they are also configured as a credit or admin operator.

## Credit actions

Every grant and refund requires a reason. One transaction atomically writes:

1. The account balance.
2. The append-only credit ledger.
3. The operator audit event with actor, target, before/after balance, reason,
   request ID, and idempotency key.

Retries cannot apply the same action twice. Existing ledger rows are never
edited; a correction is another explicit compensating entry.

## Error and privacy model

The error center correlates usage outcomes and customer quality reports using
user, workspace, feature, route, provider, model, request ID, and error code.
It does not select prompt text, assistant responses, file contents, project
content, or quality evidence excerpts.

Live AI briefings receive only aggregate summary metrics, feature health,
grouped error metadata, cohort counts, and deterministic operational signals.
They cannot grant credits or mutate customer accounts.

## Verification

Before release:

```powershell
npm test
npm run lint
npm run build
```

The production route manifest should include `/admin` and `/api/admin/*`. It
should not include `/pilot` or `/api/pilot/*`.
