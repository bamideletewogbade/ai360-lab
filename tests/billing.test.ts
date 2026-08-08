import assert from 'node:assert/strict'
import test from 'node:test'
import { BILLING_CATALOG_VERSION, BILLING_PLANS, findBillingPlan } from '../src/lib/billing/catalog.ts'
import { checkoutRequestSchema } from '../src/lib/billing/checkout-contract.ts'

test('the pilot catalog keeps a free entry point and prices paid access in Ghana cedis', () => {
  assert.equal(BILLING_PLANS[0]?.slug, 'explorer')
  assert.equal(BILLING_PLANS[0]?.monthlyPriceGhs, 0)
  assert.equal(BILLING_PLANS[0]?.includedCredits, 5)
  assert.equal(findBillingPlan('everyday')?.monthlyPriceGhs, 125)
  assert.equal(findBillingPlan('builder')?.monthlyPriceGhs, 350)
  assert.equal(findBillingPlan('team')?.monthlyPriceGhs, 1_200)
  assert.equal(findBillingPlan('team')?.includedCredits, 1_400)
  assert.equal(findBillingPlan('team')?.assisted, true)
  assert.ok(BILLING_PLANS.every((plan) => plan.includedCredits > 0))
})

test('the public pilot catalog is versioned and monthly only', () => {
  assert.equal(BILLING_CATALOG_VERSION, 'pilot-2026-08-v3')
  assert.ok(BILLING_PLANS.every((plan) => !('annualMonthlyPriceGhs' in plan)))
  assert.equal(checkoutRequestSchema.safeParse({ plan: 'builder', cadence: 'monthly' }).success, true)
  assert.equal(checkoutRequestSchema.safeParse({ plan: 'builder', cadence: 'annual' }).success, false)
})
