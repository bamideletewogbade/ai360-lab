# Frontier-adapt: pricing by work done, product self-knowledge, and moat

**Date:** 15 August 2026
**Method:** Understand current implementation → global research on frontier companies and OpenRouter-native products → adapt to AI360's context.
**Status:** Assessment and recommendation only. No code changed.

---

## Step 1 — What we do today

### 1a. Pricing and billing

The engine (`src/lib/billing/credits.ts`) is deliberately "credits = bounded useful work, not tokens":

- **One credit represents GH₵0.26 of landed cost** (`CREDIT_VALUE_GHS`, derived from Everyday: GH₵125 × 25% AI-cost target ÷ 120 credits). Landed = provider charge + OpenRouter 5.5% fee + FX buffer, so 1 credit ≈ **$0.0172 of provider spend** at the working rate.
- **Feature weights are static per kind of work** (`FEATURE_WEIGHTS`, `credits.ts:75`): chat 1/1/2, chat.research 2/2/4, chat.document 2/2/4, agent 3/5/8, image 3/4/6, video 12/16/20, voice 1/1/2 (floor/reserve/ceiling).
- **Measured settlement already exists** (`settleCredits`, `credits.ts:163`): a finished task charges `max(floor, ceil(measuredUSD→credits))`, never above the reservation, and failure charges nothing. The chat route passes OpenRouter's real `usage.cost` into settlement (`src/app/api/chat/route.ts:219`).
- The ledger is **integer-only** (`lab_credit_accounts.available_credits` in `src/lib/billing/credit-repository.ts`), so every charge rounds up to a whole credit.

**Why every message feels like exactly 1 credit:** a typical chat turn on `gpt-5.6-luna` costs ~GH₵0.01 landed (≈$0.0007; measured live 2026-08-10, DECISIONS.md). Converting that to credits gives `ceil(0.01/0.26) = 1`. The 1-credit floor then dominates the measured value for every short message — 1 credit ≈ 25× the measured cost of a cheap turn. At Everyday's price (GH₵1.04/credit) that message collects GH₵1.04 for ~GH₵0.01 of AI cost.

The same flattening applies to the expensive end: research at $0.0063 also settles at its floor (2), and a 4-second video that measures at ~2 credits still charges its 12-credit floor. **The floors and ceilings — not the measurement — are what make pricing feel "static per kind of work."** The measurement is real and already logged per request (tokens + cost in usage events).

### 1b. Does the AI know about AI360?

No. `SYSTEM_PROMPT` (`src/lib/models.ts:136`) tells the model it is AI360 and to prefer Ghana/Africa examples, but contains **zero facts about the product**: no plans or prices, no credit behaviour, no Studio packs, no languages, no MoMo payment, no what-it-can-and-cannot-do. Ask "what can you do?" or "how much is Builder?" and it guesses. The policy router (`src/lib/context-engineering.ts`) decides live research; nothing decides product questions.

### 1c. Moat assets today

- **MoMo-first checkout** (ExpressPay Merchant API, hosted page, query-verified) — real distribution edge in Ghana, but a payment integration is copyable.
- **Ghanaian languages as a first-class setting** — Twi, Gã, Eʋegbe, Ghanaian Pidgin with scoped mirroring rules (`src/lib/languages.ts`), verified against live models. Frontier assistants do not do this for Ghana.
- **Local knowledge work** — domain checking that tells the truth about `.com.gh` (RDAP is useless for `.gh`; DNS over HTTPS decides), Ghanaian examples, Accra context, local pricing.
- **Mobile-first, intermittent-connection design** — runs outlive connections, lazy allowance renewal, low-data UI, rate limits keyed on workspace not address.
- **Community/institutional roots** — Accra Innovation Center, campus seats, sponsored access, education grants.
- **Honesty as brand** — "we cannot confirm .com.gh availability rather than guessing", no surprise costs, failed work refunds credits.

---

## Step 2 — Global research

### 2a. How frontier companies price AI

