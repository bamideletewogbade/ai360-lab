import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUDGET_SINCE_ENV,
  DAILY_SPEND_SCOPES,
  DEFAULT_SPEND_CAPS_USD,
  budgetConfigIncomplete,
  decideSpend,
  parseBudgetSince,
  parseSpendCap,
  readSpendCaps,
  secondsUntilUtcMidnight,
  spendCapEnvName,
  type SpendCaps,
} from '../src/lib/billing/spend-cap-policy.ts'
import { usdBudgetForCredits, FEATURE_WEIGHTS } from '../src/lib/billing/credits.ts'

const NO_CAPS: SpendCaps = { budget: null, application: null, workspace: null, user: null }

test('an unconfigured deployment still has a daily ceiling', () => {
  const caps = readSpendCaps({})
  for (const scope of DAILY_SPEND_SCOPES) {
    assert.equal(caps[scope], DEFAULT_SPEND_CAPS_USD[scope])
    assert.ok(caps[scope]! > 0)
  }
  // But never an invented cumulative budget: that is somebody's actual money.
  assert.equal(caps.budget, null)
})

test('a cumulative budget needs both an amount and a start date', () => {
  const amountOnly = readSpendCaps({ [spendCapEnvName('budget')]: '20' })
  assert.equal(amountOnly.budget, null, 'an amount with no window cannot be enforced honestly')
  assert.match(budgetConfigIncomplete({ [spendCapEnvName('budget')]: '20' })!, /SINCE/)

  const dateOnly = readSpendCaps({ [BUDGET_SINCE_ENV]: '2026-09-01' })
  assert.equal(dateOnly.budget, null)
  assert.ok(budgetConfigIncomplete({ [BUDGET_SINCE_ENV]: '2026-09-01' }))

  const both = readSpendCaps({
    [spendCapEnvName('budget')]: '20',
    [BUDGET_SINCE_ENV]: '2026-09-01',
  })
  assert.equal(both.budget, 20)
  assert.equal(budgetConfigIncomplete({
    [spendCapEnvName('budget')]: '20',
    [BUDGET_SINCE_ENV]: '2026-09-01',
  }), null)
})

test('a budget start date is read as UTC midnight, and junk is refused', () => {
  assert.equal(parseBudgetSince('2026-09-01')?.toISOString(), '2026-09-01T00:00:00.000Z')
  for (const bad of ['', '  ', 'yesterday', '01-09-2026', '2026-9-1', undefined]) {
    assert.equal(parseBudgetSince(bad), null, `${JSON.stringify(bad)} must be refused`)
  }
})

test('a spent programme budget stops work even while daily caps have room', () => {
  const caps: SpendCaps = { budget: 20, application: 25, workspace: 5, user: 5 }
  const decision = decideSpend({
    caps,
    // Nothing spent today, but the pot is empty.
    spent: { budget: 19.95, application: 0, workspace: 0, user: 0 },
    projectedUsd: 0.14,
  })
  assert.equal(decision.allowed, false)
  assert.ok(!decision.allowed)
  assert.equal(decision.scope, 'budget')
})

test('a cap is disabled only by saying so, never by accident', () => {
  for (const off of ['off', 'none', 'disabled', 'OFF', ' Off ']) {
    assert.equal(parseSpendCap(off, 'workspace'), null, `${off} should disable`)
  }
  // The failure mode of a typo must be the default, not an uncapped bill.
  for (const bad of ['', '   ', 'abc', '-5', '0', 'NaN', 'Infinity']) {
    assert.equal(
      parseSpendCap(bad, 'workspace'),
      DEFAULT_SPEND_CAPS_USD.workspace,
      `${JSON.stringify(bad)} should fall back to the default`,
    )
  }
  assert.equal(parseSpendCap('12.5', 'workspace'), 12.5)
})

test('each scope reads its own environment variable', () => {
  const caps = readSpendCaps({
    [spendCapEnvName('application')]: '100',
    [spendCapEnvName('workspace')]: '9',
    [spendCapEnvName('user')]: 'off',
  })
  assert.deepEqual(caps, { budget: null, application: 100, workspace: 9, user: null })
})

