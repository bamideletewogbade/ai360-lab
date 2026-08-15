# AI360 — Pricing by Work Done, Product Intelligence & Competitive Moat

**Management report · 15 August 2026**
**Prepared by:** AI360 product & engineering (Accra Innovation Center)
**Audience:** AI360 leadership / management
**Status:** Direction decided; Phase 1 implemented in code, pending verification and deploy

---

## 1. Executive summary

After AI360's first real paid transaction (the Everyday plan — 120 credits for GH₵125,
paid by Mobile Money), three strategic questions came up:

1. **Pricing feels impractical.** Every message costs exactly 1 credit regardless of the
   work done. How do we charge based on the actual work, not a static credit value stuck
   to a task type?
2. **The AI doesn't know AI360.** How do we let the assistant answer accurately about our
   own product — features, plans, prices, payment?
3. **What is our moat?** Beyond letting Ghanaians pay easily with MoMo, what makes us
   defensible?

**What we found and decided:**

1. **Every message was costing 1 credit because of a pricing floor, not the work.** A
   typical chat turn costs AI360 about GH₵0.01 (~$0.0007) — one credit is worth GH₵0.26,
   so the minimum charge of 1 credit was ~25× the measured cost of a short message. The
   measurement plumbing (real token counts and cost per request) already existed; the
   floor was doing the pricing. **Frontier companies converged on the opposite shape:
   they do not meter everyday chat at all.** Perplexity charges zero credits for everyday
   search and meters only its multi-step agent; ChatGPT/Claude use flat subscriptions with
   soft caps; Cursor bills actual tokens with "premium models cost 5–10× more" multipliers.
   **Decision:** everyday chat is now included with a plan (bounded by fair-use daily
   caps), while live research, attached files, premium models, agent workflows, images and
   video stay metered by measured cost — with premium models charged at a multiplier. This
   is implemented in code (Phase 1) and pending verification.

2. **The AI can now answer for AI360.** We added a compact, always-on "product facts"
   block to the assistant's instructions: what AI360 can do, all four plans with prices,
   credits policy, MoMo/card payment, the languages it supports, and its honest limits —
   with a rule never to invent policies. Public facts only; nothing internal. A later
   phase adds retrieval over our help pages for deeper questions.

3. **MoMo is distribution, not a moat — anyone can add ExpressPay.** The defensible
   position is the combination: first-class Ghanaian languages, local knowledge and
   truthfulness, a community flywheel, institutional trust, and speed. Regional AI players
   (Lelapa AI, Intron, Sarvam, Krutrim) are staking their whole business on exactly this
   pattern: global labs own model capability; regional products win on language, payment
   rails and community.

**Bottom line:** the change makes the product *feel* more generous (chat is included, not
nickel-and-dimed) while keeping the economics safe — the money is made and spent on the
work that genuinely costs money, and every heavy task still shows its price before it
runs.

---

## 2. Context: where AI360 is today

- **In production** at ai360.africa. The first real paid checkout (ExpressPay Mobile
  Money) completed in August 2026; payment verification, credit granting and the
  confirmation redirect are proven end to end.
- **Plans:** Explorer (free, 5 credits/month), Everyday (GH₵125, 120 credits), Builder
  (GH₵350, 400 credits), Team (GH₵1,200, 1,400 credits for five people). All monthly
  during the pilot; no automatic renewal; annual purchasing intentionally deferred.
- **Product surface:** everyday chat; research with live web search and cited sources;
  file/PDF review; multi-step research agents; Studio packs (brand & launch, marketing,
  ads, name & domain, pitch, content calendar); image generation; short promo video with a
  quote before generation; voice input; document export. Replies available in English,
  Twi, Gã, Eʋegbe and Ghanaian Pidgin.
- **Design constraints that shape every decision:** users are mostly on mobile, often on
  intermittent, slow or metered connections; guest-first (people can try before signing
  in); no surprise costs is a brand promise; billing must never fail open.

