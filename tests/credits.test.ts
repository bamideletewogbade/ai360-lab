import assert from 'node:assert/strict'
import test from 'node:test'
import { BILLING_PLANS, CREDIT_GUIDE } from '../src/lib/billing/catalog.ts'
import {
  AI_COST_TARGET_RATIO,
  allocateCreditRelease,
  CREDIT_VALUE_GHS,
  chatFeature,
  creditsForUsd,
  estimateCredits,
  FEATURE_WEIGHTS,
  landedCostGhs,
  planEconomics,
  PREMIUM_MODEL_MULTIPLIER,
  reservationTtlSeconds,
  settleCredits,
  usdBudgetForCredits,
} from '../src/lib/billing/credits.ts'
import { scopedIdempotencyKey } from '../src/lib/idempotency.ts'
import { creditGateFailureResponse } from '../src/lib/billing/credit-gate.ts'

test('landed cost includes the platform fee and the exchange buffer, not just the raw provider charge', () => {
  const raw = 1
  const landed = landedCostGhs(raw)
  assert.ok(landed > raw * 13, 'landed cost must exceed a plain currency conversion')
  assert.equal(landedCostGhs(0), 0)
  assert.equal(landedCostGhs(-1), 0)
  assert.equal(landedCostGhs(Number.NaN), 0)
})

test('the credit price is derived from the Everyday plan rather than chosen by intuition', () => {
  const everyday = BILLING_PLANS.find((plan) => plan.slug === 'everyday')!
  const derived = (everyday.monthlyPriceGhs * AI_COST_TARGET_RATIO) / everyday.includedCredits
  assert.ok(Math.abs(derived - CREDIT_VALUE_GHS) < 0.01, `derived ${derived} should match the published credit value`)
})

test('credits round up so a cheap request never bills as free work', () => {
  assert.equal(creditsForUsd(0), 0)
  assert.equal(creditsForUsd(0.000_01), 1)
  assert.ok(creditsForUsd(1) > creditsForUsd(0.5))
})

test('a provider quote raises the reservation above the published range when the work is genuinely expensive', () => {
  const published = estimateCredits('video')
  assert.equal(published.reserve, FEATURE_WEIGHTS.video.reserve)
  assert.equal(published.quotedUsd, null)

  const expensive = estimateCredits('video', { quotedUsd: 2 })
  assert.ok(expensive.reserve > published.reserve, 'an expensive quote must reserve more than the default')
  assert.equal(expensive.quotedUsd, 2)
  assert.ok(expensive.ceiling >= expensive.reserve, 'the ceiling can never sit below what was reserved')
})

test('failed work charges nothing and returns the whole reservation', () => {
  const estimate = estimateCredits('image')
  const settlement = settleCredits({ estimate, measuredUsd: 0.04, outcome: 'failure' })
  assert.equal(settlement.charged, 0)
  assert.equal(settlement.released, estimate.reserve)
})

test('unused credits return to their original allowance and purchased buckets', () => {
  const allocation = allocateCreditRelease({
    held: 5,
    charged: 1,
    allowanceDrawn: 3,
    restoreAllowance: true,
  })
  assert.deepEqual(allocation, {
    released: 4,
    allowanceReleased: 2,
    purchasedReleased: 2,
    availableReturned: 4,
    allowanceReturned: 2,
    expired: 0,
  })

  const mostlyCharged = allocateCreditRelease({
    held: 5,
    charged: 4,
    allowanceDrawn: 3,
    restoreAllowance: true,
  })
  assert.equal(mostlyCharged.allowanceReturned, 0)
  assert.equal(mostlyCharged.purchasedReleased, 1)
})

test('an expired allowance is never converted into permanent purchased credit', () => {
  const allocation = allocateCreditRelease({
    held: 5,
    charged: 0,
    allowanceDrawn: 3,
    restoreAllowance: false,
  })
  assert.equal(allocation.availableReturned, 2)
  assert.equal(allocation.expired, 3)
})

