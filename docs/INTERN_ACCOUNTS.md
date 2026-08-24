# Accounts to set up on your work laptop

Welcome. These are the platforms AI360 runs on. Sign in to each one on your
official laptop.

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
> them through OpenRouter (below) rather than directly.

## 2. Hostinger

- **What it is:** Our web hosting and DNS provider.
- **How we use it:** It runs the live ai360.africa site. Production settings —
  database connection, API keys, feature flags — are set in the hPanel Node.js
  panel, not in any file in the repo. DNS for the domain is managed here too.
- **Read first:** [`HOSTINGER_DEPLOYMENT.md`](../HOSTINGER_DEPLOYMENT.md)
- **Sign in:** https://hpanel.hostinger.com

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

## 6. Arkesel

- **What it is:** A Ghanaian messaging provider for sending SMS.
- **How we use it:** SMS notifications to users — the short alerts that need to
  arrive on a phone rather than in an inbox. Email notifications are Resend's
  job; this is the SMS side of the same picture. **Every message costs money.**
- **In the code:** not wired in yet — there is no Arkesel integration in the
  repository at time of writing.
- **Sign in:** https://sms.arkesel.com

## 7. ExpressPay — awareness only

- **What it is:** The Ghanaian payment gateway that takes customer payments.
- **How we use it:** Real-money checkout, currently held closed behind
  `NEXT_PUBLIC_BILLING_ENABLED=false`. **You will not get an account for
  this** — it is live merchant access. It is listed so you know it exists when
  you read the payment code.
- **Read if you touch payments:** [`docs/EXPRESSPAY_RUNBOOK.md`](EXPRESSPAY_RUNBOOK.md)

---

*To update this list: add or edit a section, change the "Last updated" date,
and commit. Keep the same shape for each entry — what it is, how we use it,
where it appears in the code, and the sign-in link.*
