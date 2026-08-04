/**
 * The credit engine.
 *
 * One credit represents a bounded amount of useful work, not a fixed token
 * exchange rate. Customers see credits; this module is the only place that
 * knows what a credit costs AI 360 to honour.
 *
 * The conversion is derived from the guardrail in PRICING_STRATEGY.md: AI and
 * tool cost should stay at or below 25% of collected subscription revenue. The
 * Everyday plan sets the reference point.
 *
 *   GH₵125 revenue × 25% = GH₵31.25 of model budget
 *   GH₵31.25 ÷ 120 included credits = GH₵0.2604 of landed cost per credit
 *
 * Landed cost means the provider's own charge plus the OpenRouter platform fee,
 * converted at the working exchange rate, plus a foreign-exchange buffer.
 */

export const CREDIT_ENGINE_VERSION = 'pilot-2026-08-v1'

/** Share of collected revenue that may be spent on AI and tool cost. */
export const AI_COST_TARGET_RATIO = 0.25

/** Landed cost one credit is allowed to represent, in Ghana cedis. */
export const CREDIT_VALUE_GHS = 0.26

/**
 * Working exchange rate. This is an operational value, not a market feed.
 * Confirm it against the settlement rate the payment provider actually gives
 * before launch and whenever it moves by 10% or more.
 */
export const DEFAULT_USD_TO_GHS = 13

/** OpenRouter's platform fee on pay-as-you-go usage. Confirm against invoices. */
export const DEFAULT_PROVIDER_FEE_RATE = 0.055

/** Protects the credit price from exchange-rate movement between repricings. */
export const FX_BUFFER_RATE = 0.1

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function usdToGhs() {
  return envNumber('AI360_USD_TO_GHS', DEFAULT_USD_TO_GHS)
}

export function providerFeeRate() {
  const value = Number(process.env.AI360_PROVIDER_FEE_RATE)
  return Number.isFinite(value) && value >= 0 && value < 1 ? value : DEFAULT_PROVIDER_FEE_RATE
}

/**
 * What a provider charge of `usd` actually costs AI 360 once the platform fee,
 * the exchange rate and the foreign-exchange buffer are applied.
 */
export function landedCostGhs(usd: number) {
  if (!Number.isFinite(usd) || usd <= 0) return 0
  return usd * (1 + providerFeeRate()) * usdToGhs() * (1 + FX_BUFFER_RATE)
}

/** Credits that a provider charge of `usd` consumes. Always rounds up. */
export function creditsForUsd(usd: number) {
  const cost = landedCostGhs(usd)
  return cost <= 0 ? 0 : Math.ceil(cost / CREDIT_VALUE_GHS)
}

/** The reverse view, used to sanity-check published guidance against cost. */
export function usdBudgetForCredits(credits: number) {
  if (!Number.isFinite(credits) || credits <= 0) return 0
  return (credits * CREDIT_VALUE_GHS) / ((1 + providerFeeRate()) * usdToGhs() * (1 + FX_BUFFER_RATE))
}

/**
 * The period an allowance belongs to, as `YYYY-MM`.
 *
 * Deliberately UTC. Ghana keeps UTC year round, so this is both simple and
 * correct for the pilot, and it stays stable if the team ever operates from
 * another timezone.
 */