test('a cap is a ceiling, not a tripwire: work is refused before it crosses', () => {
  const caps: SpendCaps = { budget: null, application: null, workspace: 5, user: null }
  // Under the line with the projection included: allowed.
  assert.equal(
    decideSpend({ caps, spent: { budget: 0, application: 0, workspace: 4, user: 0 }, projectedUsd: 0.5 }).allowed,
    true,
  )
  // The request itself would carry it over, so it never starts.
  const refused = decideSpend({
    caps,
    spent: { budget: 0, application: 0, workspace: 4.9, user: 0 },
    projectedUsd: 0.5,
  })
  assert.equal(refused.allowed, false)
  assert.ok(!refused.allowed)
  assert.equal(refused.scope, 'workspace')
  assert.equal(refused.capUsd, 5)
})

test('the narrowest breached scope is the one reported', () => {
  const caps: SpendCaps = { budget: null, application: 10, workspace: 5, user: 2 }
  const decision = decideSpend({
    caps,
    spent: { budget: 0, application: 99, workspace: 99, user: 99 },
    projectedUsd: 0.1,
  })
  assert.ok(!decision.allowed)
  // "You have spent your day's worth" is more useful than "the platform is busy".
  assert.equal(decision.scope, 'user')
})

test('a disabled scope is skipped rather than treated as zero', () => {
  const decision = decideSpend({
    caps: NO_CAPS,
    spent: { budget: 0, application: 1e6, workspace: 1e6, user: 1e6 },
    projectedUsd: 1e6,
  })
  assert.equal(decision.allowed, true)
})

test('unusable spend readings are treated as zero, never as a reason to refuse', () => {
  const caps: SpendCaps = { budget: null, application: 10, workspace: 10, user: 10 }
  const decision = decideSpend({
    caps,
    spent: { budget: 0, application: Number.NaN, workspace: -3, user: Number.NaN },
    projectedUsd: 1,
  })
  assert.equal(decision.allowed, true)
})

test('a missing or nonsense projection does not block work on its own', () => {
  const caps: SpendCaps = { budget: null, application: 10, workspace: 10, user: 10 }
  for (const projected of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const decision = decideSpend({
      caps,
      spent: { budget: 0, application: 5, workspace: 5, user: 5 },
      projectedUsd: projected,
    })
    assert.equal(decision.allowed, true, `projection ${projected} must not refuse a request under cap`)
  }
})

test('the default caps leave ordinary pilot work far below the line', () => {
  // A whole Everyday allowance converted back to provider dollars is the most
  // a compliant participant can cost in a month. One day's cap must sit well
  // above it, or legitimate use would trip the breaker.
  const monthlyBudgetUsd = usdBudgetForCredits(120)
  assert.ok(
    DEFAULT_SPEND_CAPS_USD.workspace! > monthlyBudgetUsd,
    `workspace cap ${DEFAULT_SPEND_CAPS_USD.workspace} must exceed a month of Everyday (${monthlyBudgetUsd})`,
  )
  // And a single most-expensive request must always be able to start.
  const dearestRequestUsd = usdBudgetForCredits(FEATURE_WEIGHTS.video.ceiling)
  assert.ok(
    DEFAULT_SPEND_CAPS_USD.workspace! > dearestRequestUsd,
    'the dearest single request must fit inside a workspace day',
  )
  assert.ok(DEFAULT_SPEND_CAPS_USD.application! >= DEFAULT_SPEND_CAPS_USD.workspace!)
})

test('the reset hint points at the next UTC midnight', () => {
  const justBefore = new Date(Date.UTC(2026, 8, 1, 23, 59, 30))
  assert.equal(secondsUntilUtcMidnight(justBefore), 30)
  const justAfter = new Date(Date.UTC(2026, 8, 1, 0, 0, 0))
  assert.equal(secondsUntilUtcMidnight(justAfter), 86_400)
  assert.ok(secondsUntilUtcMidnight(new Date()) > 0)
})
