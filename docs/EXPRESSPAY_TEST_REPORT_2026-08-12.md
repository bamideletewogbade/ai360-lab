# AI360 ExpressPay sandbox test report

**Date:** 12 August 2026  
**Environment:** ExpressPay sandbox  
**Production billing:** Disabled

## Executive result

The AI360 payment integration logic and database activation flow pass all
automated checks. A real request also reached the ExpressPay sandbox, but the
provider returned status 4 (`Invalid IP`). ExpressPay must allowlist the stable
staging-server outbound IP before a hosted sandbox checkout can be created and
the final end-to-end payment can be completed.

## Evidence

| Test layer | Result | What it proves |
| --- | --- | --- |
| ExpressPay API contract | **11/11 passed** | Submit payload, Query parsing, HTTPS callbacks, amount validation, transaction ID requirement, and fail-closed behavior |
| AI360 database lifecycle | **13/13 passed** | Attempt idempotency, callback admission, mismatch review, activation, subscription, credits, duplicate suppression, and ledger integrity |
| Full repository suite | **222/222 passed** | No regression across the wider application |
| Production compilation | **Passed** | Next.js production build and TypeScript checks complete |
| Credentialed sandbox connection | **Blocked by provider allowlist** | ExpressPay was reachable and returned documented status 4 for the caller IP |

## Security controls verified

- Card and Mobile Money credentials are entered only on ExpressPay's hosted page.
- A redirect or callback cannot activate access by itself.
- AI360 queries ExpressPay server-to-server and verifies order, token, currency,
  amount, status, and provider transaction ID.
- Unknown callback order/token pairs are rejected before a provider query.
- Replayed callbacks cannot create a second subscription or credit grant.
- Billing remains disabled until sandbox approval is complete.

## Remaining approval steps

1. Obtain the stable outbound IP of the staging runtime.
2. Ask ExpressPay to allowlist that IP for the sandbox merchant.
3. Rerun the Postman Submit and Query evidence collection.
4. Complete one hosted sandbox payment using test instructions supplied by
   ExpressPay.
5. Match the ExpressPay portal entry to the AI360 approved payment, subscription,
   and single credit-ledger grant.

## Provider reference

- Merchant API: https://expresspaygh.com/developers/docs/accept-payments/merchant-api
- Integration support: integrations@expresspaygh.com / +233 30 700 0503
