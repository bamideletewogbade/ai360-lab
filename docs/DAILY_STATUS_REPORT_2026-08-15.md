# AI360 — Daily Status Report

**Date:** 15 August 2026
**Prepared by:** AI360 product & engineering (Accra Innovation Center)
**Audience:** Leadership / management / engineering
**Theme:** Black on white — minimalist, print- and presentation-ready

---

## Executive summary

Today's work had one goal: turn AI360 from "a product that charges a flat
credit per message and shows demo assets" into "a product that charges for the
work actually done and delivers what it sells." Four workstreams were
completed in code:

| # | Workstream | Outcome | Status |
| --- | --- | --- | --- |
| 1 | Pricing by work done (Phase 1) | Everyday chat is included; heavy work is metered; premium models cost more; the AI knows AI360 | **Implemented in code** — verification + deploy pending |
| 2 | Fair-use caps + overflow | Free chat up to a daily cap, then a flat 1 credit per extra message — no one is blocked | **Implemented in code** — migration must be applied |
| 3 | Credit top-ups | One-time MoMo-sized bundles buy permanent credits; both a top-up and a plan are offered at the moment of need | **Implemented in code** — no migration needed |
| 4 | Media Studio live | Image and video generation now really work in production — including a fix for video charging without delivering | **Implemented in code** — live retest in progress |

Two production incidents were diagnosed and fixed (video charging without a
deliverable; a type error that broke the build), and a manual credit-grant tool
was added so testing no longer depends on real payments.

**What still stands between today's work and "done":** the automated test
suite, lint and typecheck must run on a machine with the toolchain (this
environment could not run them), the new database migration must be applied,
and a live browser retest of the video flow must pass.

---

## Workstream 1 — Pricing by work done (Phase 1)

### The problem, in numbers

Every message cost exactly 1 credit because of a pricing **floor**, not because
of the work. A typical chat turn costs AI360 about **GH₵0.01**; one credit is
worth **GH₵0.26** — so the 1-credit minimum was ~**25×** the measured cost of a
short message. Frontier companies converged on the opposite shape: they do not
meter everyday chat at all (Perplexity, ChatGPT, Claude), and they use model
multipliers so expensive models cost more (Cursor, Copilot).

### What changed

- **Everyday chat is included with a plan.** Plain chat on the fast model no
  longer draws from the credit meter. Cost is bounded by fair-use daily caps.
- **Premium models are metered with a multiplier.** Deliberately selecting
  Claude Sonnet 5 / Kimi K3 settles at measured cost × 2 (floor 1, reserve 4,
  ceiling 8 credits). The ledger still records the real cost.
- **Heavy work keeps metering by measured cost:** research 2–4, files 2–4,
  agent execution 3–8, image 3–6, video 12–20 credits (quoted before it runs).
- **Agent plan approval is now free** (it is one small chat turn; rejecting a
  plan should cost nothing).
- **The AI now knows AI360.** A compact, always-on "product facts" block tells
  the assistant what AI360 can do, all four plans with prices, credits policy,
  MoMo/card payment, supported languages, and honest limits — public facts
  only, with a rule never to invent policies.

### Files

`src/lib/billing/credits.ts`, `src/app/api/chat/route.ts`,
`src/app/api/agent/route.ts`, `src/lib/product-knowledge.ts` (new), UI copy
(pricing page, what-you-can-make, credit guide), tests
(`tests/credits.test.ts`, `tests/product-knowledge.test.ts`).

---

## Workstream 2 — Fair-use caps and the overflow path

### The problem

With chat included, free users could chat without limit and paying users were
still hard-blocked at the daily cap with no way to continue.

### What changed

- **Free up to the cap, then pay — never blocked.** Signed-in users past their
  daily cap flip to a flat **1 credit per extra message** (`chat.overflow`)
  through the normal credit gate. Failed messages charge nothing (credits
  return).
- **Daily caps by plan:** Explorer 10, Everyday 60, Builder 120, Team 150 per
  day; anonymous guests stay hard-stopped at 10/day with a "sign in to keep
  chatting" hint.
