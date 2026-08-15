import assert from 'node:assert/strict'
import test from 'node:test'
import { BILLING_CATALOG_VERSION, BILLING_PLANS, CREDIT_TOP_UPS, findBillingPlan } from '../src/lib/billing/catalog.ts'
import { checkoutRequestSchema } from '../src/lib/billing/checkout-contract.ts'
import { allowanceAction } from '../src/lib/billing/allowance-policy.ts'

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
  // The phone number is collected by ExpressPay's own checkout, never by AI360.
  assert.equal(checkoutRequestSchema.safeParse({ plan: 'builder', cadence: 'monthly' }).success, true)
  assert.equal(checkoutRequestSchema.safeParse({ plan: 'builder', cadence: 'annual' }).success, false)
  assert.equal('phone' in checkoutRequestSchema.shape, false)
})

test('checkout accepts exactly one item: a monthly plan or a one-time top-up', () => {
  assert.equal(checkoutRequestSchema.safeParse({ plan: 'builder', cadence: 'monthly' }).success, true)
  assert.equal(checkoutRequestSchema.safeParse({ topup: 'topup-50' }).success, true)
  assert.equal(checkoutRequestSchema.safeParse({ topup: 'topup-200', paymentMethod: 'card' }).success, true)
  assert.equal(checkoutRequestSchema.safeParse({}).success, false, 'a checkout must name one item')
  assert.equal(checkoutRequestSchema.safeParse({ plan: 'builder', topup: 'topup-50' }).success, false, 'a checkout cannot buy a plan and a top-up at once')
  assert.equal(checkoutRequestSchema.safeParse({ plan: 'builder', cadence: 'annual' }).success, false)
  assert.equal(checkoutRequestSchema.safeParse({ topup: 'topup-999' }).success, false, 'an unknown top-up slug is rejected')
})

test('top-up bundles stay fixed so a purchase can never be renamed silently', () => {
  assert.deepEqual(CREDIT_TOP_UPS.map((topUp) => topUp.slug), ['topup-50', 'topup-100', 'topup-200'])
  for (const topUp of CREDIT_TOP_UPS) {
    assert.ok(topUp.priceGhs > 0, `${topUp.slug} must have a price`)
    assert.ok(topUp.credits > 0, `${topUp.slug} must grant credits`)
  }
})

test('payment repository exposes workspace subscription and payment history helpers', async () => {
  const repository = await import('../src/lib/payments/payment-repository.ts')
  assert.equal(typeof repository.readWorkspaceSubscription, 'function')
  assert.equal(typeof repository.listWorkspacePaymentAttempts, 'function')
})

test('a calendar boundary never grants a paid allowance without another payment', () => {
  assert.equal(allowanceAction({
    entitledPlan: 'everyday',
    accountPlan: 'everyday',
    accountPeriod: '2026-08',
    currentPeriod: '2026-09',
  }), 'keep')
})

test('expired prepaid access returns to the free monthly allowance', () => {
  assert.equal(allowanceAction({
    entitledPlan: 'explorer',
    accountPlan: 'builder',
    accountPeriod: '2026-08',
    currentPeriod: '2026-09',
  }), 'refresh_free')
  assert.equal(allowanceAction({
    entitledPlan: 'explorer',
    accountPlan: 'explorer',
    accountPeriod: '2026-09',
    currentPeriod: '2026-09',
  }), 'keep')
})

test('a mismatched paid account fails closed instead of manufacturing credits', () => {
  assert.equal(allowanceAction({
    entitledPlan: 'builder',
    accountPlan: 'explorer',
    accountPeriod: '2026-09',
    currentPeriod: '2026-09',
  }), 'invalid_paid_state')
})
