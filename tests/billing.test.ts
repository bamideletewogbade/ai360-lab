import assert from 'node:assert/strict'
import test from 'node:test'
import { BILLING_CATALOG_VERSION, BILLING_PLANS, findBillingPlan } from '../src/lib/billing/catalog.ts'
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
  assert.equal(checkoutRequestSchema.safeParse({ plan: 'builder', cadence: 'monthly', phone: '024 000 0000' }).success, true)
  assert.equal(checkoutRequestSchema.safeParse({ plan: 'builder', cadence: 'annual', phone: '024 000 0000' }).success, false)
})

test('checkout normalizes Ghana phone numbers before they reach the provider', () => {
  const local = checkoutRequestSchema.parse({ plan: 'everyday', phone: '024 000 0000' })
  const international = checkoutRequestSchema.parse({ plan: 'everyday', phone: '+233 24 000 0000' })
  assert.equal(local.phone, '233240000000')
  assert.equal(international.phone, '233240000000')
  assert.equal(checkoutRequestSchema.safeParse({ plan: 'everyday', phone: '123' }).success, false)
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
