# AI360 first paid user runbook

**Scope:** One controlled live customer payment on `https://ai360.africa`  
**Prepared:** 14 August 2026  
**Payment provider:** ExpressPay live hosted checkout

This runbook turns billing on in two safe deployments. The first deployment
repairs and verifies production dependencies while checkout remains closed.
The second deployment opens checkout for the first paid user.

Never paste database passwords, API keys, checkout tokens, payment references
or customer payment details into chat, tickets, screenshots or source control.

## Current verified status

- The public site and `/api/health` return HTTP 200.
- 57 of 59 live deployment smoke checks pass.
- `/api/ready` returns HTTP 503 because the production server cannot connect to
  Postgres, even though a database URL is present.
- Supabase Shared Pooler logs confirm the exact failure: password
  authentication is failing for the deployed database connection. The network,
  pooler host and database project are reachable.
- The deployed environment reports billing disabled.
- The same Supabase schema is reachable locally: 34 tables and 16 migrations
  were verified.
- Payment contracts pass 14 of 14 checks.
- The database-backed payment lifecycle passes 15 of 15 checks.
- Credit accounting passes 16 of 16 checks.
- Management has confirmed that ExpressPay's live Submit Payment API returns
  HTTP 200, application status 1 and a hosted-checkout token.

**Do not accept money until `/api/ready` returns HTTP 200.** A payment cannot be
safely recorded, verified or converted into access while the production
database is unavailable.

## Phase 1 - repair production while checkout remains closed

### 1. Copy a fresh Supabase session-pooler URL

1. Open the production Supabase project.
2. Select **Connect**.
3. Choose the **Shared Pooler**, **Session** mode and **URI** format.
4. Use port `5432`.
5. Replace `[YOUR-PASSWORD]` with the database password.
6. Percent-encode special characters in the password before inserting it into
   the URI. For example, `@` becomes `%40`, `#` becomes `%23`, `%` becomes
   `%25`, and `/` becomes `%2F`.
7. Confirm the username retains the project suffix, in the form
   `postgres.project_ref`.

The expected shape is:

```text
postgresql://postgres.project_ref:encoded_password@aws-0-region.pooler.supabase.com:5432/postgres
```

### 2. Update Hostinger's production environment

In Hostinger hPanel, open the AI360 Node.js website, then select
**Deployments -> Settings & Redeploy -> Environment Variables**.

Set or verify the following values. Values shown as placeholders must come from
the relevant provider dashboard and must not be committed to Git.

```text
# Application
NEXT_PUBLIC_APP_URL=https://ai360.africa
AI360_DEPLOYMENT_ENV=production

# AI gateway
OPENROUTER_API_KEY=<server-only key>
OPENROUTER_SITE_URL=https://ai360.africa
OPENROUTER_SITE_NAME=AI360

# Database and authentication
DATABASE_URL=<Supabase shared session-pooler URI on port 5432>
DIRECT_URL=<reviewed migration URI>
DATABASE_SSL=require
DATABASE_POOL_SIZE=5
NEXT_PUBLIC_SUPABASE_URL=<production Supabase project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>

# Private generated-media storage
SUPABASE_SECRET_KEY=<server-only Supabase secret key>
SUPABASE_PRIVATE_BUCKET=ai360-private

# ExpressPay live credentials, with checkout still closed
NEXT_PUBLIC_BILLING_ENABLED=false
PAYMENTS_PROVIDER=expresspay
EXPRESSPAY_ENV=live
EXPRESSPAY_MERCHANT_ID=<live merchant ID>
EXPRESSPAY_API_KEY=<live server-only API key>

# Keep unfinished pilots closed
NEXT_PUBLIC_AI360_TEAM_WORKSPACES=false
AI360_BROWSER_PILOT_ENABLED=false
EMAIL_ENABLED=false
```

If image and video generation are included in the paid pilot, also verify the
approved model catalogue:

```text
OPENROUTER_IMAGE_MODEL=openai/gpt-image-1-mini
OPENROUTER_IMAGE_MODELS=openai/gpt-image-1-mini,google/gemini-3.1-flash-lite-image
MEDIA_JOB_SIGNING_SECRET=<long random application secret>
OPENROUTER_WEBHOOK_SECRET=<secret configured in the OpenRouter workspace>
```

### 3. Save and redeploy

Environment changes do not affect the running Hostinger process until the
application is redeployed. Select **Save and redeploy**, wait for the Node.js
deployment to complete, then clear the Hostinger cache once if the old build is
still visible.

### 4. Pass the production dependency gate

Open these URLs directly:

```text
https://ai360.africa/api/health
https://ai360.africa/api/ready
```

Required result:

- `/api/health`: HTTP 200 with `"status":"ok"`.
- `/api/ready`: HTTP 200 with `"status":"ready"` and
  `"databaseConnection":"connected"`.
- Payments may still appear as pending because the billing flag remains false.

Then run from the repository:

```powershell
npm run smoke:deploy -- https://ai360.africa
```

The expected result is 59 of 59 checks passed.