- **Metered work bypasses the cap.** Research, files and premium-model chat are
  already paid for, so paying users doing paid work are never cut off by the
  free-chat allowance (this fixed a double-limiting bug).
- **The cap is durable.** The daily counter moved from in-memory (reset on
  every deploy, per server instance) to a Postgres table with an atomic
  upsert per workspace per UTC day — two concurrent turns cannot both claim
  the last free slot. The 429 message ("resets at midnight UTC") is now
  literally true.

### Files

`database/postgres/0017_chat_daily_cap.sql` (new — **must be applied**),
`src/lib/chat-daily-cap.ts` (new), `src/lib/billing/credits.ts`,
`src/lib/billing/catalog.ts`, `src/lib/guardrails.ts`,
`src/app/api/chat/route.ts`, UI copy, `tests/credits.test.ts`.

---

## Workstream 3 — Credit top-ups

### The problem

The overflow path dead-ended at "0 credits": wait for tomorrow, or pay GH₵125
for a whole month. There was no MoMo-sized answer for "I just need this one
render."

### What changed

- **One-time bundles:** GH₵50 → 40 credits, GH₵100 → 90, GH₵200 → 185. They
  never renew and never expire with the monthly allowance (purchased credits
  are structurally separate from the monthly allowance).
- **Same safe money path as plans:** ExpressPay hosted checkout, query-verified
  callback, idempotent activation. No migration needed — the schema already
  supported `one_time` cadence, `metadata` and `top_up` ledger entries.
- **Offered at the moment of need:** Settings has a "Buy more credits" section,
  and the insufficient-credits screen in Media Studio now shows both a quick
  top-up *and* the monthly plans side by side, with an honest note that
  top-ups cost more per credit than a plan — so regular users are steered to
  the subscription (better for them, healthier for us).
- **Pricing integrity is enforced by test:** top-ups cost more per credit than
  Everyday, so subscribing is always the better deal.

### Files

`src/lib/billing/checkout-contract.ts`, `src/lib/payments/contracts.ts`,
`src/lib/payments/expresspay.ts`, `src/lib/payments/payment-repository.ts`,
`src/app/api/billing/checkout/route.ts`, `src/app/checkout/page.tsx`,
`src/components/CheckoutExperience.tsx`, `src/components/settings/BillingSettings.tsx`,
`src/app/api/credits/route.ts`, `src/components/MediaStudio.tsx`,
`tests/billing.test.ts`, `tests/expresspay.test.ts`.

---

## Workstream 4 — Media Studio live

### Incident 1 — "Generate just navigates to the assets column"

**What was wrong.** Media Studio was a demo shell, not a wired feature. It
posted a body the real APIs reject, never checked `response.ok`, read a field
the APIs do not return, and fell back to static demo images — so every click
"worked" and jumped to the gallery. The real generation machinery (credit
gates, provider calls, durable jobs, storage) was already working; the surface
never called it correctly.

**What changed.** The studio image/video routes now accept a raw prompt, and
Media Studio drives them honestly: real API calls, real URLs, real errors, and
the production quote-first video pattern (quote → confirm price in credits →
render → poll → clip lands in the gallery). Failed renders say your credits
were returned.

### Incident 2 — "Video took credits but never completed" (two attempts)

**What was wrong.** Four compounding bugs:
1. **Charged before delivery.** The status handler settled (charged) as soon as
   the provider said `completed` — *then* downloaded and stored the file. A
   download failure left the person charged with no clip.
2. **The client gave up on any transient error.** One network blip or 502
   permanently stopped polling; the job sat until the 2-hour hold expired.
3. **Refresh orphaned the job.** The token lived only in browser state; a
   refresh killed the poll with no way to resume.
4. **Unrecognised terminal states.** The provider can end a job with
   `cancelled` or `expired` — both terminal, both treated as "keep polling".
   A provider 404 (job lost) was also retried forever.

**What changed.**
1. A `completed` clip is charged only after it actually lands in storage;
   delivery failure keeps the job retryable.
2. Client polling retries transient failures with backoff instead of giving up;
   terminal states stop and refund.
