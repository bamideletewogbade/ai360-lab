# AI360 production readiness

Last reviewed: 2026-08-21

This document is the release truth for AI360. A feature is only marked
ready when its code, configuration, external service and failure path have been
verified. A polished screen alone is not considered production-ready.

## Executive status

**Current release state: live private pilot with verified prepaid payments, not yet ready for unrestricted public use.**

The product experience is functional in guest and signed-in modes and the core
AI routes are implemented. Supabase Auth and Postgres are the identity and data
planes. Paid checkout is enabled in production: a real ExpressPay Mobile Money
purchase was verified end to end on 2026-08-14, one-time top-ups shipped on
2026-08-15, and Media Studio image generation is verified in production with
video reliability fixes deployed pending a final render retest. Unrestricted
public launch remains blocked by shared rate limiting, durable background
replay, external monitoring, backup restoration, load testing and the unproven
payment failure paths (delayed notification, reversal, refund).

Three further capabilities shipped 2026-08-20: Tools & Kits (the renamed,
job-organised discovery catalogue), Brand Kit (workspace-wide knowledge and
logo, applied to generated documents) and answer verification (chat verifies
and visibly receipts time-sensitive claims instead of assuming freshness).
The Library entry was removed from the desktop side navigation on 2026-08-21,
commented out rather than deleted.

## Audit snapshot: 2026-08-21

Scope: full local verification of everything shipped since the 2026-08-16
snapshot (Tools & Kits, Brand Kit, answer verification, two data-access
closes), run end to end against the live production database and deployment.

- `npm test`: 359/359 pass.
- `npm run lint`: pass.
- `npm run build`: compiles without errors on Next.js 16.3.
- `npm run smoke:deploy -- https://ai360.africa`: 59/59 pass (health,
  readiness, database connectivity, all public pages, security headers,
  `/app` noindex, `robots.txt`/`sitemap.xml`/`llms.txt`/`manifest.webmanifest`).
- `npm run db:postgres:verify`: 37 tables, row-level security on every one,
  zero grants to `anon`, 22 migrations applied through
  `0022_cost_ledger_privileges.sql`.
- `npm run prod:check`: READY. Email, billing-adjacent and browser-pilot flags
  remain intentionally disabled and reported as warnings.
- Brand Kit (`0020`/`0021`), the cost-ledger privilege close (`0022`) and the
  Tools & Kits rename are live in production; recorded in `DECISIONS.md`.

## Audit snapshot: 2026-08-16

- Media Studio no longer locks on a video render: only the video render button
  is gated by an in-flight job; polling never strands a job (slow background
  retry + honest notice + Stop waiting); the gallery loads the real recent
  media (`/api/studio/media?recent=1`); 8s clips disabled pending 4s
  validation. Recorded in `DECISIONS.md`.
- Observability wired: Sentry (server + browser errors, traces, warn/error
  structured logs via `Sentry.logger`) and Axiom (structured log shipping)
  via Next.js 16 instrumentation; console and the Postgres usage ledger remain
  the source of truth. DSN and source-map token provisioned; live verification
  pending a first event via `/sentry-example-page` in the running app.
- `npm test && npm run lint && npm run build` still to be re-run here (no
  toolchain on this machine); the operator's production build gate remains the
  checkpoint.

## Audit snapshot: 2026-08-15

Scope: pricing restructure (included chat, fair-use caps, overflow), one-time
top-ups, Media Studio live generation and video credit reliability. Code
changes are complete; this machine cannot run the toolchain, so
`npm test && npm run lint && npm run build` were hand-reviewed rather than
executed here — the operator's production build did catch and confirm a fix for
the `AttemptRow.cadence` type error. Live verification results below come from
operator production testing.

- Payments: the first real paid checkout (Everyday, GH₵125) is verified end to
  end in production; the 2026-08-14 checkout fixes (public-origin redirect,
  phone removed from the AI360 form) are deployed. ExpressPay is no longer
  "blocked": live billing is on for the manual prepaid pilot, and the sandbox
  probe blocked by the merchant allowlist is superseded by a real verified
  purchase. The delayed-notification, reversal and refund paths remain unproven
  live.