export function currentBillingPeriod(now: Date = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export type CreditFeature =
  | 'chat'
  | 'chat.research'
  | 'chat.document'
  | 'agent'
  | 'image'
  | 'video'
  | 'voice'
  | 'export'

/**
 * What each feature reserves before work starts and what it may charge.
 *
 * `floor` is the minimum charge once work has produced something, so cheap
 * requests still cover their overhead. `reserve` is held up front. `ceiling`
 * is the most a single task may ever charge, which is what makes the "no
 * surprise overage" promise on the pricing page enforceable.
 */
export const FEATURE_WEIGHTS: Record<CreditFeature, { floor: number; reserve: number; ceiling: number }> = {
  chat: { floor: 1, reserve: 1, ceiling: 2 },
  'chat.research': { floor: 2, reserve: 2, ceiling: 4 },
  'chat.document': { floor: 2, reserve: 2, ceiling: 4 },
  agent: { floor: 3, reserve: 5, ceiling: 8 },
  image: { floor: 3, reserve: 4, ceiling: 6 },
  video: { floor: 12, reserve: 16, ceiling: 20 },
  voice: { floor: 1, reserve: 1, ceiling: 2 },
  export: { floor: 0, reserve: 0, ceiling: 0 },
}

export function isCreditFeature(value: unknown): value is CreditFeature {
  return typeof value === 'string' && value in FEATURE_WEIGHTS
}

/**
 * Chat is charged by what the request actually asks for, so a plain question
 * stays at one credit and a research or document request does not.
 */
export function chatFeature(options: { liveResearch?: boolean; hasAttachment?: boolean }): CreditFeature {
  if (options.liveResearch) return 'chat.research'
  if (options.hasAttachment) return 'chat.document'
  return 'chat'
}

export type CreditEstimate = {
  feature: CreditFeature
  reserve: number
  ceiling: number
  quotedUsd: number | null
}

/**
 * Credits to hold before work begins.
 *
 * When the provider gives a real price up front, as the video quote endpoint
 * does, that price decides the reservation and the published range only sets
 * the floor. Otherwise the published reservation applies.
 */
export function estimateCredits(feature: CreditFeature, options: { quotedUsd?: number } = {}): CreditEstimate {
  const weight = FEATURE_WEIGHTS[feature]
  const quoted = Number.isFinite(options.quotedUsd) && (options.quotedUsd as number) > 0
    ? (options.quotedUsd as number)
    : null
  const fromQuote = quoted === null ? 0 : creditsForUsd(quoted)
  const reserve = Math.max(weight.reserve, fromQuote)
  return {
    feature,
    reserve,
    ceiling: Math.max(weight.ceiling, reserve),
    quotedUsd: quoted,
  }
}

export type CreditSettlement = {
  feature: CreditFeature
  charged: number
  released: number
  measuredUsd: number | null
  cappedByCeiling: boolean
}

/**
 * Convert a finished task into a charge.
 *
 * Failed work charges nothing and releases the whole reservation, which is what
 * the pricing page promises. Successful work charges measured cost, never below
 * the feature floor and never above the reservation, so a task cannot cost more
 * than the amount the person already saw.
 */
export function settleCredits(input: {
  estimate: CreditEstimate
  measuredUsd?: number | null
  outcome: 'success' | 'failure'
}): CreditSettlement {
  const { estimate } = input
  if (input.outcome === 'failure') {
    return {
      feature: estimate.feature,
      charged: 0,
      released: estimate.reserve,
      measuredUsd: null,
      cappedByCeiling: false,
    }
  }

  const weight = FEATURE_WEIGHTS[estimate.feature]
  const measured = Number.isFinite(input.measuredUsd) && (input.measuredUsd as number) > 0
    ? (input.measuredUsd as number)
    : null
  const fromMeasured = measured === null ? estimate.reserve : creditsForUsd(measured)
  const beforeCap = Math.max(weight.floor, fromMeasured)
  const charged = Math.min(beforeCap, estimate.reserve)

  return {
    feature: estimate.feature,
    charged,
    released: Math.max(0, estimate.reserve - charged),
    measuredUsd: measured,
    cappedByCeiling: beforeCap > estimate.reserve,
  }
}

export type PlanEconomics = {
  slug: string
  monthlyPriceGhs: number
  includedCredits: number
  /** Cost if a subscriber spends every included credit. */
  fullUtilisationCostGhs: number
  /** That cost as a share of what the plan collects. */
  fullUtilisationCostRatio: number
  /** Revenue minus AI cost at full utilisation, before payment fees. */
  contributionAtFullUseGhs: number
  withinTarget: boolean
}

/**
 * Answers the question the pricing page cannot: if this subscriber uses
 * everything the plan promises, does the plan still make money?
 */
export function planEconomics(plan: { slug: string; monthlyPriceGhs: number; includedCredits: number }): PlanEconomics {
  const fullUtilisationCostGhs = plan.includedCredits * CREDIT_VALUE_GHS
  const ratio = plan.monthlyPriceGhs > 0 ? fullUtilisationCostGhs / plan.monthlyPriceGhs : Number.POSITIVE_INFINITY
  return {
    slug: plan.slug,
    monthlyPriceGhs: plan.monthlyPriceGhs,
    includedCredits: plan.includedCredits,
    fullUtilisationCostGhs: Number(fullUtilisationCostGhs.toFixed(2)),
    fullUtilisationCostRatio: Number(ratio.toFixed(4)),
    contributionAtFullUseGhs: Number((plan.monthlyPriceGhs - fullUtilisationCostGhs).toFixed(2)),
    withinTarget: plan.monthlyPriceGhs === 0 || ratio <= AI_COST_TARGET_RATIO,
  }
}