---

## 3. Question 1 — Pricing based on the work done

### 3.1 How pricing worked before this change

AI360 sells **credits**, which is the right unit for the audience (people think in
"credits I bought", not tokens). Internally:

- **One credit = GH₵0.26 of landed AI cost** (derived from Everyday: GH₵125 revenue ×
  25% AI-cost target ÷ 120 credits). Landed cost = provider charge + OpenRouter platform
  fee + foreign-exchange buffer. One credit ≈ **$0.017 of provider spend**.
- **Static weights per kind of work:** chat 1 credit, research 2–4, agent 3–8, image 3–6,
  video 12–20.
- **Measured settlement already existed:** every request records its real token usage and
  real cost, and the engine settles against measured cost — but never below the feature's
  **floor** and never above the amount reserved up front.

### 3.2 The problem, in numbers

A typical chat turn on our fast model (`GPT-5.6 Luna`) costs ~**GH₵0.01 landed** (~$0.0007).
Converting that to credits: `GH₵0.01 ÷ GH₵0.26 = 0.04 credits`, rounded **up** to the
1-credit floor. Result: **every message cost exactly 1 credit regardless of what was
done** — a 3-sentence answer and a 2-page research summary both "cost 1 credit".

| Work | Measured landed cost | Charged before | Over-charge | Fair charge |
| --- | --- | --- | --- | --- |
| Short chat turn (fast model) | ~GH₵0.01 ($0.0007) | 1 credit | ~25× | Included with plan |
| Research with web tools | ~GH₵0.10 ($0.0063) | 2 credits | ~20× | ~0.4 credit (metered) |
| Image | ~GH₵0.04 ($0.0026) | 3 credits | ~75× | ~0.15 credit (metered) |
| 4-second video | ~GH₵1.81 ($0.12) | 12 credits | ~7× | ~7 credits (metered, quoted first) |

The human consequence: **120 Everyday credits read as "only ~120 short messages"**, which
feels stingy for an everyday assistant and made the credit meter a nagging presence on
the most common surface. The infrastructure was already charging by work done; the
**floor was overriding the measurement**.

### 3.3 What frontier companies do (research)

The pattern across the industry is consistent, and it is *not* "per-message metering":

- **Perplexity** — everyday Ask/search consumes **zero credits**. Credits exist only for
  Computer (its multi-step agent), priced by task complexity with published ranges
  (100 credits = $1; light tasks ~100–350, mega projects ~2,400–9,800). Monthly credits
  don't roll over; purchased credits survive; failed tasks refund; auto-refill and
  spending caps prevent surprise charges.
- **ChatGPT / Claude** — flat subscription ($20/$100/$200) with **soft rolling usage
  caps** for premium models (e.g. ~160 premium messages per 3 hours on Plus). Users are
  never asked to budget per message; heavy users simply slow down or upgrade.
- **Cursor** — subscription with included usage plus **on-demand overage billed at actual
  token cost**; **premium models consume credits 5–10× faster** than base models. Billing
  moved from "requests" to tokens.
- **GitHub Copilot** — moved to usage-based billing where premium requests are metered as
  a multiplier of ordinary chat. The loud community backlash ("credits burn too fast")
  is itself the lesson: meters on the everyday surface read as stingy.
- **Lovable / v0** — credit systems where consumption varies by task complexity, with
  free daily capacity and shared workspace balances.
- **OpenRouter (our provider)** — the reference for "charge by work done": $1 = 1 credit,
  deducted **per token** to fractions of a cent, no markup on inference (5.5% fee only on
  credit purchase). Notably, most products built on OpenRouter are "bring your own key"
  pass-through tools; **there is no dominant managed consumer product in a low-income
  market built on OpenRouter with local-currency subscription billing — that gap is
  AI360's position.**

**The synthesis:** frontier products do not meter the cheap everyday surface; they meter
the compute-heavy work, and they use model multipliers so an expensive model is never the
same price as a cheap one. "Charge based on the work done" means tokens × model price —
and short chats on a fast model are so cheap they should not be metered at all.

