# AI360 pricing strategy

Last reviewed: 2026-08-04

This is the internal commercial rationale behind the public pricing page. The
public page should stay clear and customer-centred; provider costs, margins and
payment architecture belong here.

## Decision

Keep the four-tier pilot catalog while measuring real usage:

| Plan | Monthly price | Included credits | Primary job |
| --- | ---: | ---: | --- |
| Explorer | GH₵0 | 5 | Experience one useful outcome without a card |
| Everyday | GH₵125 | 120 | Weekly learning, writing, research and career work |
| Builder | GH₵300 | 400 | Recurring agent, campaign and creative production |
| Team | GH₵900 | 1,400 | Five-person shared work with controls and reporting |

These prices are a pilot hypothesis, not a permanent promise. Do not change the
catalog from competitor screenshots or intuition alone. Reprice after at least
four weeks of observed activation, cost, retention and willingness-to-pay data.

## Why this model can work

### Global pattern

- AI creation products increasingly combine a free entry point, subscription
  capacity and metered credits. [Lovable](https://lovable.dev/pricing) varies
  credit use by task complexity, gives free daily capacity and lets workspaces
  share a balance. [v0](https://api2.v0.dev/docs/pricing) combines free monthly
  credits with paid individual and team plans.
- Credits translate variable model, search and media costs into one unit people
  can understand. They also avoid the false promise of unlimited expensive
  generation.
- A shared Team pool follows the global workspace pattern while per-member caps
  prevent one person from consuming an organization's allowance.
- OpenRouter exposes model-level prices and routing information, so AI360 can
  route simple work to efficient models and reserve premium models for tasks
  where quality justifies the cost. OpenRouter currently applies a platform fee
  to pay-as-you-go usage, which must be included in landed cost.
  [OpenRouter pricing](https://openrouter.ai/pricing) and
  [model pricing fields](https://openrouter.ai/docs/guides/overview/models).

### Ghana and African pattern

- Sub-Saharan Africa passed 1.1 billion registered mobile-money accounts in
  2024, and West Africa held the largest regional share. This makes a
  Mobile Money-first checkout a distribution decision, not a decorative payment
  logo. [GSMA regional report](https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-for-development/gsma_resources/the-sotir-2025-global-deep-dive-and-regional-cuts/).
- Ghana's interoperable payment infrastructure helped digital financial
  inclusion approach 70%, with roughly six in ten adults owning a digital
  wallet. Card support still matters for international users, organizations and
  customers who prefer bank-linked payment.
  [World Bank Ghana case study](https://fastpayments.worldbank.org/sites/default/files/2025-07/FPS_Governance%20Note_Final.pdf).
- Mojo Payments is a Ghana-licensed Enhanced Payment Service Provider. Its
  public product material advertises one-time and recurring collections,
  verification, web checkout and direct debit for mobile wallets and bank
  accounts. That fits AI360's intended local payment edge.
  [MojoPay company information](https://mojo-pay.com/about-us),
  [collections](https://mojo-pay.com/services/collections) and
  [direct debit](https://mojo-pay.com/services/direct-debit).
- GH₵125 deliberately sits below typical global AI-builder subscriptions while
  remaining high enough to fund support and real work. It will not be affordable
  to every learner. Sponsored Campus seats, institutional bundles and controlled
  education grants should serve price-sensitive groups without making the whole
  commercial model loss-making.

## Why each pricing mechanism exists

| Mechanism | Why | Guardrail |
| --- | --- | --- |
| Five free monthly credits | Removes payment friction and proves value | Reset monthly; no rollover or expensive video on the free grant |
| Subscription allowance | Predictable revenue and predictable customer capacity | No silent individual overage |
| One-time top-ups | Supports irregular Ghanaian cash flow and project bursts | Paid credits expire only after a clearly published period |
| Annual discount | Improves cash flow and retention | Show the full annual charge, not only its monthly equivalent |
| Team pool | Fits schools, NGOs, programmes and businesses | Per-member caps, roles and auditable use |
| Sponsored seats | Extends access to learners and communities | A named sponsor funds a bounded allowance |

## Unit economics gate

Every provider request must record input tokens, output tokens, search/tool
charges, media units, provider fee, latency and final cost. For each plan:

`contribution margin = collected revenue - payment fees - AI cost - storage/CDN cost - variable support/refunds`

Initial release guardrails:

- Target AI and tool cost at or below 25% of collected subscription revenue.
- Target total variable cost at or below 35% of collected revenue.
- Keep a foreign-exchange and provider-price buffer of at least 10% inside the
  credit conversion model.
- Reserve estimated credits before image, video or long agent work; settle the
  measured amount and release unused credits afterward.
- Pause an expensive task before the estimate exceeds the user's balance.
- Recalculate credit weights whenever a provider changes price by 10% or more.

The public credit value is intentionally not a fixed token exchange rate. One
credit represents bounded useful work; internal cost weights may change while
the user sees the estimate before execution.

### The internal credit price

Implemented in `src/lib/billing/credits.ts`. Everyday sets the reference point:
GH₵125 × 25% = GH₵31.25 of model budget over 120 credits, so **one credit may
represent GH₵0.26 of landed cost**. Landed cost is the provider charge plus the
OpenRouter platform fee, converted at the working rate, plus a 10% foreign
exchange buffer. At the current default rate, one US dollar of provider spend
lands at roughly GH₵15.

Operational values are environment variables, so a rate move is a configuration
change rather than a deploy: `AI360_USD_TO_GHS` and `AI360_PROVIDER_FEE_RATE`.
Confirm both against payment-provider settlement and an OpenRouter invoice
before launch.

### Known breaches in the pilot catalog

Measured at full utilisation of the included allowance:

| Plan | Cost at full use | Share of revenue | Within 25% target |
| --- | ---: | ---: | --- |
| Explorer | GH₵1.30 | acquisition cost | n/a |
| Everyday | GH₵31.20 | 25.0% | yes |
| Builder | GH₵104.00 | 34.7% | **no** |
| Team | GH₵364.00 | 40.4% | **no** |

Builder and Team are still profitable in absolute terms, and low utilisation may
well keep them comfortable in practice. But both sit outside the guardrail this
document sets, so the position must be a deliberate choice: either accept a
higher cost ratio on the upper plans and say so here, or reduce the allowance to
320 and 865 credits respectively. A test pins the current expectation, so an
allowance cannot drift across the line unnoticed.

Free credits are not free to AI360. Every Explorer account carries GH₵1.30 of
monthly cost, so a thousand dormant free accounts is GH₵1,300 a month. Expire
unused free credits monthly, as published, and reclaim inactive grants.

### Media pricing must be verified before launch

Twenty credits buys about **$0.34** of provider spend for a four-second video.
The video quote endpoint already fetches the real per-second price from the
provider, so one call settles whether that clip sells above or below cost. If it
lands above $0.34, either raise the video weight or shorten the default clip.
Do this before the pricing page goes live with the published range.

## Cost and latency routing

1. Classify the task by complexity, modality, context size and quality risk.
2. Route everyday chat to a fast, efficient model with streaming enabled.
3. Use premium reasoning only for complex planning, verification or sensitive
   high-value work.
4. Cache reusable system context and retrieved sources where provider and
   privacy rules allow it.
5. Cap output tokens and tool calls by task type.
6. Fall back by capability, price, latency and current provider health.
7. Log actual cost rather than assuming the quoted estimate was consumed.

## MojoPay activation checklist

The public website confirms MojoPay's broad fit, but the merchant contract and
API documentation must decide the implementation. Before enabling checkout:

- Confirm sandbox and production base URLs and credentials.
- Confirm supported Mobile Money networks and local/international card rails.
- Obtain exact transaction, refund, chargeback and settlement fees.
- Confirm whether recurring Mobile Money is direct debit or a fresh customer
  approval each month.
- Verify webhook signature, retry and event-ordering behaviour.
- Verify status lookup, provider-reference uniqueness and idempotency support.
- Test success, delayed success, abandonment, duplicate events, reversal,
  refund and chargeback.
- Grant credits only after a verified server event or verified status lookup.
- Keep the payment adapter provider-neutral so a fallback PSP does not require
  rewriting plans, subscriptions or the credit ledger.

## Pilot measurement plan

| Metric | Decision it informs | First signal |
| --- | --- | --- |
| Visitor to free activation | Is the offer understandable? | Completes one useful task |
| Free to paid conversion | Is five credits enough to prove value? | Plan purchase within 30 days |
| Paid credit utilization | Are allowances credible? | Median and p90 by plan |
| Contribution margin | Are prices sustainable? | Cohort revenue minus measured variable cost |
| Renewal and failed renewal | Does the payment cadence fit? | Monthly cohort by payment rail |
| Top-up rate | Are plans too small or appropriately flexible? | Top-ups per active subscriber |
| Outcome completion | Are credits buying value, not activity? | Finished and exported deliverable |
| Sponsored-seat use | Does access funding create real outcomes? | Active sponsored learners and completion |

Run price and packaging experiments on new cohorts only. Never silently reduce
an existing subscriber's paid allowance.