**ChatGPT / Claude (chat products):** flat subscription, **no per-message meter**. Usage is a soft rolling cap (e.g. Plus ~160 premium-model messages per 3 hours; Claude Pro/Pro Max use 5-hour/weekly rolling limits). Users are never asked to budget per message; heavy users just slow down or upgrade. API pricing is per token, but the consumer surface is "the plan buys a fair amount of normal use."
[Morph — ChatGPT vs Claude pricing](https://www.morphllm.com/chatgpt-vs-claude) · [CloudZero — Claude pricing](https://www.cloudzero.com/blog/claude-pricing/)

**Cursor (the most instructive analog):** subscription with **included usage + on-demand overage billed in arrears at actual token cost**. Two pools: their own models (large included pool) and third-party models (at the model's API price, min $20/mo included, overage at cost). **Premium models consume credits 5–10× faster than base models.** Pricing page now emphasizes token-based billing, not request counts.
[Cursor docs — Models & Pricing](https://cursor.com/docs/models-and-pricing) · [Vantage — Cursor pricing explained](https://www.vantage.sh/blog/cursor-pricing-explained) · [Morph — Cursor model pricing](https://www.morphllm.com/cursor-model-pricing)

**GitHub Copilot:** moved to usage-based billing where **premium requests are metered as a multiplier** of ordinary chat requests (community backlash is loud: credits burn too fast in agent/review modes). The backlash itself is the lesson — meters on the everyday surface read as stingy.
[GitHub discussion — Copilot usage-based billing](https://github.com/orgs/community/discussions/192948)

**Perplexity (the closest shape to AI360's "credits"):** **everyday Ask/search consumes no credits at all.** Credits exist only for Computer (multi-step agent work), priced by task complexity with published ranges (Light ~100–350 credits, up to Mega 2,400–9,800, where 100 credits = $1). Credit types are Bonus → Monthly → Purchased; monthly don't roll over, purchased survive a year. Failed tasks refund; finished-but-unwanted tasks don't. Auto-refill and spending caps exist so people are never surprise-charged.
[Perplexity help — How credits work](https://www.perplexity.ai/help-center/en/articles/13838041-how-credits-work-on-perplexity)

**Lovable / v0:** credits with consumption varying by task complexity, free daily capacity, shared workspace balance — the pattern AI360's PRICING_STRATEGY.md already cites. Reddit threads ("credit consumption is getting out of hand") show the failure mode of opaque per-task credit burn.
[Lovable pricing](https://lovable.dev/pricing) · [v0 pricing](https://api2.v0.dev/docs/pricing)

### 2b. OpenRouter-native products

**OpenRouter's own billing is the "charge by work done" reference:** $1 = 1 credit, deducted **per token** (prompt + completion + reasoning + per-request media), with provider prices passed through at no markup and a 5.5% fee only on credit purchase. Precision goes to fractions of a cent. This is exactly what AI360's `creditsForUsd` conversion is reaching for — the only thing stopping it is the integer ledger and the floors.
[OpenRouter FAQ](https://openrouter.ai/docs/faq) · [OpenRouter pricing](https://openrouter.ai/pricing) · [TrueFoundry — OpenRouter pricing](https://www.truefoundry.com/blog/openrouter-pricing)

**Products built on OpenRouter are overwhelmingly BYOK or pass-through** (LibreChat, Cherry Studio, Open WebUI, self-hosted aggregators) — the user pays OpenRouter's per-token price themselves and the app monetizes seats/features, not tokens. There is **no dominant consumer-grade managed chat product in a low-income market built on OpenRouter with a local-currency subscription** — which is exactly the gap AI360 occupies. The pattern to borrow is OpenRouter's per-token precision; the pattern to avoid is BYOK friction (a Ghanaian user will not buy OpenRouter credits with a card).
[LibreChat — OpenRouter](https://www.librechat.ai/docs/configuration/librechat_yaml/ai_endpoints/openrouter) · [Reddit — could OpenRouter let users pay inside third-party apps](https://www.reddit.com/r/openrouter/comments/1v1hx5u/could_openrouter_let_users_pay_for_ai_usage/)

### 2c. Letting the AI know the product

Frontier practice is layered:

- **ChatGPT/Claude/Gemini ship product knowledge in the system prompt** — they can describe their own features, limits and plans because the capability facts are in the model's instructions.
- **Support-bot pattern (Intercom Fin, Kapa, Zendesk):** RAG over the help-centre/docs knowledge base, retrieved per question before answering. Fin's engine also validates that an answer actually cites the knowledge base before sending it.
- **For a product like AI360 the cheap correct move is a curated, always-on fact sheet in the system prompt** (features, plans, prices, credits, languages, payment, what it cannot do) plus links to the canonical pages. At ~500 tokens the input cost is ~$0.0001 per message on luna — negligible. RAG over docs is a later stage, only when the fact sheet stops being enough.
[Intercom — Fin AI Engine](https://www.intercom.com/help/en/articles/9929230-the-fin-ai-engine) · [Kapa — build an agent that knows your product](https://www.kapa.ai/blog/how-to-build-an-ai-agent-that-actually-knows-your-product)

### 2d. The moat question (beyond MoMo)

Regional players' moats are **language, distribution, and local data**, not model quality:

- **Lelapa AI (South Africa)** — InkubaLM, a small language model for five African languages; explicitly positions linguistic inclusion as the barrier and the product.
- **Intron (Nigeria)** — Sahara voice AI now covers 57 languages including 23 African ones; "Africa's languages are becoming the next AI battleground."
- **Sarvam AI / Krutrim (India)** — same play: local languages + local context + local distribution against global assistants.
[Lelapa AI](https://lelapa.ai/) · [ITWeb — Africa's languages are the next AI battleground](https://itweb.africa/article/africas-languages-are-becoming-the-next-ai-battleground/KA3Ww7dzdaVqrydZ) · [Nature Middle East — Global South builds its own brainpower](https://www.natureasia.com/en/nmiddleeast/article/10.1038/nmiddleeast.2025.65)

The consistent pattern: **global labs own raw model capability; regional products win on language, payment rails, institutional trust, and community distribution.** Each is copyable alone; the combination plus speed is the defensible position.

---

## Step 3 — Adapt to AI360

### Verdict

**Stop metering the everyday surface; meter the compute.** Make plain chat on the fast model a fair-use allowance (rate-limited, soft-capped — no per-message credit burn), like Perplexity's free Ask, ChatGPT's rolling caps, and Cursor's included pool. Keep credits for the genuinely variable, expensive work — research with tools, premium models, agent runs, image, video — and charge those **by measured tokens × model multiplier**, which is what "based on the work done" actually means. Simultaneously give the model a compact, always-on **product knowledge block** so AI360 can answer about itself, and treat "the AI that knows Ghana and knows AI360" as the real moat, not MoMo.

**Why this fits us:** the measured-cost plumbing already exists end to end (per-request tokens + cost, measured settlement, ceilings that cap surprise). The blocker is a pricing policy (floor of 1 credit per message) plus an integer ledger — not new infrastructure. And the audience is the deciding factor: a Ghanaian user on metered mobile data will not read a credit meter per message; they will feel nickel-and-dimed at 120 messages/month and churn. Frontier products converged on this because per-message metering is bad product, not because they cannot measure.

### The numbers that force this

| Work | Measured landed cost | Credits today (floor → charge) | Fair charge |
| --- | --- | --- | --- |
| Short chat turn (luna) | ~GH₵0.01 ($0.0007) | 1 credit (25×) | ~0 (fair use) |
| Research with web tools | ~GH₵0.10 ($0.0063) | 2 credits (20×) | ~0.4 credit |
| Image | ~GH₵0.04 ($0.0026) | 3 credits (75×) | ~0.15 credit |
| 4s video | ~GH₵1.81 ($0.12) | 12 credits (6.6×) | ~7 credits |

Chat is 25× overpriced by measured cost; the floors are doing the pricing, not the measurement. 120 Everyday credits ≈ 120 short messages is a *perception* problem caused by a *policy* problem.

### Phased plan

**Phase 1 — Quick win, no schema change (days).**
1. **Chat stops drawing the meter.** In `openCreditGate`/`chatFeature`, treat plain chat (no live research, no attachment, fast model) as an unmetered surface: keep the reserve/settle cycle for the failure-refund promise but settle it at **0 credits** for measured cost under ~GH₵0.05 (i.e. `creditsForUsd` rounds to nearest, not up, and chat's floor drops from 1 to 0). Research, document, agent, image, video and **premium-model chat** (Claude Sonnet 5, Kimi K3 selected explicitly) keep metering.
2. **Add fair-use chat caps per workspace** (Explorer ~10 messages/day, Everyday ~60/day, Builder ~120/day, Team shared pool with per-member cap), reusing the existing `rateLimit` guardrail (`src/lib/guardrails.ts`) — same philosophy as the 2026-08-04 decision, keyed on workspace. Serve a friendly "slow down" message instead of a 402.
3. **Premium model multiplier** (Cursor/Copilot pattern): when the user selects a premium model explicitly, settle at measured cost × small multiplier (e.g. 2×) or a floor per model, so a Claude Sonnet 5 reply (~10× luna's price) is never charged the same 0 credits as an Auto reply. The model picker already exposes the choice; the ledger just needs the pricing to follow it.
4. **Publish the change** in the credit guide (`catalog.ts` CREDIT_GUIDE) and on the pricing page: "Everyday chat is included in your plan. Research, premium models, agent work and media use credits."

**Phase 2 — Rebalance heavy-feature pricing to measured cost (days–weeks).**
1. Lower floors where measurement is trustworthy: research floor 2→1, image floor 3→1, video floor 12→~7 and re-measure (`MEASURED_CLIP_USD` path already exists in `src/lib/media/video-catalogue.ts`). Keep ceilings — they are the "no surprise overage" promise and must stay.
2. Agent runs already settle measured cost; keep, and keep the plan-approval-costs-one-credit decision (a rejected plan should still not cost much).
3. Track the pilot metrics in PRICING_STRATEGY.md against the new structure: median/p90 cost per plan, chat-to-heavy usage ratio, contribution margin. The 25% target now has headroom because cheap chat no longer inflates "credit burn" — re-examine plan sizes (120 credits may comfortably become more heavy-work, or the price point can move).

**Phase 3 — Optional later: sub-credit precision (weeks, real migration).**
If pilot data says users want *per-message* precision rather than "chat is free," re-denominate credits internally (1 credit = 100 units, `numeric` ledger columns, display "X.XX credits") — the OpenRouter model of $1=1 credit with per-token deduction. Only worth it once Phase 1+2 data exists; it is a ledger migration (`lab_credit_accounts`, `lab_credit_ledger`, `lab_credit_reservations`) plus UI, and should not be done on speculation.

**Product self-knowledge (Phase 1 alongside pricing).**
1. Add `src/lib/product-knowledge.ts`: a compact, **public-facts-only** block built from `BRAND`, `BILLING_PLANS`, `FEATURE_WEIGHTS`/CREDIT_GUIDE, `LANGUAGES`, Studio pack list, payment method, and canonical URLs. ~400–600 tokens, always appended to the system prompt in the chat route (`src/app/api/chat/route.ts:171`) and the agent.
2. Rules for it: only what a customer can see on the public site (never `CREDIT_VALUE_GHS`, margins, or internal strategy); say what AI360 **cannot** do yet ("we do not yet offer X"); point people at `/pricing`, `/how-it-works`, `/what-you-can-make`, settings, and help; instruct the model to route billing/refund questions to the right place rather than inventing policies.
3. Add a small test (`tests/product-knowledge.test.ts`) that the block compiles from live catalog data and stays under a token budget, and that internal constants are not referenced by it.
4. Later (only if questions outgrow the fact sheet): RAG over the public pages/help docs in Supabase with pgvector, retrieved only when the intent router detects a product question.

### Moat — the honest read

MoMo is **distribution, not a moat** — any Ghanaian startup can add ExpressPay. The defensible position is the combination, compounding over time:

1. **Language**: first-class Twi/Gã/Eʋegbe/Pidgin with *verified* quality (the native-speaker review from DECISIONS.md is the missing gate — finish it; it is the difference between a feature and a moat).
2. **Local knowledge**: .com.gh truthfulness, Ghanaian business/education/legal context, Accra prices and institutions — the model should be steered to local facts by default, not as an afterthought.
3. **Product self-knowledge + community**: the AI that can answer for AI360 (plans, credits, features, how-to) and is grounded in the Accra Innovation Center community — this is what makes the product feel *owned* rather than rented. Community content (community-built packs, shared templates, campus cohorts) is a data flywheel global assistants cannot replicate.
4. **Trust + honesty**: no surprise costs, failed work refunds, truthful domain checks, real Accra origin. In a market where users have been burned by opaque international subscriptions, this compounds into word-of-mouth.
5. **Speed on the window**: global labs are localizing (Gemini in Swahili, etc.). The moat is being early and embedded in Ghanaian institutions, not just having the LLM wrapper.

### What to leave alone

- **The reserve/settle/ceiling structure.** It is correct and already "charge by work done": failure refunds, ceilings cap surprise, reservations survive mobile drops. Only the floors and the chat policy change.
- **The honest refund/ceiling promises on the pricing page** — they are a trust asset.
- **Whole-credit UX for heavy features** — people buy "12–20 credits for a video" fine; they just shouldn't have to budget for "1 credit per question."
- **ExpressPay, the allowance/expiry rules, top-up pricing rule** (top-ups must never undercut a subscription).
- **The 25% AI-cost target as a planning discipline** — keep measuring against it; just let the new structure change what the number looks like.

---

## Open questions for the team

1. Is "chat is included, heavy work is metered" the right public story, or does the team want per-message precision (Phase 3) from the start?
2. What is the right fair-use chat cap per plan — the numbers above are starting points, not decisions.
3. Native-speaker review of the Ghanaian-language output: who, and when?
4. Do premium-model selections need to cost more than Auto? (Recommendation: yes, multiplier pattern.)