- Top-ups shipped: one-time bundles GH₵50 → 40, GH₵100 → 90 and GH₵200 → 185
  credits reuse the exact ExpressPay hosted checkout, server-side Query
  verification and idempotent activation path. Purchased credits are permanent
  and survive the monthly allowance rollover. A real top-up purchase is still
  to be made; the plan purchase path it shares is verified.
- Pricing restructure shipped: everyday chat is included (zero credit weight),
  bounded by per-plan daily fair-use caps (Explorer 10, Everyday 60, Builder
  120, Team 150; anonymous halves to 10) counted durably in
  `lab_chat_daily_counters` (migration 0017). Past the cap, signed-in users
  overflow at 1 credit per message; anonymous callers are hard-stopped.
  Premium models meter at measured cost × 2; metered work bypasses the
  free-chat cap. Agent plan approval is now free.
- Media Studio is live: `/api/studio/image` and `/api/studio/video` accept a
  raw prompt, and Media Studio now drives them honestly (real errors, real
  URLs, quote → confirm → poll for video) instead of showing placeholder
  assets. Image generation was verified in production by the operator on
  2026-08-15.
- Video reliability fixes landed: settlement only after download and persist,
  `cancelled`/`expired`/provider-404 treated as terminal refunds, resilient
  client polling with exponential backoff, and session-storage re-hydration so
  a refresh resumes the render. A production re-test of a full video render is
  pending.
- The "need credits" moment in Media Studio now offers both quick top-ups and
  monthly plans inline, priced from the catalogue API (never hardcoded).
- Migrations: 17 applied (through `0017_chat_daily_cap.sql`). The `npm test`
  count of 251/251 from the 2026-08-14 snapshot predates today's changes and
  must be re-run before the next release.

## Audit snapshot: 2026-08-14

- An external source review was checked against the running tree. Its claimed
  syntax errors in onboarding and billing were false; both routes compile and
  the release tests cover them.
- `npm test`: 251/251 pass, including new prepaid-entitlement regressions.
  `npm run lint` and the Next.js 16.3 production build pass.
- `npm audit --omit=dev`: zero known production vulnerabilities after updating
  the transitive `nanoid` lock entry to 3.3.18.
- Live database checks pass: schema/RLS across 34 tables and 16 migrations,
  credits 16/16, payments 15/15 and durable data 12/12.
- The credentialed ExpressPay sandbox probe is still blocked with provider
  status 4 because this machine's outbound IP is not on the merchant allowlist.
  Billing remains disabled until that probe and the real sandbox matrix run
  from the allowlisted staging host.
- The paid pilot is now described truthfully as one prepaid month per approved
  payment with no automatic renewal. Public top-up and cancellation promises
  were removed because neither belongs to this manual-renewal pilot.
- Paid credits can only be granted by the verified payment transaction. The
  free calendar-month refresher no longer grants a second paid allowance at a
  month boundary; expired paid access falls back to Explorer and inconsistent
  paid state fails closed.
- Unexpected auth resolution, credit settlement and checkout-state persistence
  failures now produce structured, redacted diagnostics with request context.
- Historical snapshots below are retained as dated evidence. Identity notes
  referring to the retired provider are superseded by Supabase Auth.

## Audit snapshot: 2026-08-10

- `npm test`: 169/169 pass.
- `npm run lint` and `npm run build`: pass on Next.js 16.3.0.
- `npm audit --omit=dev`: zero known production dependency vulnerabilities.
- Live public-provider checks: domains 6/6 and video catalogue 4/4 pass.
- Browser smoke test: landing, onboarding and Quick/Research/Create workspace
  navigation work; security headers are present; health returns 200 and
  readiness correctly returns 503 while required services are unavailable.
- `npm run db:postgres:verify` passes against the live database: 30 tables,
  row-level security on every one, zero grants to the `anon` role, 10
  migrations applied. `npm run credits:verify` 16/16 and `npm run data:verify`
  12/12 also pass.
- The 2026-08-08 note attributing the database verification failure to an
  IPv6-only direct hostname was wrong. The password contained an unencoded `@`
  and `.env.local` declared the connection URLs twice. Both are fixed; see
  `DECISIONS.md`. Whether the Hostinger runtime can reach IPv6 is still worth
  confirming, but it was never the cause and the session pooler is used
  regardless.
