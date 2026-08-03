# AI 360 Lab on Hostinger

AI 360 Lab is a full Next.js application with server-side API routes. Deploy it
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
OPENROUTER_SITE_URL=https://lab.aithreesixty.tech
OPENROUTER_SITE_NAME=AI 360 Lab
OPENROUTER_IMAGE_MODEL=openai/gpt-image-1-mini
OPENROUTER_IMAGE_MODELS=openai/gpt-image-1-mini,google/gemini-3.1-flash-lite-image
OPENROUTER_VIDEO_MODEL=google/veo-3.1-lite
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<Clerk production publishable key>
CLERK_SECRET_KEY=<Clerk production secret key>
CLERK_WEBHOOK_SIGNING_SECRET=<Clerk webhook signing secret>
NEXT_PUBLIC_AI360_TEAM_WORKSPACES=false
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=<dedicated Lab database name from Hostinger>
MYSQL_USER=<dedicated Lab database user>
MYSQL_PASSWORD=<dedicated Lab database password>
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
```

Deploy the temporary Hostinger URL first. Open `/api/health` and confirm it
returns `"status":"ok"`, `"aiConfigured":true`, `"authConfigured":true`,
`"clerkWebhookConfigured":true`, `"usageLedgerConfigured":true` and
`"databaseStatus":"connected"`.

## Authentication and database setup

Use the same Hostinger MySQL service as `aithreesixty.tech`, but create a
separate logical database and database user for the Lab. This isolates the
public product's user data and high-write chat traffic from the informational
website.

1. In hPanel, open **Databases > Management** for `aithreesixty.tech`.
2. Create a database for the Lab and a dedicated user with access only to that
   database. Hostinger may prefix both names with your account identifier.
3. Prefer setting the MySQL variables locally and running `npm run db:migrate`.
   This creates the current schema and safely upgrades an earlier Lab schema.
   Import `database/schema.sql` directly only for a completely empty database.
4. Add the five `MYSQL_*` values above to the Lab web app's Environment
   Variables. On Hostinger managed hosting, the application host is normally
   `localhost`.
5. Reuse the existing AI 360 Clerk application so learners have one identity
   across the informational site and Lab. In Clerk Organizations settings, use
   optional membership, disable automatic first-Organization creation, and keep
   public Organization creation disabled during the pilot.
6. Allow `lab.aithreesixty.tech` in the Clerk production domain settings, add
   the same production keys to Hostinger, redeploy, then test account creation,
   sign-in, sign-out and conversation sync in two browsers.
7. Leave `NEXT_PUBLIC_AI360_TEAM_WORKSPACES=false` until personal/team tenant
   isolation has passed in production. Set it to `true` and redeploy to expose
   the Organization switcher for the controlled team-workspace pilot.

### Clerk lifecycle webhook

The webhook keeps the Lab's local user, workspace and membership records aligned
with Clerk. Clerk remains the authority for live access decisions; MySQL stores
the durable application record needed by projects, usage and future billing.

1. In the Clerk production instance, create an endpoint at
   `https://lab.aithreesixty.tech/api/webhooks/clerk`.
2. Subscribe to `user.created`, `user.updated`, `user.deleted`,
   `organization.created`, `organization.updated`, `organization.deleted`,
   `organizationMembership.created`, `organizationMembership.updated` and
   `organizationMembership.deleted`.
3. Copy the endpoint signing secret into Hostinger as
   `CLERK_WEBHOOK_SIGNING_SECRET`, then redeploy.
4. Send a Clerk test event and confirm Runtime logs contain
   `clerk.webhook.processed`. Replayed event IDs are accepted but ignored, so a
   provider retry cannot duplicate a lifecycle change.

Guest access remains available. Guests save chats in their browser; signed-in
users gain private cross-device sync. AI routes are intentionally not hard-gated
yet, so enabling authentication cannot interrupt a class already in progress.

## Connect the subdomain

1. From the Node.js application dashboard, select **Connect domain**.
2. Enter `lab.aithreesixty.tech`.
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
AI 360 Lab writes one-line JSON events that are easy to search and correlate.

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
https://lab.aithreesixty.tech/api/health
```

It confirms whether the service is running and whether an OpenRouter key is
configured. It never returns the key itself.

Studio image and video generation are disabled unless the user first approves
the asset and then confirms the provider-cost dialog. Video quotes are read from
OpenRouter immediately before submission. Finished media, prompts and base64
file data are excluded from application logs.
