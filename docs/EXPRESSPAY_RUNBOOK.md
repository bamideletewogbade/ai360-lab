# ExpressPay release runbook

AI360 uses ExpressPay's hosted checkout. Card and Mobile Money credentials go
directly to ExpressPay; AI360 stores only the order, provider token, verified
transaction ID, status, amount, and timestamps.

Official contract: https://expresspaygh.com/developers/docs/accept-payments/merchant-api

## 1. Prepare staging

Use a separate HTTPS staging deployment with:

```dotenv
AI360_DEPLOYMENT_ENV=staging
NEXT_PUBLIC_BILLING_ENABLED=false
PAYMENTS_PROVIDER=expresspay
EXPRESSPAY_ENV=sandbox
EXPRESSPAY_MERCHANT_ID=...
EXPRESSPAY_API_KEY=...
NEXT_PUBLIC_APP_URL=https://your-staging-origin.example
```

Keep the secret values in the host's secret manager. Never add them to Git or
prefix them with `NEXT_PUBLIC_`.

ExpressPay restricts API calls by outbound server IP. Ask the hosting provider
for the staging runtime's stable egress IP, then ask ExpressPay Integrations to
allowlist it for the sandbox merchant. Do not use a developer laptop's changing
IP as the release proof.

ExpressPay integration support:

- integrations@expresspaygh.com
- +233 30 700 0503

## 2. Automated gates

Run these from the staging release or deployment shell:

```sh
npm run payments:contract
npm run payments:verify
npm run payments:sandbox
```

- `payments:contract` checks payloads, response parsing, fail-closed behavior,
  HTTPS callbacks, transaction IDs, and hosted-checkout boundaries with mocks.
- `payments:verify` uses a disposable database workspace to prove idempotency,
  callback admission, mismatch review, activation, subscription creation,
  credit grant, duplicate suppression, ledger integrity, and cleanup.
- `payments:sandbox` calls the real sandbox Submit and Query APIs. It creates a
  GH₵1 pending checkout but never submits payment credentials or completes it.

Status 4 from the sandbox probe means the runtime IP is not allowlisted.

## 3. Full sandbox payment

After all three gates pass:

1. Set `NEXT_PUBLIC_BILLING_ENABLED=true` on staging only.
2. Sign in with a dedicated test account and start one paid checkout.
3. Complete it with test card or Mobile Money instructions supplied by
   ExpressPay. Their public docs do not publish reusable test instruments.
4. Confirm `/payment/status` becomes `approved`.
5. Confirm the matching plan subscription and allowance appear once.
6. Replay the callback and refresh status; neither action may grant again.
7. Run an amount-mismatch fixture and confirm it enters `review` without access.
8. Set `NEXT_PUBLIC_BILLING_ENABLED=false` after testing.

The notification and browser return are untrusted. Both must match a locally
stored order/token, and AI360 must query ExpressPay server-to-server before any
subscription or credit changes.

## 4. Production activation

Only after sandbox evidence is recorded:

1. Obtain separate live credentials and allowlist the stable production egress
   IP with ExpressPay.
2. Set `AI360_DEPLOYMENT_ENV=production` and `EXPRESSPAY_ENV=live`.
3. Verify `NEXT_PUBLIC_APP_URL` is the production HTTPS origin.
4. Run `npm run release:check` while billing is still disabled.
5. Enable billing for a named pilot, perform one low-value real transaction,
   reconcile it against the ExpressPay merchant portal, then widen access.

Rollback is immediate: set `NEXT_PUBLIC_BILLING_ENABLED=false`. Existing payment
status, callback verification, subscriptions, and credits remain readable while
new checkout creation is closed.