- Identity and tenant-isolation flows were not verified in that dated pass.
- The local shell is Node 24.15.0 while the supported production runtime is
  Node 22.x (`engines` and `.nvmrc`). CI and Hostinger must use Node 22.
- Credit enforcement now fails closed for authenticated work when the ledger is
  unavailable or an idempotency key is replayed. Paid routes preserve the
  resulting 402/409/503 status instead of collapsing every denial to 402.
- The pricing page now says checkout is closed while billing is disabled,
  instead of presenting the planned Mobile Money/card flow as already live.

## Audit snapshot: 2026-08-11

Scope: this pass re-ran the local build and test gates and read the identity and
credit source paths directly. It did not re-run the live-database or external
provider checks, so those results stand from the 2026-08-10 snapshot above.

- `npm test`: 194/194 pass. The suite has grown since the 2026-08-10 snapshot
  (169), including workspace-isolation, voice and credit cases.
- `npm run lint` and `npm run build`: pass on Next.js 16.3.0.
- `npm run prod:check`: READY for the configuration present in that dated pass.
  Billing, the browser pilot and the external error webhook were intentionally
  disabled and reported as warnings, not errors. Configuration presence did
  not constitute deployed end-to-end verification.
- Not re-run this pass: `npm audit --omit=dev`, `db:postgres:verify`,
  `credits:verify`, `data:verify` and the live domain/video-catalogue checks.
  Treat their last-known-good results as unchanged, not re-confirmed.
- The credit interface is no longer missing. `src/components/CreditBalance.tsx`
  reads `/api/credits` and shows the available balance, the amount reserved while
  a run is in progress, the plan and the per-task cost guide, with a link to
  plans. It is wired into the signed-in app shell.
- The credit ledger enforces double-entry writes, an atomic
  `available_credits >= required` balance guard, a 15-minute reservation TTL that
  is reclaimed on the next touch, settlement capped at the reserved amount with
  failures charging nothing. The 2026-08-14 audit supersedes the old allowance
  description and records the current Supabase Auth identity boundary.

## Capability matrix