### 3.4 The decision (implemented — Phase 1)

1. **Everyday chat is included with a plan.** Plain chat on the fast model (AI-Auto /
   GPT) no longer draws from the credit meter. Cost is bounded by **fair-use daily caps
   per plan** (Explorer 10, Everyday 60, Builder 120, Team 150 messages/day; anonymous
   guests 10/day) enforced by the existing rate limiter, with a friendly "resets at
   midnight" message instead of a credit denial.
2. **Premium models are metered with a multiplier.** Deliberately selecting Claude Sonnet 5
   or Kimi K3 settles at **measured cost × 2** (Cursor/Copilot pattern), with a floor of
   1, reserve of 4 and hard ceiling of 8 credits so there is never a surprise charge.
   The ledger still records the *real* measured cost for reconciliation.
3. **Heavy work keeps metering by measured cost:** live research (2–4 credits), files
   (2–4), agent execution (3–8), image (3–6), video (12–20, quoted before it runs). These
   floors are deliberately unchanged in Phase 1.
4. **Agent plan approval is now free** (it is one small chat turn; rejecting a plan
   should cost nothing). Execution remains metered.

### 3.5 Economics impact

- **Chat becomes a rounding error in cost, and it stays bounded.** Worst realistic chat
  use on the fast model is well under 1% of Everyday's revenue; the fair-use caps
  guarantee the worst case even with maximum context.
- **Credits now mean what they say.** A credit is a unit of *heavy work* (research,
  premium models, agents, media), not a tax on every message. The 25% AI-cost target on
  Everyday is no longer consumed by cheap chat, giving headroom on the heavy features
  that actually matter to power users.
- **The "no surprise overage" promise is intact** — reservations, ceilings and
  failure-refunds are unchanged; only the everyday surface stopped being metered.

### 3.6 Implementation status

- **Done in code:** credit engine changes, unmetered chat path, premium-model metering,
  fair-use caps, rate-limit messaging, credit guide and pricing-page copy.
- **Pending:** running the full test suite (`npm test`, lint, typecheck) on a machine
  with the toolchain, deploying, and a live browser check of the chat flow (no credit
  burn on everyday chat; credits used on premium/research/media).
- **Phase 2 (next):** rebalance the heavy-feature floors (research, image, video) to
  measured cost; decide whether Gemini 3.6 Flash joins the premium set; start tracking
  the new metrics (see §7).
- **Phase 3 (only if pilot data asks for it):** finer per-message precision (fractional
  credits) — a ledger migration, deferred until we know users want it.

---

## 4. Question 2 — Letting the AI know about AI360

### 4.1 The gap

Our assistant's base instructions said it is "AI360, built by the Accra Innovation
Center" — and nothing else about the product. Asked "what can you do?", "how much is
Builder?" or "do you accept Mobile Money?", it had to guess. That is a trust failure on
the most natural question a new user asks.

### 4.2 The frontier pattern

- **ChatGPT / Claude / Gemini** ship knowledge of their own features, limits and plans in
  the system instructions.
- **Support-bot products (Intercom Fin, Kapa, Zendesk)** retrieve answers from the
  company's own help documentation (RAG) before responding.

### 4.3 The solution (implemented)

A compact, **always-on "product facts" block** compiled from our live catalog — features,
all four plans with prices, credits policy, MoMo/card payment, the supported languages,
Studio packs, and **honest limits** (voice input is English-only today; `.gh` domain
availability can only be reported as "taken or unknown"; no annual plans yet). It is
appended to every chat and agent answer's instructions.

**Guardrails that make it safe:**
- **Public facts only.** Nothing internal (credit values, margins, exchange rates,
  provider strategy) ever reaches the model. A test guards against leaks.
- **No invented policies.** The model is told to state what the block says and, beyond
  that, to say the team will confirm — never to invent refund, renewal or limit rules.