3. The job (token, id, prompt, duration) survives refresh via session storage
   and resumes on return; polling also resumes when the tab becomes visible
   (mobile browsers throttle timers in background tabs).
4. `cancelled`, `expired` and provider 404 are terminal — they refund the hold
   with a clear message.

**Confirmed in production today.** Image generation works end to end (tested
live). Video requires credits and sign-in — which is where the manual grant
tool comes in.

### Manual credits for testing

`scripts/grant-credits.mjs` grants credits to a named account for non-payment
testing — idempotent, logged as an `adjustment`, never touching the monthly
allowance. **Successfully used today:** +200 credits to the test account
(balance 72 → 272, which also confirmed the earlier "lost" video credits had
been correctly reclaimed by the 2-hour hold expiry).

---

## Build fix

A production build caught one type error in the top-up work
(`payment-repository.ts`: `AttemptRow` was missing the `cadence` field that
idempotency matching reads). Fixed with a one-line type addition — no runtime
or migration change. The build then passed typecheck for the whole branch.

---

## Verification status

| Check | Status |
| --- | --- |
| Automated test suite (`npm test`) | **Not run** — no toolchain on this machine; must run before deploy |
| Lint (`npm run lint`) | **Not run** — same reason |
| Typecheck (`npx tsc --noEmit`) | **Passed** during the production build after the `AttemptRow` fix |
| Database migration `0017_chat_daily_cap.sql` | **Not yet applied** — code fails safe without it (in-memory fallback) |
| Live prod check — image generation | **Passed** (tested today) |
| Live prod check — video render | **In progress** (credits granted for the retest) |
| Manual credit grant | **Passed** (72 → 272 on the test account) |

---

## What remains before "done"

1. **Run verification** (engineering): `npm test`, `npm run lint`,
   `npx tsc --noEmit`.
2. **Apply the migration** `0017_chat_daily_cap.sql` to Supabase (create table
   + RLS). The code fails safe without it, but the durable daily cap only
   works once applied.
3. **Deploy** the changes to production.
4. **Live retest of video** with the granted credits:
   - Full render: quote → confirm → clip lands in the gallery, balance settles
     to measured cost.
   - Resilience: close the tab mid-render, reopen, confirm the render resumes.
5. **Re-run the full video flow** and check `lab_credit_reservations` and the
   ledger for the test workspace — the two earlier failed attempts should show
   as `settled`/`expired` with credits returned.

---

## Decisions recorded today

All decisions are logged in `DECISIONS.md` with rationale and revisit
conditions:

- Everyday chat included; heavy work metered; premium models at ×2.
- Chat fair-use caps (10/60/120/150); overflow at 1 credit per message.
- Top-ups introduced once the single purchase shape was proven; priced above
  plans per credit.
- Media Studio surfaces real errors; no demo fallbacks inside the paid product.
- A hold is a promise: charge only after delivery; every provider terminal
  state settles.
- Manual `adjustment` grants for non-payment testing.

---

## Next steps (for the boss's demo and beyond)

1. Verify + migrate + deploy (the three commands above, then the SQL).
2. Confirm the video render end to end in production with the test account.
3. Phase 2 (pricing): rebalance heavy-feature floors to measured cost; decide
   whether Gemini 3.6 Flash joins the premium set; track the pilot scorecard
   metrics (§7 of the management report).
4. Language review (native-speaker check of Twi/Gã/Eʋegbe/Pidgin) — the gate
   for the language moat claim.

---

## Related documents

- `docs/MANAGEMENT_REPORT_PRICING_SELF_KNOWLEDGE_MOAT_2026-08-15.md` — the
  strategic report for management on pricing, product intelligence and moat
- `docs/FRONTIER_ADAPT_PRICING_SELF_KNOWLEDGE_MOAT_2026-08-15.md` — technical
  assessment with file-level detail
- `docs/PAYMENT_UPDATE_REPORT_2026-08-14.md` — the earlier payment experience
  report (the format this report follows)
- `DECISIONS.md` — the full decision and incident log