| Capability                         | Code                                                                                                                                                                                                               | External configuration                                                                                 | Verification                                                                                                                                   | Release status                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Landing, onboarding and pricing    | Implemented                                                                                                                                                                                                        | None                                                                                                   | Responsive build checks pass                                                                                                                   | Ready                                |
| Guest workspace and local recovery | Implemented                                                                                                                                                                                                        | None                                                                                                   | Unit and browser checks pass                                                                                                                   | Pilot-ready                          |
| Chat and model routing             | Implemented                                                                                                                                                                                                        | OpenRouter key                                                                                         | Live key still required per environment                                                                                                        | Conditional                          |
| Web research and citations         | Implemented                                                                                                                                                                                                        | Search/tool provider path                                                                              | Representative-task evals pending                                                                                                              | Pilot-ready                          |
| Agent runtime                      | Plan, execute, synthesise, verify and revise pipeline with per-run cost and time ceilings; runs, tasks, events and artifacts persisted to Postgres                                                                 | OpenRouter key                                                                                         | Parsing and context handling unit tested; live end-to-end run still pending a key                                                              | Pilot-ready                          |
| Agent resume after crash           | Checkpoints written at every boundary                                                                                                                                                                              | Durable queue and worker                                                                               | A run still dies with its web request; state survives but nothing replays it                                                                   | Missing                              |
| Studio workflows                   | Implemented                                                                                                                                                                                                        | OpenRouter key                                                                                         | Durable background execution pending                                                                                                           | Private pilot                        |
| Image generation                   | Implemented with model failover; Media Studio raw-prompt mode live                                                                                                                                                 | Compatible OpenRouter models                                                                           | Verified in production (operator, 2026-08-15)                                                                                                  | Live                                 |
| Video generation                   | Quote → confirm → submit → poll → gallery; charge only after delivery; terminal-status refunds; resilient polling                                                                                                  | Compatible OpenRouter video model                                                                      | Reliability fixes landed; production re-test pending                                                                                           | In progress                          |
| Voice recording and transcription  | Implemented                                                                                                                                                                                                        | Browser microphone and STT model                                                                       | Physical mobile-browser test pending                                                                                                           | Private pilot                        |
| PDF and Word export                | Implemented                                                                                                                                                                                                        | None                                                                                                   | Automated build passes; document QA suite pending                                                                                              | Pilot-ready                          |
| Supabase sign-in and sign-up UI    | Implemented                                                                                                                                                                                                        | Supabase URL, publishable key, redirect allowlist and providers                                        | Unit/config checks pass; deployed sign-up, recovery and session-restore test pending                                                           | Conditional                          |
| Google and email/password sign-in  | Supported by Supabase Auth                                                                                                                                                                                         | Enable providers and production Google OAuth credentials                                               | Deployed end-to-end auth test pending                                                                                                          | Conditional                          |
| Personal tenancy                   | Implemented in application contracts                                                                                                                                                                               | Supabase Auth and Postgres                                                                             | Workspace-isolation unit tests pass; live cross-user test pending                                                                              | Private pilot                        |
| Organization tenancy               | Feature-gated                                                                                                                                                                                                      | Team-workspace flag plus reviewed membership lifecycle                                                 | Keep disabled for the individual paid pilot                                                                                                    | Later pilot                          |
| Cloud conversations and projects   | Implemented on Supabase Postgres                                                                                                                                                                                   | Supabase Auth plus `DATABASE_URL`                                                                      | Repository checks pass; live production-host and tenant-isolation verification pending                                                         | Private pilot                        |
| Supabase Postgres data plane       | Runtime repositories, migrations, RLS and pooler client implemented                                                                                                                                                | Supabase project and connection strings                                                                | Credit and data verification pass; Hostinger connectivity pending                                                                              | Pilot-ready                          |
| Usage ledger and cost records      | Schema and write contracts implemented                                                                                                                                                                             | Durable database                                                                                       | Live reconciliation test pending                                                                                                               | In progress                          |
| Rate limiting                      | Identity-aware burst/day limits; per workspace when signed in, network address as an anonymous backstop                                                                                                            | None                                                                                                   | Still process-local, so limits reset on restart and do not coordinate across instances                                                         | Pilot-ready, not production-scale    |
| Anonymous access to expensive work | Agent, Studio, image and video require an identified workspace whenever Supabase Auth is configured                                                                                                                | Supabase Auth settings                                                                                 | Unit tests pass; deployed test pending                                                                                                         | Implemented                          |
| Credit engine                      | Landed-cost conversion, per-feature reserve/floor/ceiling, settlement and plan economics implemented and unit tested                                                                                               | None                                                                                                   | Verified                                                                                                                                       | Ready                                |
| Credit ledger and reservations     | Reserve, settle, release, expiry and grant on Supabase Postgres; wired into chat, agent, image and video, plus chat fair-use counters and overflow metering                                                        | `DATABASE_URL`                                                                                         | `npm run credits:verify` passes 16/16 against the live database, including ledger reconciliation                                               | Pilot-ready                          |
| Allowance grants                   | Explorer refreshes lazily each calendar month; paid allowances come only from verified prepaid payments; top-up credits are permanent purchased credits                                                            | None for Explorer; verified provider for paid access                                                   | Unit regressions pass; live expiry transition pending                                                                                          | Pilot-ready                          |
| Credit interface                   | `/api/credits` returns balance, holds, cost table and the compact public plan list; `CreditBalance.tsx` shows balance, reservations, plan and cost guide; Media Studio shows an inline top-up-or-plan panel on 402 | None                                                                                                   | Wired in; Media Studio panel live, signed-in visual check of balance pending                                                                   | Pilot-ready                          |
| Chat fair-use caps and overflow    | Everyday chat included up to per-plan daily caps (10/60/120/150; anonymous halves); durable UTC-day counters; signed-in overflow at 1 credit per message; metered work bypasses caps                               | Migration 0017                                                                                         | Unit tests updated; live post-cap behaviour re-test pending                                                                                    | Live                                 |
| One-time credit top-ups            | GH₵50 → 40, GH₵100 → 90, GH₵200 → 185 credits through the same verified checkout; permanent purchased credits, never renew                                                                                         | Merchant live key and public callback URL                                                              | Shipped 2026-08-15; shares the verified plan checkout — a real top-up purchase still to be made                                                | Live in code, first purchase pending |
| Prepaid monthly access and credits | Verified payment activates one month and grants once; expiry falls back to Explorer                                                                                                                                | Database, payment provider and policies                                                                | Real production purchase verified end to end (2026-08-14)                                                                                      | Live in pilot                        |
| ExpressPay hosted checkout         | Provider-isolated adapter, durable attempts, return/notification routes, server-side query verification and idempotent activation; one-item checkout (plan or top-up)                                              | Merchant live key, public HTTPS callback URL and migrations `0006`/`0007`                              | Real Mobile Money purchase verified end to end in production (2026-08-14); delayed-notification, reversal and refund paths still unproven live | Live (prepaid pilot)                 |
| Logs and request IDs               | Structured redacted logs implemented                                                                                                                                                                               | Host log retention                                                                                     | External alerting absent                                                                                                                       | Pilot-ready                          |
| Customer Quality Loop              | Feedback, opt-in evidence, receipts, rule-first triage, bounded AI evaluation and reviewer desk implemented                                                                                                        | Database migration, reviewer IDs and optional alert webhook                                            | 7 focused unit tests and responsive browser checks pass; live urgent alert still requires verification                                         | Private pilot                        |
| Error monitoring                   | Sentry (server + browser errors, traces, warn/error logs) and Axiom (structured log shipping) wired through Next.js instrumentation; console and `lab_usage_events` remain                                            | `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` (provisioned), `SENTRY_AUTH_TOKEN` for source maps, and `AXIOM_TOKEN` / `AXIOM_DATASET` in the hosting environment | DSN provisioned; live verification pending a first event via `/sentry-example-page`                                                            | Configured, verify live              |
| Security headers                   | Hardened for Supabase Auth and hosted providers                                                                                                                                                                    | Production domains                                                                                     | Local smoke checks pass; production header scan pending                                                                                        | Implemented                          |
| Dependency security                | Production dependency audit clean                                                                                                                                                                                  | Regular update process                                                                                 | `npm audit --omit=dev` passes                                                                                                                  | Ready                                |
| Tools & Kits (discovery catalogue) | 17 listings across 11 project engines, organised by job (`src/lib/market-catalog.ts`); every listing carries the chosen intent into its Project brief                                                             | None                                                                                                    | `tests/market-catalog.test.ts` asserts every listing resolves to a real, deliverable-producing pack                                            | Live                                  |
| Brand Kit (knowledge and logo)     | Workspace-wide brand knowledge and logo, applied to generated documents; logo reuses the private asset pipeline; colours optional                                                                                 | None                                                                                                    | `tests/brand-update-contract.test.ts`, `tests/image-dimensions.test.ts` pass; migrations `0020`/`0021` applied and RLS-verified                | Live                                  |
| Answer verification (grounding)    | Freshness split from deep research; a required-freshness answer buffers until a source is found and is withheld, not guessed, if none is; a receipt line shows the check to the person                           | None                                                                                                    | `tests/context-engineering.test.ts` covers the freshness classifier; production behaviour not yet observed against real query volume           | Live, needs live-traffic review       |

