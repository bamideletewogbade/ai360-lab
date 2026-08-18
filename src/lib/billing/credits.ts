/**
 * The credit engine.
 *
 * One credit represents a bounded amount of useful work, not a fixed token
 * exchange rate. Customers see credits; this module is the only place that
 * knows what a credit costs AI360 to honour.
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
 * What a provider charge of `usd` actually costs AI360 once the platform fee,
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
  | 'chat.premium'
  | 'chat.research'
  | 'chat.document'
  | 'chat.overflow'
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
 *
 * `chat` is deliberately all zeros: plain chat on the fast model is included
 * with a plan and never draws from the credit meter, so the routes skip the
 * credit gate for it entirely (fair-use daily caps bound its cost instead).
 * `chat.overflow` is the same conversation once the daily allowance is spent:
 * a flat one-credit metered turn, so a paid user is never blocked at the cap.
 * Premium-model chat keeps metering so a deliberately expensive model is
 * never the same price as the included default.
 */
export const FEATURE_WEIGHTS: Record<CreditFeature, { floor: number; reserve: number; ceiling: number }> = {
  chat: { floor: 0, reserve: 0, ceiling: 0 },
  'chat.premium': { floor: 1, reserve: 4, ceiling: 8 },
  'chat.overflow': { floor: 1, reserve: 1, ceiling: 1 },
  'chat.research': { floor: 2, reserve: 2, ceiling: 4 },
  'chat.document': { floor: 2, reserve: 2, ceiling: 4 },
  agent: { floor: 3, reserve: 5, ceiling: 8 },
  image: { floor: 3, reserve: 4, ceiling: 6 },
  // Video is quoted from a live provider price before it runs, so `reserve` is
  // only the fallback for an unquoted estimate. The floor is set for the
  // cheapest engine Studio offers (a 4s draft clip costs about 7 credits), not
  // for the dearest: a floor of 12 charged a draft clip nearly as much as the
  // best one and erased the reason to choose it.
  //
  // The ceiling is what the model budget is derived from, so it decides which
  // engines can be offered at all. At 24 credits the premium engine (veo-3.1, a
  // 47-credit clip) was excluded, which made the premium tier a fiction that
  // silently resolved to the standard engine. At 48 it is real, and the
  // quote-driven reserve means nobody is charged the premium rate unless they
  // choose it and accept the price first.
  video: { floor: 6, reserve: 16, ceiling: 48 },
  voice: { floor: 1, reserve: 1, ceiling: 2 },
  export: { floor: 0, reserve: 0, ceiling: 0 },
}

export function isCreditFeature(value: unknown): value is CreditFeature {
  return typeof value === 'string' && value in FEATURE_WEIGHTS
}

/**
 * What a second of video may cost.
 *
 * A flat per-render ceiling cannot describe video honestly: the same engine
 * charges by the second, so one cap either refuses an eight-second clip outright
 * or leaves a four-second one able to spend twice what it should. Twelve credits
 * a second is exactly today's four-second ceiling of 48, so nothing about a
 * short clip changes; longer clips simply cost proportionally more.
 *
 * The promise that nothing costs more than the person saw is kept by the quote
 * they accept before the render starts, not by this number. This decides which
 * engines may be offered for a given length.
 */
export const VIDEO_CREDITS_PER_SECOND = 12

export function videoCeilingCredits(durationSeconds?: number) {
  const seconds = Number.isFinite(durationSeconds) && (durationSeconds as number) > 0
    ? (durationSeconds as number)
    : 4
  return Math.max(FEATURE_WEIGHTS.video.floor, Math.round(VIDEO_CREDITS_PER_SECOND * seconds))
}

/** Async work keeps its hold long enough to finish in a later polling request. */
export function reservationTtlSeconds(feature: CreditFeature) {
  if (feature === 'video') return 2 * 60 * 60
  if (feature === 'agent') return 45 * 60
  return 15 * 60
}

/**
 * Chat is charged by what the request actually asks for: a plain question on
 * the fast model is included (`chat`), while live research, a file and a
 * deliberately premium model each keep their own metered feature. The chat
 * route promotes `chat` to `chat.overflow` once the daily fair-use allowance
 * is spent, so this helper never has to know about the daily cap.
 */
export function chatFeature(options: {
  liveResearch?: boolean
  hasAttachment?: boolean
  /** The user deliberately picked a model priced well above the fast default. */
  premium?: boolean
}): CreditFeature {
  if (options.liveResearch) return 'chat.research'
  if (options.hasAttachment) return 'chat.document'
  if (options.premium) return 'chat.premium'
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
 * does, that price decides the reservation and the feature floor is the only
 * minimum that applies. Holding the published `reserve` on top of a known
 * cheaper price would charge someone the dear engine's rate for the cheap one,
 * which is precisely what makes a lower-cost option worth offering. Without a
 * quote there is nothing better to go on, so the published reservation applies.
 */
export function estimateCredits(feature: CreditFeature, options: { quotedUsd?: number } = {}): CreditEstimate {
  const weight = FEATURE_WEIGHTS[feature]
  const quoted = Number.isFinite(options.quotedUsd) && (options.quotedUsd as number) > 0
    ? (options.quotedUsd as number)
    : null
  const reserve = quoted === null
    ? weight.reserve
    : Math.max(weight.floor, creditsForUsd(quoted))
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
 * Premium-model chat is billed above its measured cost so choosing an
 * expensive model is never the same price as the included fast default.
 *
 * This is the Cursor/Copilot "premium models consume credits faster" pattern
 * adapted to a credit ledger: the multiplier applies to the measured provider
 * cost before it is converted to credits.
 */
export const PREMIUM_MODEL_MULTIPLIER = 2

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
  // The multiplier is pricing policy on top of the provider's real cost, so
  // the settlement still records the actual measured amount while the charge
  // reflects the premium price.
  const priced = measured === null
    ? null
    : estimate.feature === 'chat.premium'
      ? measured * PREMIUM_MODEL_MULTIPLIER
      : measured
  const fromMeasured = priced === null ? estimate.reserve : creditsForUsd(priced)
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

export type CreditReleaseAllocation = {
  released: number
  allowanceReleased: number
  purchasedReleased: number
  availableReturned: number
  allowanceReturned: number
  expired: number
}

/**
 * Put an unused hold back into the same credit bucket it came from.
 *
 * Allowance is consumed before purchased credit. Therefore only the allowance
 * left after the charge is refundable. If its exact grant has since been
 * replaced or expired, that portion disappears instead of becoming permanent.
 */
export function allocateCreditRelease(input: {
  held: number
  charged: number
  allowanceDrawn: number
  restoreAllowance: boolean
}): CreditReleaseAllocation {
  const held = Math.max(0, Math.floor(input.held))
  const charged = Math.min(held, Math.max(0, Math.floor(input.charged)))
  const allowanceDrawn = Math.min(held, Math.max(0, Math.floor(input.allowanceDrawn)))
  const released = held - charged
  const allowanceReleased = Math.min(released, Math.max(allowanceDrawn - charged, 0))
  const purchasedReleased = released - allowanceReleased
  const allowanceReturned = input.restoreAllowance ? allowanceReleased : 0
  const expired = allowanceReleased - allowanceReturned
  return {
    released,
    allowanceReleased,
    purchasedReleased,
    availableReturned: purchasedReleased + allowanceReturned,
    allowanceReturned,
    expired,
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
