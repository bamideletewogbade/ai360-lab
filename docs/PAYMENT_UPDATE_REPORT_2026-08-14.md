# AI360 payment experience — update report

**Date:** 14 August 2026  \
**Scope:** Two updates to the live checkout and payment flow at ai360.africa, discovered and fixed during the first real paid ExpressPay transaction  \
**Status:** Code changes complete; deployment and end-to-end retest pending (steps in "What remains")

---

## Executive summary

The first real paid checkout on ai360.africa surfaced two issues in the payment
experience. Both are now fixed in code. Neither put money or customer data at
risk — the payment itself was processed correctly in both cases — but both
affected how trustworthy the product feels at the moment a customer pays.

| # | Issue | Customer impact | Status |
| --- | --- | --- | --- |
| 1 | After paying, the browser was sent to an unreachable address instead of the confirmation page | Customer saw "This site can't be reached" after payment; credits only appeared after manually refreshing | **Fixed in code** |
| 2 | Checkout asked for a phone number that ExpressPay then asked for again | Double entry at the moment of payment; unnecessary personal data collected | **Fixed in code** |

---

## Update 1 — Payment confirmation redirect fixed

### What the customer saw

After completing payment on ExpressPay's page, the browser was redirected to an
address that does not exist on the public internet (`0.0.0.0:3000`) and showed
Chrome's "This site can't be reached" error, instead of the AI360
"Payment confirmed" page. The customer had to manually refresh the workspace to
see that their credits had arrived.

### Why it happened

The payment itself completed correctly — ExpressPay confirmed it, AI360 verified
it server-to-server, and the credits were granted. The problem was only the
*final redirect*: the code that sent the browser back to AI360's confirmation
page built the address from the server's internal details rather than the
public website address. Behind the hosting proxy, that internal address is
`0.0.0.0:3000` — which is how a real browser is addressed on a server, not on
the internet. The same class of bug had previously affected sign-in and was
already fixed there; the payment flow simply had not received the same fix.

### What was fixed

The payment redirect now uses the same verified, tested logic that sign-in uses:
the public website address (`ai360.africa`) is taken from configuration, and the
internal server address can never be used for a redirect. Regression tests were
added that specifically reproduce the failure scenario.

### What did NOT break

- The payment was **always** processed and verified correctly — credits were
  granted even while the redirect was broken.
- No double charge: duplicate payment notifications are designed to be harmless
  (verified by existing automated checks).
- Card numbers, wallet PINs and security codes never pass through AI360 — this
  is unchanged and re-verified.

### Why this matters

The moment after a customer pays is when trust is won or lost. An error page
after a successful payment reads as "did I just get charged?" and generates
support calls even when nothing is wrong. This fix removes that failure point.

---

## Update 2 — Phone number removed from the AI360 checkout form

### What the customer saw

The AI360 checkout form asked for a phone number, and then ExpressPay's own
payment page asked for it again. The number was entered twice in the same
purchase.

### Why it happened

AI360 was passing the number to ExpressPay, but ExpressPay's hosted payment page
collects the Mobile Money number itself and does not pre-fill it from what we
send. The field on our form therefore added a step without adding anything.

### What was fixed

- Removed the phone field from the AI360 checkout form (and its validation and
  the value passed to ExpressPay — their API lists it as optional).
- The customer now goes straight from reviewing the plan to ExpressPay and
  enters the number only once, on the payment page.
- Card payers are no longer asked for a phone number at all.

### Benefits

- **Fewer steps to pay** — one less required field at checkout.
- **Less personal data collected** — AI360 never stored the number (no database
  field existed) and never used it for receipts or reconciliation, so it was
  collecting data it did not need. Removing it is a small privacy win and
  reduces what we would have to protect if data policies change.
- The decision is recorded in the project's decision log so it is not
  accidentally re-introduced.

---

## Technical reference (for the engineering team)

| Change | Files |
| --- | --- |
| Payment redirect uses the public origin (reuses the tested sign-in logic) | `src/lib/payments/status-url.ts` (new), `src/app/api/billing/expresspay/return/route.ts` |
| Regression tests for the redirect fix | `tests/payment-status-url.test.ts` (new) |
| Phone removed from checkout request contract | `src/lib/billing/checkout-contract.ts`, `src/components/CheckoutExperience.tsx` |
| Phone removed from payment provider payload | `src/lib/payments/contracts.ts`, `src/lib/payments/expresspay.ts`, `src/app/api/billing/checkout/route.ts` |
| Tests updated for the phone removal | `tests/billing.test.ts`, `tests/expresspay.test.ts` |
| Decision recorded | `DECISIONS.md` (2026-08-14 · ExpressPay owns phone collection) |

---

## What remains before this is fully closed

The code changes are complete, but the environment used for this work could not
run the automated test suite, so the following must be done before considering
this shipped:

1. **Run verification** (engineering): `npm test`, `npm run lint`, `npx tsc --noEmit`.
2. **Deploy** the changes to production.
3. **End-to-end retest** with one real sandbox payment:
   - Checkout starts without a phone field.
   - The phone is entered only once, on ExpressPay's page.
   - After payment, the browser lands on `https://ai360.africa/payment/status`
     and shows **Payment confirmed** without any manual refresh.
4. **Confirm configuration** — `NEXT_PUBLIC_APP_URL` must be
   `https://ai360.africa` in the hosting environment (this is already the case,
   since the paid checkout succeeded).

Once step 3 passes, the paid checkout flow is verified end to end on the real
flow: review → pay on ExpressPay → automatic confirmation → credits active.