## Architecture boundary

- Supabase Auth is the only identity and session authority.
- Supabase will provide Postgres, private object storage and optional Realtime.
- Next.js route handlers enforce product rules and server-side authorization.
- OpenRouter remains behind the server; provider keys never enter the browser.
- Long Agent, image and video work must move to a durable queue before scale.
- Payment redirects never activate credits. Only verified server-side events do.

## Release gates

### Gate 1: identity

- [x] Implement Supabase Auth as the single account and session authority.
- [ ] Add the production origin and `/auth/callback` to Supabase redirect URLs.
- [ ] Enable Google plus verified email/password and configure production OAuth.
- [ ] Pass sign-up, email confirmation, sign-in, password reset, Google sign-in,
      sign-out and session restoration on desktop and mobile.
- [ ] Pass a two-account isolation test against the deployed database.

### Gate 2: durable data

- [x] Create the Supabase production project in the approved region.
- [ ] Keep the project spend cap enabled and enforce MFA for administrators.
- [ ] Rotate the database password used during initial setup.
- [x] Apply the migration sequence through `0022_cost_ledger_privileges.sql`
      using the direct migration URL. Verified with
      `npm run db:postgres:verify`: RLS on every table (37) and zero grants to
      the anon role.
- [x] Percent-encode reserved characters in the database password. The password
      contains a literal `@` and must be written as `%40` in any connection URL.
