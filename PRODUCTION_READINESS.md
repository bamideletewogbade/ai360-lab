# AI 360 Lab production readiness

Last reviewed: 2026-08-04

This document is the release truth for AI 360 Lab. A feature is only marked
ready when its code, configuration, external service and failure path have been
verified. A polished screen alone is not considered production-ready.

## Executive status

**Current release state: private pilot candidate, not yet ready for unrestricted public use.**

The product experience is functional in guest mode and the core AI routes are
implemented. The remaining launch blockers are identity credentials, a durable
production database, distributed cost controls and live verification of the
external media and payment providers.

## Capability matrix

| Capability | Code | External configuration | Verification | Release status |
| --- | --- | --- | --- | --- |
| Landing, onboarding and pricing | Implemented | None | Responsive build checks pass | Ready |
| Guest workspace and local recovery | Implemented | None | Unit and browser checks pass | Pilot-ready |
| Chat and model routing | Implemented | OpenRouter key | Live key still required per environment | Conditional |
| Web research and citations | Implemented | Search/tool provider path | Representative-task evals pending | Pilot-ready |
| Agent and Studio workflows | Implemented | OpenRouter key | Durable background execution pending | Private pilot |
| Image generation | Implemented with model failover | Compatible OpenRouter models | Production generation test pending | Unverified externally |
| Video generation | Implemented with quote/status/download flow | Compatible OpenRouter video model | Production generation and retention test pending | Unverified externally |
| Voice recording and transcription | Implemented | Browser microphone and STT model | Physical mobile-browser test pending | Private pilot |
| PDF and Word export | Implemented | None | Automated build passes; document QA suite pending | Pilot-ready |
| Clerk sign-in and sign-up UI | Implemented | Clerk dev/prod keys, domain and strategies | Blocked because keys are absent locally | Blocked |
| Google and email/password sign-in | Supported by Clerk UI | Enable both in Clerk; production Google OAuth credentials | End-to-end auth test pending | Blocked |
| Last-used sign-in hint | Supported natively by Clerk | Enable for the existing Clerk instance | Visual test pending | Blocked |
| Personal and organization tenancy | Implemented in application contracts | Clerk Organizations settings and keys | Cross-tenant integration tests pending | Private pilot |
| Cloud conversations and projects | Implemented for MySQL | MySQL credentials and migrated schema | Database unavailable locally | Blocked |
| Supabase Postgres target | Initial schema, RLS and pooler client prepared | Supabase project, region and connection strings | Runtime data-route cutover pending | In progress |
| Usage ledger and cost records | Schema and write contracts implemented | Durable database | Live reconciliation test pending | In progress |
| Rate limiting | Process-local burst/day limits implemented | None | Does not coordinate multiple instances | Not production-scale |
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
  required AI 360 subdomains.
- [ ] Enable Google plus verified email/password.
- [ ] Enable the native last-used-method hint.
- [ ] Configure the production Clerk webhook and replay a test event.
- [ ] Pass sign-up, sign-in, password reset, sign-out and session restoration on
  desktop and mobile.

### Gate 2: durable data

- [ ] Create the Supabase production project in the approved region.
- [ ] Keep the project spend cap enabled and enforce MFA for administrators.
- [ ] Apply `database/postgres/0001_initial.sql` using the direct migration URL.
- [ ] Connect Hostinger through Supabase's shared session pooler (port 5432).
- [ ] Use the transaction pooler (port 6543) only if the API moves to a
  serverless or short-lived runtime.
- [ ] Replace MySQL-specific repositories one route at a time.
- [ ] Migrate and reconcile existing records before switching reads.
- [ ] Pass personal and organization tenant-isolation tests.
- [ ] Confirm daily backups and perform a documented restore rehearsal.

### Gate 3: cost and abuse controls

- [ ] Replace process-memory daily quotas with a shared atomic limiter.
- [ ] Require a signed-in workspace for expensive Agent, image and video work,
  or enforce a deliberately small anonymous allowance.
- [ ] Reserve credits before expensive work and settle actual cost afterward.
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
