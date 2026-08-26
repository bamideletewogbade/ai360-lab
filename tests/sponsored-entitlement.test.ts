import assert from 'node:assert/strict'
import test from 'node:test'
import {
  decideSponsoredEntitlement,
  explainSponsoredRefusal,
  DEFAULT_SPONSORED_DAYS,
  MAX_SPONSORED_DAYS,
  SPONSORED_PROVIDER,
} from '../src/lib/billing/sponsored-entitlement-policy.ts'
import { CHAT_FAIR_USE_DAILY, findBillingPlan } from '../src/lib/billing/catalog.ts'
import { allowanceAction } from '../src/lib/billing/allowance-policy.ts'

test('a sponsored seat carries the plan allowance, not an invented number', () => {
  const decision = decideSponsoredEntitlement({ planSlug: 'everyday', activeSubscriptions: [] })
  assert.equal(decision.ok, true)
  assert.ok(decision.ok)
  // The pilot measures whether the Everyday allowance is credible at its price,
  // so the sponsored grant must be that exact allowance and nothing else.
  assert.equal(decision.plan.includedCredits, findBillingPlan('everyday')?.includedCredits)
  assert.equal(decision.plan.includedCredits, 120)
  assert.equal(decision.periodDays, DEFAULT_SPONSORED_DAYS)
})

test('sponsoring a plan is the only thing that lifts the daily chat cap', () => {
  // This is the whole reason the module exists: a credit grant alone leaves a
  // participant on Explorer, where ten messages a day is the cap and every
  // message past it meters against the credits the pilot wanted spent on
  // research, agent runs and media.
  assert.equal(CHAT_FAIR_USE_DAILY.explorer, 10)
  assert.equal(CHAT_FAIR_USE_DAILY.everyday, 60)
  assert.ok(CHAT_FAIR_USE_DAILY.everyday > CHAT_FAIR_USE_DAILY.explorer * 5)
})

test('the account allowance must be moved with the entitlement, or the next touch throws', () => {
  // `ensureAllowance` refuses to reconcile a paid entitlement against an
  // Explorer allowance row. Writing the subscription without also writing the
  // allowance would strand every later request behind
  // PAID_ALLOWANCE_STATE_MISMATCH, so these two writes belong in one
  // transaction — which is what `grantSponsoredEntitlement` does.
  assert.equal(
    allowanceAction({
      entitledPlan: 'everyday',
      accountPlan: 'explorer',
      accountPeriod: '2026-09',
      currentPeriod: '2026-09',
    }),
    'invalid_paid_state',
  )
  assert.equal(
    allowanceAction({
      entitledPlan: 'everyday',
      accountPlan: 'everyday',
      accountPeriod: '2026-09',
      currentPeriod: '2026-09',
    }),
    'keep',
  )
})

test('a sponsored seat never overwrites access somebody paid for', () => {
  const decision = decideSponsoredEntitlement({
    planSlug: 'everyday',
    activeSubscriptions: [{ provider: 'expresspay', planSlug: 'builder' }],
  })
  assert.equal(decision.ok, false)
  assert.ok(!decision.ok)
  assert.equal(decision.reason, 'has_paid_subscription')
})

test('re-sponsoring an existing sponsored seat is allowed, so a cohort can be extended', () => {
  const decision = decideSponsoredEntitlement({
    planSlug: 'everyday',
    activeSubscriptions: [{ provider: SPONSORED_PROVIDER, planSlug: 'everyday' }],
  })
  assert.equal(decision.ok, true)
})

test('Team cannot be sponsored onto a personal workspace', () => {
  const decision = decideSponsoredEntitlement({ planSlug: 'team', activeSubscriptions: [] })
  assert.equal(decision.ok, false)
  assert.ok(!decision.ok)
  assert.equal(decision.reason, 'organization_plan')
})

test('an unknown plan is refused rather than silently falling back to free', () => {
  const decision = decideSponsoredEntitlement({ planSlug: 'enterprise', activeSubscriptions: [] })
  assert.equal(decision.ok, false)
  assert.ok(!decision.ok)
  assert.equal(decision.reason, 'unknown_plan')
})

test('sponsored access is bounded in time', () => {
  const forever = decideSponsoredEntitlement({
    planSlug: 'everyday',
    periodDays: MAX_SPONSORED_DAYS + 1,
    activeSubscriptions: [],
  })
  assert.equal(forever.ok, false)

  for (const bad of [0, -1, 1.5, Number.NaN]) {
    const decision = decideSponsoredEntitlement({
      planSlug: 'everyday',
      periodDays: bad,
      activeSubscriptions: [],
    })
    assert.equal(decision.ok, false, `periodDays ${bad} must be refused`)
  }

  const ok = decideSponsoredEntitlement({
    planSlug: 'everyday',
    periodDays: MAX_SPONSORED_DAYS,
    activeSubscriptions: [],
  })
  assert.equal(ok.ok, true)
})

test('the default sponsored window outlasts a four-week pilot', () => {
  assert.ok(DEFAULT_SPONSORED_DAYS > 28, 'a 28-day window would lapse during exit interviews')
  assert.ok(DEFAULT_SPONSORED_DAYS <= MAX_SPONSORED_DAYS)
})

test('every refusal explains itself to the operator', () => {
  const reasons = [
    'unknown_plan', 'organization_plan', 'invalid_period', 'has_paid_subscription',
  ] as const
  for (const reason of reasons) {
    const text = explainSponsoredRefusal(reason)
    assert.ok(text.length > 20, `${reason} needs a usable explanation`)
  }
})