- [x] Connect through Supabase's shared session pooler (port 5432). Verified
      locally; the same URL must be set on Hostinger.
- [ ] Use the transaction pooler (port 6543) only if the API moves to a
      serverless or short-lived runtime.
- [x] Replace MySQL-specific repositories; Postgres is the only data plane.
- [x] Confirm there were no authenticated MySQL records to migrate before the
      cutover, as recorded in `DECISIONS.md`.
- [ ] Pass personal and organization tenant-isolation tests.
- [ ] Confirm daily backups and perform a documented restore rehearsal.

### Gate 3: cost and abuse controls

- [ ] Replace process-memory daily quotas with a shared atomic limiter.
- [x] Limit by workspace rather than network address, so shared connections do
      not throttle genuine users, with a reduced anonymous allowance as a backstop.
- [x] Require a signed-in workspace for expensive Agent, Studio, image and video
      work whenever identity is configured.
- [x] Define the credit engine: landed cost, per-feature reserve and ceiling,
      settlement rules and plan economics (`src/lib/billing/credits.ts`).
- [x] Persist credit accounts and reservations, then reserve before expensive
      work and settle actual cost afterward. Credits live in Supabase Postgres only.
- [x] Port every remaining route from MySQL and remove the second data plane.
      `src/lib/mysql.ts`, `database/schema.sql`, the MySQL migration script and the
      `mysql2` dependency are deleted. Verified with `npm run data:verify`: 12 of 12
      checks pass against the live database.
- [x] Deliver the allowance policy. Explorer refreshes lazily on first touch of
      a new calendar month. Paid pilot credits are granted only by a verified
      payment and never refresh without another payment.
- [ ] Add application, workspace and user spend caps.
- [ ] Add provider timeouts, circuit breakers and failover metrics.

### Gate 4: operations

- [ ] Add Sentry or an equivalent error destination and alert on sustained 5xx. (In progress: Sentry + Axiom are wired and the DSN is provisioned; email alerts to configure once a first event is verified live.)
- [ ] Add product analytics with consent-aware event collection.
- [ ] Create a durable queue for long-running work and cancellation.
- [ ] Store private uploads and generated assets in Supabase Storage with signed URLs.
- [ ] Run a production-like load test and inspect slow queries.
- [ ] Publish incident, retention, deletion, refund and support procedures.
- [ ] Confirm the quality-loop migration (`0006`) is applied, assign at least two quality reviewers and test an S0 alert end to end.
- [ ] Set staffed review hours and measure urgent acknowledgement and fix-verification time.

### Gate 5: payments

- [x] Select ExpressPay's hosted Merchant API so payment credentials stay on the provider page.
- [x] Complete one real Mobile Money purchase end to end in production (2026-08-14: Everyday plan, server-side query verified, credits granted exactly once).
- [ ] Complete one real top-up purchase end to end in production.
- [ ] Complete one sandbox card and one sandbox Mobile Money payment, including delayed notification and duplicate-callback checks.
- [ ] Confirm post-url retry behavior with merchant support; verify every notification through Query and replay it to prove idempotency.
- [ ] Test success, delay, abandonment, duplicate, reversal and refund paths.
- [ ] Reconcile payment, subscription and credit-ledger records.
- [ ] Keep checkout on the verified prepaid path; do not enable automatic renewal until all previous gates pass.

## Operator commands

```bash
npm run lint
npm test
npm run build
npm audit --omit=dev
npm run prod:check
```

- `/api/health` is a liveness endpoint. It should return HTTP 200 when the web
  process is running.
- `/api/ready` is a dependency and configuration gate. It returns HTTP 503
  until required production systems are configured and reachable.
- A deployment is not ready merely because `/api/health` succeeds.

## Owner approvals still required

These actions change external state, incur cost or depend on private credentials:

1. Purchase/activate Supabase Pro and select the permanent project region.
2. Configure the Supabase Auth production providers and redirect allowlist without sending secrets in chat.
3. Configure the production Google OAuth consent screen and credentials.
4. Approve an error-monitoring provider and its data-retention settings.
5. Keep ExpressPay checkout on the verified prepaid path and prove the live failure paths (delayed notification, reversal, refund) before enabling automatic renewal.
