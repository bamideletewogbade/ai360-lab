# AI360 Lab production readiness

Last reviewed: 2026-08-08

This document is the release truth for AI360 Lab. A feature is only marked
ready when its code, configuration, external service and failure path have been
verified. A polished screen alone is not considered production-ready.

## Executive status

**Current release state: private pilot candidate, not yet ready for unrestricted public use.**

The product experience is functional in guest mode and the core AI routes are
implemented. Supabase Postgres is the only application data plane and its
credit runtime has been verified. The remaining launch blockers include live
identity verification, runtime database connectivity from the production host,
a durable queue, distributed cost controls, monitoring and verification of
external media and payment providers.

## Audit snapshot: 2026-08-08

- `npm test`: 100/100 pass.
- `npm run lint` and `npm run build`: pass on Next.js 16.3.0.
- `npm audit --omit=dev`: zero known production dependency vulnerabilities.
- Live public-provider checks: domains 6/6 and video catalogue 4/4 pass.
- Browser smoke test: landing, onboarding and Quick/Research/Create workspace
  navigation work; security headers are present; health returns 200 and
  readiness correctly returns 503 while required services are unavailable.
- The configured Supabase direct hostname resolves only to IPv6 from this
  environment and the database verification scripts cannot connect. Replace
  the runtime URL with the Supabase session-pooler URL before the live data
  checks can be repeated from an IPv4-only host.
- Clerk and the canonical application URL are absent locally, so sign-in,
  webhook and tenant-isolation flows remain unverified.
- The local shell is Node 24.15.0 while the supported production runtime is
  Node 22.x (`engines` and `.nvmrc`). CI and Hostinger must use Node 22.
- Credit enforcement now fails closed for authenticated work when the ledger is
  unavailable or an idempotency key is replayed. Paid routes preserve the
  resulting 402/409/503 status instead of collapsing every denial to 402.
- The pricing page now says checkout is closed while billing is disabled,
  instead of presenting the planned Mobile Money/card flow as already live.

## Capability matrix

| Capability | Code | External configuration | Verification | Release status |
| --- | --- | --- | --- | --- |
| Landing, onboarding and pricing | Implemented | None | Responsive build checks pass | Ready |
| Guest workspace and local recovery | Implemented | None | Unit and browser checks pass | Pilot-ready |
| Chat and model routing | Implemented | OpenRouter key | Live key still required per environment | Conditional |
| Web research and citations | Implemented | Search/tool provider path | Representative-task evals pending | Pilot-ready |
| Agent runtime | Plan, execute, synthesise, verify and revise pipeline with per-run cost and time ceilings; runs, tasks, events and artifacts persisted to Postgres | OpenRouter key | Parsing and context handling unit tested; live end-to-end run still pending a key | Pilot-ready |
| Agent resume after crash | Checkpoints written at every boundary | Durable queue and worker | A run still dies with its web request; state survives but nothing replays it | Missing |
| Studio workflows | Implemented | OpenRouter key | Durable background execution pending | Private pilot |
| Image generation | Implemented with model failover | Compatible OpenRouter models | Production generation test pending | Unverified externally |
| Video generation | Implemented with quote/status/download flow | Compatible OpenRouter video model | Production generation and retention test pending | Unverified externally |
| Voice recording and transcription | Implemented | Browser microphone and STT model | Physical mobile-browser test pending | Private pilot |
| PDF and Word export | Implemented | None | Automated build passes; document QA suite pending | Pilot-ready |
| Clerk sign-in and sign-up UI | Implemented | Clerk dev/prod keys, domain and strategies | Blocked because keys are absent locally | Blocked |
| Google and email/password sign-in | Supported by Clerk UI | Enable both in Clerk; production Google OAuth credentials | End-to-end auth test pending | Blocked |
| Last-used sign-in hint | Supported natively by Clerk | Enable for the existing Clerk instance | Visual test pending | Blocked |
| Personal and organization tenancy | Implemented in application contracts | Clerk Organizations settings and keys | Cross-tenant integration tests pending | Private pilot |
| Cloud conversations and projects | Implemented on Supabase Postgres | Clerk plus `DATABASE_URL` | Repository checks pass; live production-host and tenant-isolation verification pending | Private pilot |
| Supabase Postgres data plane | Runtime repositories, migrations, RLS and pooler client implemented | Supabase project and connection strings | Credit and data verification pass; Hostinger connectivity pending | Pilot-ready |
| Usage ledger and cost records | Schema and write contracts implemented | Durable database | Live reconciliation test pending | In progress |
| Rate limiting | Identity-aware burst/day limits; per workspace when signed in, network address as an anonymous backstop | None | Still process-local, so limits reset on restart and do not coordinate across instances | Pilot-ready, not production-scale |
| Anonymous access to expensive work | Agent, Studio, image and video require an identified workspace whenever Clerk is configured | Clerk keys | End-to-end test pending live keys | Implemented |
| Credit engine | Landed-cost conversion, per-feature reserve/floor/ceiling, settlement and plan economics implemented and unit tested | None | Verified | Ready |
| Credit ledger and reservations | Reserve, settle, release, expiry and grant on Supabase Postgres; wired into chat, agent, image and video | `DATABASE_URL` | `npm run credits:verify` passes 11/11 against the live database, including ledger reconciliation | Pilot-ready |
| Monthly allowance grants | Lazy renewal on first touch of a new period; unused allowance expires, purchased credits survive | None, no scheduler required | Covered by `npm run credits:verify` including a rollover case | Pilot-ready |
| Credit interface | `/api/credits` returns balance, holds and cost table | None | No screen displays a balance | Missing |
| Subscriptions and credits | Catalog and ledger schema prepared | Database, payment provider and policies | No live entitlement activation | In progress |
| MojoPay checkout | Safe disabled boundary implemented | Signed API/webhook contract and credentials | Sandbox scenarios pending | Blocked intentionally |
| Logs and request IDs | Structured redacted logs implemented | Host log retention | External alerting absent | Pilot-ready |
| Error monitoring | Runtime logs only | Sentry or equivalent | Not configured | Missing |
| Security headers | Hardened; Clerk-compatible CSP | Clerk domain DNS | Production header scan pending | Implemented |
| Dependency security | Production dependency audit clean | Regular update process | `npm audit --omit=dev` passes | Ready |