test('async reservations live long enough for polling-based work to finish', () => {
  assert.equal(reservationTtlSeconds('video'), 7_200)
  assert.equal(reservationTtlSeconds('agent'), 2_700)
  assert.equal(reservationTtlSeconds('chat'), 900)
})

test('idempotency keys are stable inside a workspace and isolated across workspaces', () => {
  const first = scopedIdempotencyKey('credit', 'user:alpha', 'image:retry-1')
  assert.equal(first, scopedIdempotencyKey('credit', 'user:alpha', 'image:retry-1'))
  assert.notEqual(first, scopedIdempotencyKey('credit', 'user:beta', 'image:retry-1'))
})

test('successful work charges measured cost and releases the unused hold', () => {
  const estimate = estimateCredits('agent')
  const settlement = settleCredits({ estimate, measuredUsd: 0.02, outcome: 'success' })
  assert.ok(settlement.charged >= FEATURE_WEIGHTS.agent.floor, 'a completed task must cover its floor')
  assert.ok(settlement.charged <= estimate.reserve)
  assert.equal(settlement.charged + settlement.released, estimate.reserve)
})

test('a task can never charge more than the amount the person already saw reserved', () => {
  const estimate = estimateCredits('chat.premium')
  const settlement = settleCredits({ estimate, measuredUsd: 50, outcome: 'success' })
  assert.equal(settlement.charged, estimate.reserve, 'the reservation is the hard ceiling')
  assert.equal(settlement.cappedByCeiling, true, 'absorbed overage must be visible to operations')
})

test('missing provider cost falls back to the reservation instead of charging zero', () => {
  const estimate = estimateCredits('image')
  const settlement = settleCredits({ estimate, measuredUsd: null, outcome: 'success' })
  assert.equal(settlement.charged, estimate.reserve)
  assert.equal(settlement.released, 0)
})

test('authenticated paid work fails closed when the ledger is unavailable', async () => {
  const response = creditGateFailureResponse({ ok: false, reason: 'database_not_configured' })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).status, 'credit_service_unavailable')
})

test('an idempotent replay cannot start paid provider work twice', async () => {
  const response = creditGateFailureResponse({
    ok: false,
    reason: 'already_reserved',
    reservationId: 'res_existing',
  })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).status, 'duplicate_request')
})

test('chat is classified by what the request actually asks for', () => {
  assert.equal(chatFeature({}), 'chat')
  assert.equal(chatFeature({ premium: true }), 'chat.premium')
  assert.equal(chatFeature({ hasAttachment: true }), 'chat.document')
  assert.equal(chatFeature({ liveResearch: true }), 'chat.research')
  assert.equal(chatFeature({ liveResearch: true, hasAttachment: true }), 'chat.research')
  assert.equal(chatFeature({ premium: true, liveResearch: true }), 'chat.research', 'live research beats the premium flag')
  assert.ok(FEATURE_WEIGHTS['chat.research'].floor > FEATURE_WEIGHTS.chat.floor)
  assert.equal(FEATURE_WEIGHTS['chat.overflow'].reserve, 1, 'overflow chat must never ask for more than one credit')
})

test('overflow chat after the daily limit is a flat one-credit metered turn', () => {
  const estimate = estimateCredits('chat.overflow')
  assert.equal(estimate.reserve, 1)
  assert.equal(estimate.ceiling, 1)

  const typical = settleCredits({ estimate, measuredUsd: 0.01, outcome: 'success' })
  assert.equal(typical.charged, 1, 'an extra chat message is one credit, never free')
  const cheap = settleCredits({ estimate, measuredUsd: 0.0001, outcome: 'success' })
  assert.equal(cheap.charged, 1, 'the one-credit floor holds even for a very cheap turn')
  const long = settleCredits({ estimate, measuredUsd: 0.4, outcome: 'success' })
  assert.equal(long.charged, 1, 'the reservation caps an unusually long turn at one credit')
  assert.equal(long.measuredUsd, 0.4, 'the ledger still records the real measured cost')

  const failed = settleCredits({ estimate, measuredUsd: 0.01, outcome: 'failure' })
  assert.equal(failed.charged, 0, 'failed overflow chat charges nothing')
  assert.equal(failed.released, 1, 'and returns the whole reservation')
})

