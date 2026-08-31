# AI360 on Hostinger

AI360 is a full Next.js application with server-side API routes. Deploy it
as a **Node.js Web App** using Hostinger's **Next.js** framework preset. Do not
deploy it as a static website.

The public product page lives at `/`. The working environment lives at `/app`.
Landing-page goals are carried into the correct Quick, Research or Create mode,
and the installable PWA opens directly into `/app`.

## Requirements

- Hostinger Business Web Hosting or a Cloud hosting plan
- GitHub repository access
- A newly rotated OpenRouter API key

## Create the application

1. In hPanel, open **Websites** and select **Add Website**.
2. Choose **Deploy Web App** or **Node.js Web App**.
3. Select **Import Git Repository**, authorize GitHub, and choose the
   `ai360-lab` repository.
4. Deploy the `main` branch.
5. Confirm these settings:

   - Framework: `Next.js`
   - Node.js: `22.x`
   - Package manager: `npm`
   - Install command: `npm install` or Hostinger's default
   - Build command: `npm run build`
   - Start command: `npm start`
   - Output directory, if requested: `.next`
   - Entry file: leave empty when the Next.js preset is selected

## Production environment variables

Add these in hPanel. Never prefix the OpenRouter key with `NEXT_PUBLIC_`.

```text
OPENROUTER_API_KEY=<newly rotated key>
NEXT_PUBLIC_APP_URL=https://ai360.africa
AI360_DEPLOYMENT_ENV=production
OPENROUTER_SITE_URL=https://ai360.africa
OPENROUTER_SITE_NAME=AI360
OPENROUTER_IMAGE_MODEL=openai/gpt-image-1-mini
OPENROUTER_IMAGE_MODELS=openai/gpt-image-1-mini,google/gemini-3.1-flash-lite-image
MEDIA_JOB_SIGNING_SECRET=<long random application secret>
OPENROUTER_WEBHOOK_SECRET=<secret configured in the OpenRouter workspace>
AI360_MEDIA_RECONCILE_SECRET=<long random secret for the video sweep>
NEXT_PUBLIC_AI360_TEAM_WORKSPACES=false
DATABASE_URL=<Supabase shared session-pooler URL on port 5432>
DIRECT_URL=<Supabase direct migration URL or reviewed migration connection>
DATABASE_POOL_SIZE=5
DATABASE_SSL=require
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>
SUPABASE_SECRET_KEY=<server-only Supabase secret key>
SUPABASE_PRIVATE_BUCKET=ai360-private
NEXT_PUBLIC_BILLING_ENABLED=false
PAYMENTS_PROVIDER=expresspay
EXPRESSPAY_ENV=live
EXPRESSPAY_MERCHANT_ID=<ExpressPay merchant ID>
EXPRESSPAY_API_KEY=<server-only ExpressPay API key>
GOOGLE_SITE_VERIFICATION=<optional Google Search Console token>
BING_SITE_VERIFICATION=<optional Bing Webmaster Tools token>
AI360_RATE_CHAT_PER_MINUTE=12
AI360_RATE_CHAT_PER_DAY=80
AI360_RATE_AGENT_PER_MINUTE=4
AI360_RATE_AGENT_PER_DAY=16
AI360_RATE_STUDIO_PER_MINUTE=5
AI360_RATE_STUDIO_PER_DAY=24
AI360_RATE_STUDIO_IMAGE_PER_MINUTE=2
AI360_RATE_STUDIO_IMAGE_PER_DAY=8
AI360_RATE_STUDIO_VIDEO_PER_MINUTE=1
AI360_RATE_STUDIO_VIDEO_PER_DAY=3
AI360_RATE_VOICE_PER_MINUTE=5
AI360_RATE_VOICE_PER_DAY=24
AI360_QUALITY_REVIEWER_IDS=<comma-separated reviewer user IDs>
AI360_QUALITY_ALERT_WEBHOOK_URL=<optional server-to-server urgent alert URL>
AI360_QUALITY_EVALUATOR_MODEL=openai/gpt-5.6-luna
AI360_BROWSER_PILOT_ENABLED=false
AI360_BROWSER_PROVIDER=browserbase
AI360_BROWSER_PILOT_USER_IDS=
AI360_BROWSER_ALLOWED_DOMAINS=
BROWSERBASE_API_KEY=
BROWSERBASE_PROJECT_ID=
BROWSERBASE_NAVIGATE_FUNCTION_ID=
AI360_BROWSER_SCREENSHOT_RETENTION_HOURS=24
AI360_BROWSER_CLEANUP_SECRET=
AI360_ERROR_ALERT_WEBHOOK_URL=
AI360_ERROR_ALERT_WEBHOOK_TOKEN=
```