- **Negligible cost.** At ~1,000 characters the input cost is ~$0.0001 per message.

### 4.4 Next step

If product questions outgrow the fact sheet, add **retrieval over our public pages/help
content** (Supabase + pgvector), triggered only when the question is about the product.

---

## 5. Question 3 — What is our moat?

### 5.1 The honest answer

**MoMo is distribution, not a moat.** Any Ghanaian startup can add ExpressPay tomorrow.
What is defensible is the *combination*, compounding over time:

1. **First-class Ghanaian languages.** Twi, Gã, Eʋegbe and Ghanaian Pidgin as real
   settings with verified behaviour — this is what a general assistant will not do for
   Ghana. **Blocking item:** the native-speaker review of output quality that is still
   open (see §9) — it is the difference between a feature and a moat.
2. **Local knowledge and truthfulness.** We tell the truth about `.com.gh` (can only be
   "taken or unknown" — RDAP is useless for `.gh`), use Ghanaian business/education
   context by default, and refuse to guess. In a market burned by opaque international
   subscriptions, honesty compounds into word of mouth.
3. **Community flywheel.** The Accra Innovation Center community, campus seats, sponsored
   access, community-built packs and shared templates. This is a **data flywheel global
   assistants cannot replicate** — and it is what "the AI that knows AI360" connects to
   (the product-knowledge work in §4 is the first rung).
4. **Trust and safety as brand.** No surprise costs, failed work refunds, quotes before
   expensive generation, real Accra origin.
5. **Speed on the window.** Global labs are localizing (Gemini in Swahili, etc.). The
   moat is being early and embedded in Ghanaian institutions, not just having the LLM
   wrapper.

### 5.2 What regional research says

- **Lelapa AI (South Africa)** — InkubaLM, a small language model for five African
  languages; positions linguistic inclusion as the barrier and the product.
- **Intron (Nigeria)** — Sahara voice AI covers 57 languages including 23 African ones;
  "Africa's languages are becoming the next AI battleground."
- **Sarvam AI / Krutrim (India)** — the same play: local languages + local context +
  local distribution against global assistants.

The consistent pattern: **global labs own raw model capability; regional products win on
language, payment rails, institutional trust and community distribution.** Each is
copyable alone; the combination plus speed is the defensible position.

### 5.3 What to do next

- Finish the native-speaker language review (gate for the language moat).
- Build the community layer: shared templates/packs, campus cohorts, sponsored seats.
- Keep measuring usage data on Ghanaian needs → feed it back into local packs and
  templates (the flywheel).

---

## 6. Roadmap

| Phase | What | Status |
| --- | --- | --- |
| **1 — Chat included, heavy work metered** | Unmetered everyday chat + fair-use caps; premium-model multiplier; free plan approval; product-knowledge block; copy/guide updates | **Implemented in code; pending verification + deploy** |
| **2 — Rebalance heavy features to measured cost** | Lower research/image/video floors where measurement is trustworthy; keep ceilings; decide Gemini premium status; start new metrics | Not started |
| **3 — Sub-credit precision (optional)** | Fractional credits if pilot data demands per-message precision | Deferred, only with data |
| **Language review** | Native-speaker evaluation of Twi/Gã/Eʋegbe/Pidgin output | Open (blocking for moat claim) |
| **Community layer** | Shared templates/packs, campus cohorts, sponsored seats | Not started |

---

## 7. Metrics & measurement (the pilot scorecard)

| Metric | What it decides | First signal |
| --- | --- | --- |
| Median/p90 chat messages per plan per day | Are the fair-use caps (10/60/120/150) right? | Cap-hit rate and slow-down messages |
| Premium-model adoption | Is the ×2 multiplier right? Is Gemini a premium model? | Claude/Kimi share of chat |
| Credit burn by feature | Do credits now represent heavy work? | Share of burn: research/agent/media vs old chat |
| Contribution margin by plan | Are prices sustainable? | Cohort revenue − measured variable cost |
| Free → paid conversion | Does "chat included" convert better? | Plan purchase within 30 days |
| Product-question answers | Does the AI answer about AI360 correctly? | Support load + spot checks |
| Renewal and failed renewal | Does the monthly cadence fit Ghanaian cash flow? | Monthly cohort by payment rail |