If `/api/ready` still returns HTTP 503, open Hostinger **Runtime logs** and find
the readiness request by its `requestId`. Then compare it with the Supabase
**Shared Pooler** logs. A repeated `password authentication failed` event means
the deployed URI contains a stale password, a mistyped password or an
unencoded special character. Do not enable billing while this gate is failing.

## Phase 2 - verify the customer identity journey

### 5. Confirm Supabase URL configuration

In Supabase, open **Authentication -> URL Configuration** and set:

```text
Site URL: https://ai360.africa
Redirect URL: https://ai360.africa/auth/callback
```

Keep local development redirects separate. Production should use the exact
callback URL instead of a broad wildcard.

### 6. Create the pilot customer's account

1. Ask the customer to open `https://ai360.africa/sign-up`.
2. Use an email address the customer controls.
3. Complete email confirmation if enabled.
4. Sign in and confirm `/app` opens successfully.
5. Create one short chat and reload the page.
6. Confirm the conversation remains available after the reload and in a second
   browser or device.
7. Open **Settings -> Credits & Billing** and confirm the account starts on the
   Explorer allowance with no payment record.

Stop here if sign-up, confirmation, cross-device persistence or the billing
screen fails.

## Phase 3 - open checkout for one user

### 7. Enable billing and redeploy

In Hostinger, change one value:

```text
NEXT_PUBLIC_BILLING_ENABLED=true
```

Keep these values unchanged:

```text
AI360_DEPLOYMENT_ENV=production
PAYMENTS_PROVIDER=expresspay
EXPRESSPAY_ENV=live
NEXT_PUBLIC_APP_URL=https://ai360.africa
```

Select **Save and redeploy**. After deployment:

1. Confirm `/api/ready` still returns HTTP 200.
2. Open `/pricing` in a signed-out browser and confirm paid plans now link to
   checkout rather than the pilot sign-up path.
3. Open `/checkout?plan=everyday` while signed in.
4. Confirm the review shows **Everyday**, **GHS 125**, **120 work credits**,
   **one month**, and **no automatic renewal**.

## Phase 4 - complete and reconcile the payment

### 8. The customer completes the payment

1. The customer selects Mobile Money or card.
2. The customer enters a valid Ghana phone number.
3. AI360 creates the order and redirects to ExpressPay.
4. The customer personally enters and confirms all wallet, OTP, PIN or card
   information on ExpressPay. AI360 staff must not request or handle it.
5. ExpressPay returns the customer to AI360 after processing.

### 9. Verify the customer result in AI360

On **Settings -> Credits & Billing**, confirm:

- Plan: Everyday.
- Status: Active.
- Available allowance: 120 work credits before any paid work is used.
- Access period: one month from the verified payment.
- Payment history: approved with an ExpressPay transaction reference.
- No duplicate payment or duplicate credit grant appears after refreshing.

Run one inexpensive chat request and confirm the balance decreases by the
quoted amount while the conversation remains saved.

### 10. Reconcile in Supabase without exposing payment secrets

Use the Supabase SQL Editor. The following queries intentionally omit checkout
tokens and customer payment details:

```sql
select id, status, plan_slug, amount_minor, currency,
       provider_transaction_id, verified_at, activated_at, created_at
from public.lab_payment_attempts
order by created_at desc
limit 5;

select workspace_key, plan_slug, status,
       current_period_start, current_period_end, updated_at
from public.lab_subscriptions
order by updated_at desc
limit 5;

select workspace_key, available_credits, reserved_credits,
       allowance_credits, allowance_period, updated_at
from public.lab_credit_accounts
order by updated_at desc
limit 5;

select workspace_key, entry_type, credits_delta, balance_after,
       source_type, created_at
from public.lab_credit_ledger
where source_type = 'subscription_payment'
order by created_at desc
limit 5;
```

Confirm that the approved payment, active subscription, credit account and one
subscription-payment ledger grant all refer to the same workspace.

### 11. Reconcile with ExpressPay

In the ExpressPay merchant portal, match the AI360 payment using the provider
transaction ID, amount, currency and processing time. Confirm the settlement
appears against the business's expected bank or Mobile Money destination.

The first payment passes only when all four records agree:

1. ExpressPay merchant transaction.
2. AI360 approved payment attempt.
3. AI360 active monthly subscription.
4. AI360 credit ledger grant exactly once.

## Stop and rollback conditions

Immediately close new checkout by setting
`NEXT_PUBLIC_BILLING_ENABLED=false` and redeploying if any of the following
occurs:

- ExpressPay shows paid but AI360 remains pending or failed.
- AI360 activates access without an approved server query.
- The paid amount or currency does not match the selected plan.
- The customer receives zero credits or duplicate credits.
- The same transaction appears more than once.
- `/api/ready` becomes unavailable.

Disabling checkout does not erase existing payment records or remove valid
access. Investigate using the displayed request reference and Hostinger Runtime
logs before reopening billing.

## Completion record

Record only non-sensitive evidence:

```text
Test date and time:
AI360 deployment identifier:
Plan:
Amount and currency:
Payment method category:
AI360 order ID:
ExpressPay transaction ID:
AI360 final status:
Subscription period end:
Credits granted:
Smoke result:
Reviewed by:
```

Do not record the API key, database password, checkout token, Mobile Money PIN,
OTP, full card number or card security code.
