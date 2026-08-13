import assert from 'node:assert/strict'
import test from 'node:test'
import { BILLING_PLANS, CREDIT_TOP_UPS } from '../src/lib/billing/catalog.ts'
import {
  AI_COST_TARGET_RATIO, CREDIT_VALUE_GHS, planEconomics,
} from '../src/lib/billing/credits.ts'

/**
 * The catalogue is a commercial contract. These tests exist so a change to a
 * price or a credit count has to be a decision rather than an accident.
 */

const paidPlans = BILLING_PLANS.filter((plan) => plan.monthlyPriceGhs > 0)
const perCredit = (plan: { monthlyPriceGhs: number; includedCredits: number }) =>
  plan.monthlyPriceGhs / plan.includedCredits

/** The cheapest paid plan is the rate every other purchase is judged against. */
const entryPlan = paidPlans.reduce((cheapest, plan) =>
  plan.monthlyPriceGhs < cheapest.monthlyPriceGhs ? plan : cheapest)

/**
 * Plans that deliberately spend guardrail headroom on a volume discount.
 *
 * The 25% cost target implies a hard floor on the price of a credit, so a
 * volume discount and the target cannot both hold — see the price-floor test
 * below. These two tiers consciously choose the discount. Adding a plan here
 * should be a pricing decision, not a way to make a failing test pass.
 */
const VOLUME_DISCOUNTED = new Set(['builder', 'team'])

test('the cost guardrail implies a hard floor on the price of a credit', () => {
  const floor = CREDIT_VALUE_GHS / AI_COST_TARGET_RATIO
  assert.equal(Number(floor.toFixed(3)), 1.04)
  // Stated plainly because it is the reason the exceptions below exist: any
  // plan priced under this per credit cannot meet the target, by arithmetic.
  assert.ok(perCredit(entryPlan) >= floor, 'the entry paid plan must clear the floor')
})

test('every paid plan meets the cost target or is a recorded exception', () => {
  for (const plan of paidPlans) {
    const economics = planEconomics(plan)
    if (VOLUME_DISCOUNTED.has(plan.slug)) {
      assert.equal(
        economics.withinTarget, false,
        `${plan.slug} is listed as volume-discounted but now meets the target — remove it from VOLUME_DISCOUNTED`,
      )
      continue
    }
    assert.equal(
      economics.withinTarget, true,
      `${plan.slug} spends ${(economics.fullUtilisationCostRatio * 100).toFixed(1)}% of revenue on AI cost, above the ${AI_COST_TARGET_RATIO * 100}% target`,
    )
  }
})

test('every plan still contributes at full utilisation', () => {
  // The guardrail protects headroom; this protects solvency. A discounted tier
  // may miss the target, but it must never cost more than it collects.
  for (const plan of paidPlans) {
    const economics = planEconomics(plan)
    assert.ok(
      economics.contributionAtFullUseGhs > 0,
      `${plan.slug} loses GHS ${Math.abs(economics.contributionAtFullUseGhs)} per month at full use`,
    )
  }
})

test('a top-up never undercuts a subscription', () => {
  // The regression: topup-200 priced credits below the Everyday plan, so the
  // cheapest way to buy credits was to never subscribe.
  const entryRate = perCredit(entryPlan)
  for (const topUp of CREDIT_TOP_UPS) {
    const rate = topUp.priceGhs / topUp.credits
    assert.ok(
      rate > entryRate,
      `${topUp.slug} sells credits at GHS ${rate.toFixed(3)}, at or below the ${entryPlan.slug} rate of GHS ${entryRate.toFixed(3)}`,
    )
  }
})

test('larger top-ups stay better value than smaller ones', () => {
  const byPrice = [...CREDIT_TOP_UPS].sort((a, b) => a.priceGhs - b.priceGhs)
  for (let index = 1; index < byPrice.length; index += 1) {
    const previous = byPrice[index - 1].priceGhs / byPrice[index - 1].credits
    const current = byPrice[index].priceGhs / byPrice[index].credits
    assert.ok(
      current < previous,
      `${byPrice[index].slug} is not better value per credit than ${byPrice[index - 1].slug}`,
    )
  }
})

test('paid plans improve in value as they get larger', () => {
  const byPrice = [...paidPlans].sort((a, b) => a.monthlyPriceGhs - b.monthlyPriceGhs)
  for (let index = 1; index < byPrice.length; index += 1) {
    assert.ok(
      perCredit(byPrice[index]) < perCredit(byPrice[index - 1]),
      `${byPrice[index].slug} costs more per credit than ${byPrice[index - 1].slug}, so upgrading is a worse deal`,
    )
  }
})

test('the free tier can be evaluated but not exploited', () => {
  const free = BILLING_PLANS.find((plan) => plan.monthlyPriceGhs === 0)
  assert.ok(free, 'a free tier must exist for guest-to-account conversion')
  assert.ok(free.includedCredits > 0, 'the free tier must allow at least some real work')
  // What a month of free usage costs us, per account. Kept visible because it
  // is the exposure if accounts can be created without a verified email.
  const monthlyCost = free.includedCredits * CREDIT_VALUE_GHS
  assert.ok(monthlyCost <= 3, `the free tier costs GHS ${monthlyCost.toFixed(2)} per account per month`)
})
