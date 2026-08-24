# Accounts to set up on your work laptop

Welcome. These are the platforms AI360 runs on. Sign in to each one on your
official laptop, turn on two-factor authentication where it is offered, and
tick it off below.

Your login details are sent to you separately — they are not written in this
file, and you should never paste them into chat, email, or a file in the
repository.

Last updated: 2026-08-24

---

## 1. Google (your work email)

- **What it is:** Your work mailbox and identity.
- **How we use it:** Every account below is registered against this address, so
  set this up first. Use it for all company platforms — never your personal
  Gmail.
- **Sign in:** https://mail.google.com

> **Note on Gemini:** we do use Google's Gemini and Veo models, but we reach
> them through OpenRouter (below). You do **not** need a Google AI Studio or
> Gemini API account — please don't create one, it would be a second way to
> spend money that nobody is tracking.

- [ ] Signed in
- [ ] 2FA enabled

## 2. Hostinger

- **What it is:** Our web hosting and DNS provider.
- **How we use it:** It runs the live ai360.africa site. Production settings —
  database connection, API keys, feature flags — are set in the hPanel Node.js
  panel, not in any file in the repo. DNS for the domain is managed here too.
- **Read first:** [`HOSTINGER_DEPLOYMENT.md`](../HOSTINGER_DEPLOYMENT.md)
- **Sign in:** https://hpanel.hostinger.com

- [ ] Signed in
- [ ] 2FA enabled

## 3. OpenRouter

- **What it is:** One API that routes to many AI model providers — OpenAI,
  Google, Anthropic and others — behind a single key and a single bill.
- **How we use it:** Every AI call the product makes goes through OpenRouter:
  chat, image generation and video. This is why we hold no direct OpenAI or
  Gemini accounts. **Every call costs real money**, so use the dev key you are
  given and keep an eye on the usage page.
- **In the code:** `OPENROUTER_*` in [`.env.example`](../.env.example) and
  [`src/lib/models.ts`](../src/lib/models.ts)
- **Sign in:** https://openrouter.ai

- [ ] Signed in
- [ ] 2FA enabled

## 4. Supabase

- **What it is:** Managed Postgres database plus a sign-in service.
- **How we use it:** It holds all application data — users, conversations,
  credits, billing records — and handles account sign-up, email verification
  and password resets. It also stores private files in the `ai360-private`
  bucket.
- **In the code:** `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_*` and
  `SUPABASE_SECRET_KEY` in [`.env.example`](../.env.example), plus the
  [`database/`](../database) folder
- **Sign in:** https://supabase.com/dashboard

- [ ] Signed in
- [ ] 2FA enabled

## 5. Resend

- **What it is:** A service for sending transactional email from the app.
- **How we use it:** Payment receipts, welcome messages, low-credit notices and
  urgent quality alerts. Sign-in and password-reset email is handled by
  Supabase, not Resend. Sending is currently switched off
  (`EMAIL_ENABLED=false`) until the domain is verified.
- **In the code:** `RESEND_API_KEY` and `EMAIL_*` in
  [`.env.example`](../.env.example); you can preview the templates in
  [`docs/build/email-previews/`](build/email-previews)
- **Sign in:** https://resend.com

- [ ] Signed in
- [ ] 2FA enabled

## 6. GitHub

- **What it is:** Where the code lives and where CI runs.
- **How we use it:** This repository. Work on a branch and open a pull request
  — do not push straight to `main`.
- **Sign in:** https://github.com

- [ ] Signed in
- [ ] 2FA enabled

## 7. Sentry

- **What it is:** Error and performance monitoring.
- **How we use it:** It catches exceptions from both the browser and the
  server, so it is the first place to look when something breaks in
  production.
- **In the code:** `NEXT_PUBLIC_SENTRY_DSN` in
  [`.env.example`](../.env.example)
- **Sign in:** https://sentry.io

- [ ] Signed in
- [ ] 2FA enabled

## 8. Axiom

- **What it is:** Log storage and search.
- **How we use it:** Our structured JSON logs are shipped here so they can be
  searched, kept, and alerted on.
- **In the code:** `AXIOM_TOKEN`, `AXIOM_DATASET` in
  [`.env.example`](../.env.example)
- **Sign in:** https://app.axiom.co

- [ ] Signed in
- [ ] 2FA enabled

## 9. ExpressPay — awareness only

- **What it is:** The Ghanaian payment gateway that takes customer payments.
- **How we use it:** Real-money checkout, currently held closed behind
  `NEXT_PUBLIC_BILLING_ENABLED=false`. **You will not get an account for
  this** — it is live merchant access. It is listed so you know it exists when
  you read the payment code.
- **Read if you touch payments:** [`docs/EXPRESSPAY_RUNBOOK.md`](EXPRESSPAY_RUNBOOK.md)

---

## Once you are in

1. Install Node.js 22.x and run `npm install`.
2. Copy `.env.example` to `.env.local` and fill in only the keys you were given.
   `.env.local` is git-ignored and must stay that way.
3. Run `npm run dev` and open http://localhost:3000.
4. Read [`TECHNICAL_HANDBOOK.md`](../TECHNICAL_HANDBOOK.md) — it is the main
   onboarding guide.

## Ground rules

- Never commit a secret. If you think you have, say so immediately — rotating a
  key takes minutes, and a leaked key found later can cost real money.
- Never paste a key or password into a chat message, an issue, or a document.
- Use your own account everywhere. Do not share a login with anyone.
- Turn on 2FA the moment you create an account, not later.

---

*To update this list: add or edit a section, change the "Last updated" date,
and commit. Keep the same shape for each entry — what it is, how we use it,
where it appears in the code, and the sign-in link.*