---

## 8. Risks and open questions

1. **Fair-use caps** (10/60/120/150 per day) are starting points, not decisions — they
   will be tuned against the first two weeks of observed use.
2. **Gemini 3.6 Flash** currently stays included (it is the default vision model); if
   live data shows abusive volume, it joins the premium set.
3. **Native-speaker language review** is still outstanding — before we publicly claim the
   language moat, real Ghanaians must judge the output.
4. **Chat abuse** is bounded by caps and rate limits, but an adversarial user with maximum
   context could still spend meaningfully on the included surface; we monitor
   `success_degraded` and cost outliers.
5. **Verification pending:** the code changes must pass `npm test`, lint, typecheck, and
   a live browser check before deploy (this environment could not run the toolchain).

---

## 9. Sources

**Frontier pricing**
- [Perplexity help — How credits work](https://www.perplexity.ai/help-center/en/articles/13838041-how-credits-work-on-perplexity) (Ask is free; Computer is metered by complexity; 100 credits = $1)
- [Morph — ChatGPT vs Claude pricing](https://www.morphllm.com/chatgpt-vs-claude) (flat subscriptions, soft rolling caps)
- [Cursor docs — Models & Pricing](https://cursor.com/docs/models-and-pricing) (token billing, included pools, model prices)
- [Vantage — Cursor pricing explained](https://www.vantage.sh/blog/cursor-pricing-explained) · [Morph — Cursor model pricing](https://www.morphllm.com/cursor-model-pricing) (premium models 5–10×)
- [GitHub — Copilot usage-based billing discussion](https://github.com/orgs/community/discussions/192948) (premium-request multipliers and backlash)
- [Lovable pricing](https://lovable.dev/pricing) · [v0 pricing](https://api2.v0.dev/docs/pricing)

**OpenRouter**
- [OpenRouter FAQ](https://openrouter.ai/docs/faq) · [OpenRouter pricing](https://openrouter.ai/pricing) ($1 = 1 credit, per-token, 5.5% purchase fee, no inference markup)
- [LibreChat + OpenRouter](https://www.librechat.ai/docs/configuration/librechat_yaml/ai_endpoints/openrouter) (BYOK/pass-through pattern)
- [TrueFoundry — OpenRouter pricing](https://www.truefoundry.com/blog/openrouter-pricing)

**Product self-knowledge**
- [Intercom — Fin AI Engine](https://www.intercom.com/help/en/articles/9929230-the-fin-ai-engine) (RAG over help docs)
- [Kapa — build an AI agent that knows your product](https://www.kapa.ai/blog/how-to-build-an-ai-agent-that-actually-knows-your-product)

**Moat / regional AI**
- [Lelapa AI](https://lelapa.ai/) (InkubaLM — African-language SLM)
- [ITWeb — Africa's languages are the next AI battleground](https://itweb.africa/article/africas-languages-are-becoming-the-next-ai-battleground/KA3Ww7dzdaVqrydZ) (Intron Sahara, 57 languages)
- [Nature Middle East — the Global South builds its own brainpower](https://www.natureasia.com/en/nmiddleeast/article/10.1038/nmiddleeast.2025.65)

**Internal references**
- `PRICING_STRATEGY.md` (unit economics, 25% cost target, pilot catalog)
- `DECISIONS.md` (2026-08-15 decision: everyday chat included; earlier ExpressPay, language and quality decisions)
- `docs/FRONTIER_ADAPT_PRICING_SELF_KNOWLEDGE_MOAT_2026-08-15.md` (technical assessment with file-level detail)