Before deployment, run `npm run prod:check`. Deploy the temporary Hostinger URL
first. Open `/api/health` and confirm it returns HTTP 200 with `"status":"ok"`.
Then open `/api/ready`; it must return HTTP 200 with `"status":"ready"` and
`"databaseConnection":"connected"`. A 503 response includes safe configuration
checks that identify the remaining release blockers without exposing secrets.

After the temporary deployment passes readiness, run:

```text
npm run smoke:deploy -- https://the-temporary-hostinger-url.example
```

Run the authenticated document smoke separately with a dedicated test account.
Set `AI360_SMOKE_EMAIL` and `AI360_SMOKE_PASSWORD` in the environment file; the
script creates and downloads PDF, DOCX, and XLSX files through chat, then removes
only the exact test assets it created.

```bash
npm run smoke:documents -- https://ai360.africa ai360-production.env
```

The smoke suite checks health, dependency readiness, security headers, public
routes, private-workspace indexing rules and discovery files. Follow
`STAGING_RELEASE_CHECKLIST.md` before connecting the live domain and
`ROLLBACK_AND_RESTORE.md` if the release needs to be reversed.

### Optional external error delivery

AI360 always writes redacted structured server errors to Runtime logs. Setting
`AI360_ERROR_ALERT_WEBHOOK_URL` additionally sends the same bounded event to an
HTTPS monitoring destination. Set `AI360_ERROR_ALERT_WEBHOOK_TOKEN` only when
that destination requires bearer authentication. Prompts, files, cookies,
headers and customer identifiers are excluded from this payload.

### Video delivery and reconciliation

Video renders finish on the server, not in the customer's tab. Two things carry
that, and the second is what makes it safe:

1. Register `https://<your-domain>/api/webhooks/openrouter/video` as the video
   callback in the OpenRouter workspace and set `OPENROUTER_WEBHOOK_SECRET` to
   the same signing secret on both sides. The callback URL is only sent to the
   provider when that secret is present and the app URL is HTTPS.
2. Schedule an authenticated `POST` to `/api/internal/media/reconcile-video`
   every five minutes, sending `Authorization: Bearer
   <AI360_MEDIA_RECONCILE_SECRET>`. This finishes any render the callback did
   not deliver, refunds renders the provider has lost, and returns credits held
   for renders that never finished. Without it a single missed callback leaves
   a customer's credits held for a video they never received.

Apply `database/postgres/0030_video_webhooks.sql` before enabling either — both
paths record their delivery in `lab_media_webhook_events` to stay idempotent.

### Read-only browser worker

Keep `AI360_BROWSER_PILOT_ENABLED=false` for the core release. Before a closed
pilot, publish `workers/browser-observer`, configure the returned Function ID,
create the private Storage bucket and schedule an hourly authenticated `POST`
to `/api/internal/browser-artifacts/cleanup`. The readiness gate requires the
worker, named pilot users, allowed domains, private storage and cleanup secret
as one complete configuration.

## Authentication and database setup

