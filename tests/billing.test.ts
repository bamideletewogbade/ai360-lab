import assert from 'node:assert/strict'
import test from 'node:test'
import { BILLING_PLANS, findBillingPlan, planPrice } from '../src/lib/billing/catalog.ts'

test('the pilot catalog keeps a free entry point and prices paid access in Ghana cedis', () => {
  assert.equal(BILLING_PLANS[0]?.slug, 'explorer')
  assert.equal(BILLING_PLANS[0]?.monthlyPriceGhs, 0)
  assert.equal(BILLING_PLANS[0]?.includedCredits, 5)
  assert.equal(findBillingPlan('everyday')?.monthlyPriceGhs, 125)
  assert.equal(planPrice(findBillingPlan('builder')!, 'annual'), 250)
  assert.ok(BILLING_PLANS.every((plan) => plan.includedCredits > 0))
})

test('paid plans retain a discount without making the free plan look paid', () => {
  for (const plan of BILLING_PLANS) {
    if (plan.slug === 'explorer') {
      assert.equal(planPrice(plan, 'annual'), 0)
      continue
    }
    assert.ok(planPrice(plan, 'annual') < planPrice(plan, 'monthly'))
  }
})
