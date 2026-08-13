---
name: frontier-adapt
description: Examine how a feature is built today, research how frontier/leading companies solve the same problem, then recommend what fits AI360's specific context. Use whenever the user wants to check the current implementation of something and benchmark it against top products before deciding a direction â€” phrasings like "how are we doing X, research what frontier companies do and what works for us", "check the current implementation then do global research", "benchmark against the top labs and adapt to our context", "what's the best way, look at how big companies do it". Produces an assessment + sourced research + a context-fitted, phased recommendation. Does NOT implement unless the user then asks.
---

# Frontier-adapt: understand â†’ research â†’ adapt

A repeatable three-step method for deciding a feature's direction. Follow the
steps in order and keep the output honest â€” the value is in the gap between what
we do now and what leading products do, resolved for *our* constraints, not a
copy of theirs.

## AI360 context (bake this into every recommendation â€” do not ask the user to restate it)

- **Product**: AI360 â€” a practical AI workspace built from Accra, Ghana.
- **Users**: mostly on **mobile**, often on **intermittent, slow or metered** connections (shared campus/office/cafÃ© networks). Optimise for offline-tolerance and low data cost.
- **Stack**: Next.js (App Router), Clerk (identity â€” the only auth authority), Supabase Postgres (the only data plane, RLS on every table), OpenRouter (AI gateway). Guest-first: people can use the product before signing in, and their local state should follow them into their account on sign-in (claim-on-login).
- **Scale**: private pilot, not yet unrestricted public. Prefer simple, robust, low-operational-cost solutions over anything needing new infrastructure (queues, realtime servers) unless clearly justified. See `PRODUCTION_READINESS.md` for release gates.
- **Values**: fail closed on paid/identity paths; never lose a person's work; no surprise costs; accessible, calm UI.

## Step 1 â€” Understand what we do today

Read the actual code, not the docs. Locate the feature's implementation
(components, API routes, `src/lib`, migrations) and state plainly:
- How it works now (data flow, storage, sync, auth scoping).
- What's already good.
- Concrete gaps and failure modes (offline, cross-device, guestâ†’account, conflicts, size limits, mobile).

Be specific with `file:line` references. Do not assume the docs are current â€” verify against running code.

## Step 2 â€” Global research

Use WebSearch to find how **leading / frontier companies** solve the same
problem. Pick the right reference set for the domain (e.g. ChatGPT, Claude,
Linear, Notion, Figma, Stripe, Vercel, Slack). Pull authoritative sources
(engineering blogs, docs, credible write-ups). Capture the *pattern and the
why*, not surface UI. Cite sources as markdown links. If a search is thin,
refine the query rather than guessing from memory.

## Step 3 â€” Adapt to our context

Synthesise a recommendation that fits the AI360 context above â€” never a blind
copy. Explicitly weigh mobile-first, intermittent connectivity, guest-first,
and the Clerk+Supabase stack. Structure it as:
- **Verdict**: the direction, in one or two sentences.
- **Why it fits us**: the context trade-offs that shaped it.
- **Phased plan**: quick wins (low risk, no new infra) first; deeper changes
  (new tables, queues, realtime) staged and clearly labelled with their cost.
- **What to leave alone**: where the current approach is already right.

## Step 4 â€” Offer, don't implement

Present the assessment and recommendation. Do **not** start implementing unless
the user asks. If they approve, follow the repo's conventions (provider-isolated
adapters, RLS + numbered migrations, structured logging, unit tests, run
lint/test/build) and verify in the browser when the change is observable.