Supabase Postgres is the only application data plane. Do not create or restore a
parallel Hostinger MySQL database. For Hostinger's persistent Node process, use
the Supabase shared session-pooler URL on port 5432 as `DATABASE_URL`. Keep
`DIRECT_URL` for migrations. If the direct database endpoint cannot be reached
because the host is IPv4-only, use the session pooler for the migration or apply
the reviewed SQL through the Supabase SQL Editor. Never expose a database
password or secret key in a `NEXT_PUBLIC_` variable.

1. Create the Supabase project in the approved region, enforce administrator
   MFA and retain the spend cap during the pilot.
2. Apply every file under `database/postgres` in numeric order with
   `npm run db:postgres:migrate`, then run `npm run db:postgres:verify`.
3. Add `DATABASE_URL`, `DIRECT_URL`, database pool settings and the required
   Supabase variables to the Lab web app environment.
4. Run `npm run data:verify`, `npm run credits:verify` and
   `npm run runs:verify` against the intended project before deployment.
5. Use the production Supabase Auth project so learners have one identity across
   the informational site and Lab.
6. In Supabase Authentication -> URL Configuration, keep
   `https://ai360.africa` as the Site URL and allow
   `https://ai360.africa/auth/callback`, `https://ai360.africa/**` and
   `http://localhost:3000/auth/callback` while local testing shares the same
   auth project. Redeploy, then test account creation, sign-in, sign-out and
   conversation sync in two browsers.
7. Leave `NEXT_PUBLIC_AI360_TEAM_WORKSPACES=false` until personal/team tenant
   isolation has passed in production. Set it to `true` and redeploy to expose
   the Organization switcher for the controlled team-workspace pilot.

### Retired Clerk lifecycle webhook

AI360 now uses Supabase Auth directly. The old `/api/webhooks/clerk` endpoint
intentionally returns a retired message and does not need Hostinger environment
variables.

Guest access remains available for supported low-cost flows and browser-local
recovery. Signed-in users gain private cross-device sync. Whenever Supabase Auth
is configured, expensive Agent, Studio, image and video work requires an
identified workspace.

## Connect the subdomain

1. From the Node.js application dashboard, select **Connect domain**.
2. Enter `ai360.africa`.
3. If `aithreesixty.tech` uses Hostinger nameservers, Hostinger creates the DNS
   routing and SSL certificate automatically.
4. If the domain uses external nameservers, add the DNS record shown by hPanel
   at the provider that controls DNS.
5. If a previous CNAME for `lab` points to another platform, remove it before
   connecting Hostinger.

After changing environment variables or deployment settings, use
**Settings & Redeploy** so the new values take effect.

The homepage sends `Cache-Control: no-store` because it is the application
shell. This prevents Hostinger CDN from keeping an older interface after a Git
deployment. If the dashboard still shows a stale version immediately after
deploying, use **Cache → Clear cache** once, then reload the site.

## Troubleshooting with Runtime Logs

Open the application in hPanel, then select **Runtime logs** from the sidebar.
AI360 writes one-line JSON events that are easy to search and correlate.

Every API request has a `requestId`. When an error is shown in the interface,
copy the reference value and search for it in Runtime logs. A typical request
produces:

```text
request.started
chat.accepted
provider.request.started
provider.stream.connected
request.completed
```

Failures use events such as:

```text
provider.request.failed
chat.stream.failed
agent.stream.failed
studio.provider.retrying
studio.generation.failed
studio.image.failed
studio.image.provider_failed
studio.video.failed
studio.video.download_failed
transcription.failed
export.failed
```

Useful fields include the route, selected model, provider status, provider
error code, duration, token usage, estimated provider cost, attachment types
web-search usage, source count and final outcome. Message text, file contents, recordings, API keys,
authorization headers and cookies are not logged.

The health endpoint is:

```text
https://ai360.africa/api/health
```

It confirms whether the service is running and whether an OpenRouter key is
configured. It never returns the key itself.

Studio image and video generation are disabled unless the user first approves
the asset and then confirms the provider-cost dialog. Video quotes are read from
OpenRouter immediately before submission. Finished media, prompts and base64
file data are excluded from application logs.