test('premium-model chat is metered above measured cost, unlike included everyday chat', () => {
  const premium = settleCredits({ estimate: estimateCredits('chat.premium'), measuredUsd: 0.01, outcome: 'success' })
  const included = settleCredits({ estimate: estimateCredits('chat'), measuredUsd: 0.01, outcome: 'success' })
  assert.equal(included.charged, 0, 'plain chat on the fast model is included and charges nothing')
  assert.ok(premium.charged > included.charged, 'a premium model turn must never be the same price as the included default')
  assert.equal(premium.charged, creditsForUsd(0.01 * PREMIUM_MODEL_MULTIPLIER), 'the multiplier applies to measured cost before conversion')
  assert.ok(premium.charged <= FEATURE_WEIGHTS['chat.premium'].reserve)
})

test('every published credit-guide figure is backed by a real feature weight', () => {
  const publishedCeilings: Record<string, number> = {
    'Everyday chat on AI-Auto': FEATURE_WEIGHTS.chat.ceiling,
    'PDF, Word and Excel files': FEATURE_WEIGHTS.export.ceiling,
    'Extra chat beyond your daily limit': FEATURE_WEIGHTS['chat.overflow'].ceiling,
    'Premium model chat (Claude, Kimi)': FEATURE_WEIGHTS['chat.premium'].ceiling,
    'Current web research or file review': FEATURE_WEIGHTS['chat.research'].ceiling,
    'Multi-step agent workflow': FEATURE_WEIGHTS.agent.ceiling,
    'Generated image': FEATURE_WEIGHTS.image.ceiling,
    'Four-second promotional video': FEATURE_WEIGHTS.video.ceiling,
  }

  for (const item of CREDIT_GUIDE) {
    const backing = publishedCeilings[item.task]
    assert.ok(backing !== undefined, `the pricing page advertises "${item.task}" with no feature weight behind it`)
    // A row may only claim to be free when the engine really charges nothing
    // for it. Naming the feature rather than the row is what keeps the promise
    // enforceable: if `export` ever gains a price, this fails.
    if (/^included/i.test(item.credits)) {
      assert.equal(backing, 0, `"${item.task}" is advertised as included but the engine charges up to ${backing} credits`)
      continue
    }
    const highest = Number(item.credits.split(' to ').pop()?.replace(/[^0-9]/g, '') ?? '')
    assert.equal(highest, backing, `"${item.task}" advertises ${highest} credits but the engine charges up to ${backing}`)
  }
})

test('the video allowance leaves a real budget rather than an aspirational one', () => {
  const budget = usdBudgetForCredits(FEATURE_WEIGHTS.video.ceiling)
  assert.ok(budget > 0)
  assert.ok(budget < 1, 'a four-second clip priced above this budget sells below cost and must be repriced')
})

test('plan economics expose whether an allowance stays inside the stated cost target', () => {
  const everyday = planEconomics(BILLING_PLANS.find((plan) => plan.slug === 'everyday')!)
  assert.equal(everyday.withinTarget, true)
  assert.ok(everyday.contributionAtFullUseGhs > 0)

  const free = planEconomics(BILLING_PLANS.find((plan) => plan.slug === 'explorer')!)
  assert.equal(free.withinTarget, true, 'a free plan is acquisition cost, not a margin failure')
  assert.ok(free.fullUtilisationCostGhs > 0, 'free credits still cost real money and must be visible')
})

test('the catalog cannot silently add an allowance that breaks its own cost target', () => {
  const breaches = BILLING_PLANS.map(planEconomics).filter((plan) => !plan.withinTarget)
  assert.deepEqual(
    breaches.map((plan) => plan.slug),
    ['builder', 'team'],
    'known pricing breaches changed; reprice deliberately and update this expectation',
  )
})
