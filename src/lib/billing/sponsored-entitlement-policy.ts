import { findBillingPlan, type BillingPlan } from '@/lib/billing/catalog'

/**
 * Whether a sponsored plan entitlement may be granted, decided without touching
 * storage so the rules can be tested and previewed by the operator tooling.
 *
 * A sponsored seat exists because granting credits alone does not change what a
 * workspace is entitled to. `credit-repository.resolvePlan` reads the
 * subscription table, so a pilot participant holding a `sponsored_seat` credit
 * grant is still on Explorer — and Explorer's fair-use cap is ten chat messages
 * a day (`CHAT_FAIR_USE_DAILY`). Past that the grant meters away at one credit
 * per message on the cheapest work in the product, which drains a pilot
 * allowance long before it reaches research, agent runs or media.
 *
 * This gives an operator a way to place someone on a real plan tier without a
 * payment, so the credits they were given are spent on the work the pilot is
 * meant to measure.
 */

/** The provider name reserved for entitlements no money passed through. */
export const SPONSORED_PROVIDER = 'sponsored'

/**
 * Four weeks of pilot plus a week of slack, so an entitlement cannot lapse
 * during the exit interviews that close the cohort out.
 */
export const DEFAULT_SPONSORED_DAYS = 35

/** Long enough for a quarter-long programme, short enough to stay deliberate. */
export const MAX_SPONSORED_DAYS = 120

export type ActiveSubscription = {
  provider: string
  planSlug: string
}

export type SponsoredEntitlementRefusal =
  | 'unknown_plan'
  | 'organization_plan'
  | 'invalid_period'
  | 'has_paid_subscription'

export type SponsoredEntitlementDecision =
  | { ok: true; plan: BillingPlan; periodDays: number }
  | { ok: false; reason: SponsoredEntitlementRefusal }

export function decideSponsoredEntitlement(input: {
  planSlug: string
  periodDays?: number
  activeSubscriptions: ActiveSubscription[]
}): SponsoredEntitlementDecision {
  const plan = findBillingPlan(input.planSlug)
  if (!plan) return { ok: false, reason: 'unknown_plan' }

  // Team is an organization plan. It needs a membership lifecycle that is still
  // feature-gated, so handing it out here would create an entitlement the rest
  // of the product cannot honour.
  if (plan.workspace !== 'personal') return { ok: false, reason: 'organization_plan' }

  const periodDays = input.periodDays ?? DEFAULT_SPONSORED_DAYS
  if (!Number.isSafeInteger(periodDays) || periodDays < 1 || periodDays > MAX_SPONSORED_DAYS) {
    return { ok: false, reason: 'invalid_period' }
  }

  // `resolvePlan` takes whichever active subscription runs latest, so a
  // sponsored seat granted over a live paid subscription could silently move a
  // paying customer onto a smaller plan. Refuse instead: a customer who is
  // already paying does not need a sponsored seat, and quietly downgrading one
  // is worse than making the operator look at the row.
  const paid = input.activeSubscriptions.some((row) => row.provider !== SPONSORED_PROVIDER)
  if (paid) return { ok: false, reason: 'has_paid_subscription' }

  return { ok: true, plan, periodDays }
}

/** Operator-facing text for a refusal, so every surface explains it the same way. */
export function explainSponsoredRefusal(reason: SponsoredEntitlementRefusal) {
  switch (reason) {
    case 'unknown_plan':
      return 'That plan is not in the billing catalogue.'
    case 'organization_plan':
      return 'Team is an organization plan and cannot be sponsored onto a personal workspace.'
    case 'invalid_period':
      return `Sponsored access must run for 1 to ${MAX_SPONSORED_DAYS} whole days.`
    case 'has_paid_subscription':
      return 'This workspace already has active paid access. Sponsoring it could downgrade the plan they paid for.'
  }
}