## Architecture boundary

- Clerk is the only identity and session authority.
- Supabase will provide Postgres, private object storage and optional Realtime.
- Supabase Auth must not become a second user identity system.
- Next.js route handlers enforce product rules and server-side authorization.
- OpenRouter remains behind the server; provider keys never enter the browser.
- Long Agent, image and video work must move to a durable queue before scale.
- Payment redirects never activate credits. Only verified server-side events do.

## Release gates

### Gate 1: identity

- [ ] Add Clerk test keys locally and live keys to Hostinger.
- [ ] Configure `aithreesixty.tech` as the production root and allow only the
  required AI360 subdomains.
- [ ] Enable Google plus verified email/password.
- [ ] Enable the native last-used-method hint.
- [ ] Configure the production Clerk webhook and replay a test event.
- [ ] Pass sign-up, sign-in, password reset, sign-out and session restoration on
  desktop and mobile.

### Gate 2: durable data

- [x] Create the Supabase production project in the approved region.
- [ ] Keep the project spend cap enabled and enforce MFA for administrators.
- [ ] Rotate the database password used during initial setup.
- [x] Apply `database/postgres/0001_initial.sql` and `0002_runtime_foundation.sql`
  using the direct migration URL. Verified with `npm run db:postgres:verify`:
  22 tables, row-level security on every one, zero grants to the anon role.
- [ ] Confirm whether the Hostinger runtime can reach IPv6. The direct host
  `db.<ref>.supabase.co` resolves AAAA only, so `DATABASE_URL` must use the
  session pooler if the host is IPv4-only.
- [ ] Connect Hostinger through Supabase's shared session pooler (port 5432).
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
- [x] Deliver the monthly allowance. Renewal is lazy: the first touch of a new
  period expires unused allowance and grants the current plan's credits, so no
  scheduled job can fail to run.
- [ ] Add application, workspace and user spend caps.
- [ ] Add provider timeouts, circuit breakers and failover metrics.

### Gate 4: operations

- [ ] Add Sentry or an equivalent error destination and alert on sustained 5xx.
- [ ] Add product analytics with consent-aware event collection.
- [ ] Create a durable queue for long-running work and cancellation.
- [ ] Store private uploads and generated assets in Supabase Storage with signed URLs.
- [ ] Run a production-like load test and inspect slow queries.
- [ ] Publish incident, retention, deletion, refund and support procedures.

### Gate 5: payments

- [ ] Approve MojoPay's signed contract and API documentation.
- [ ] Verify webhook signatures, retry behavior and idempotency.
- [ ] Test success, delay, abandonment, duplicate, reversal and refund paths.
- [ ] Reconcile payment, subscription and credit-ledger records.
- [ ] Enable billing only after all previous gates pass.

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
2. Add Clerk development and production credentials without sending secrets in chat.
3. Configure the production Google OAuth consent screen and credentials.
4. Approve an error-monitoring provider and its data-retention settings.
5. Approve MojoPay only after its sandbox and webhook contract are available.
