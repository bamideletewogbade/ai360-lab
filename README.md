# AI360 Lab

AI360 Lab turns an ordinary-language goal into research, a decision, a document
or a coordinated creative outcome. It is built by AI360 with the Accra
Innovation Centre.

**Release state:** private pilot candidate. The public experience and core
workflows are functional, but the production gates in
[`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md) must pass before an
unrestricted launch.

## Start here

1. Install Node.js 22.x.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and add only the services needed for the
   flow you are testing.
4. Run `npm run dev` and open `http://localhost:3000`.

Guest UI work can run without Clerk or Postgres. Signed-in persistence, credit
accounting and production AI calls require their corresponding credentials.
Never commit secrets.

## Engineering entry points

- [`TECHNICAL_HANDBOOK.md`](TECHNICAL_HANDBOOK.md): canonical onboarding and
  operating guide
- [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md): architecture boundaries,
  quality budgets and scaling rules
- [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md): current release truth and
  open gates
- [`DECISIONS.md`](DECISIONS.md): decisions, incidents and measured provider
  behavior
- [`HOSTINGER_DEPLOYMENT.md`](HOSTINGER_DEPLOYMENT.md): production deployment
- [`PRICING_STRATEGY.md`](PRICING_STRATEGY.md): plan and credit economics

## Required verification

```bash
npm run lint
npm test
npm run build
npm run prod:check
```

Database, credits, media and live-provider verification commands are documented
in the technical handbook. A successful build is not production approval.
