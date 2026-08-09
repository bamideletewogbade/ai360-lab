# AI360 staging release checklist

Use staging to prove the production topology without exposing payments,
browser automation or team workspaces.

## Release shape

- Deploy a Node.js 22 Next.js application from a reviewed commit.
- Use a temporary HTTPS hostname.
- Use the intended Supabase project and session pooler, or a production-shaped
  staging project when one is available.
- Set `AI360_DEPLOYMENT_ENV=staging`.
- Set `NEXT_PUBLIC_BILLING_ENABLED=false`.
- Set `AI360_BROWSER_PILOT_ENABLED=false`.
- Set `NEXT_PUBLIC_AI360_TEAM_WORKSPACES=false`.
- Never copy live payment credentials into staging.

## Before deploy

```powershell
npm ci
npm audit --omit=dev
npm run lint
npm test
npm run build
npm run prod:check
npm run db:postgres:verify
```

Record the commit SHA, schema migration list and the person approving the
release. Create a database backup before applying any new migration.

## After deploy

```powershell
npm run smoke:deploy -- https://your-staging-host.example
```

Then test one real flow for Chat, Research, project creation, Studio, voice and
cross-device recovery. Confirm that failed requests have request references and
that runtime logs contain no prompts, files, authorization headers or secrets.

## Promotion gate

Promote the exact tested commit only when:

- the release workflow is green
- `/api/health` and `/api/ready` return 200
- the deployed smoke suite passes
- all migrations are applied and verified
- mobile, tablet and desktop smoke tests pass
- rollback owner and previous known-good commit are recorded

Payments and browser work have separate release gates. A successful core
release does not authorize enabling either feature.
