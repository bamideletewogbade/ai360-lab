import { dirname, resolve as resolvePath } from 'node:path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config } from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolvePath(here, '..')

config({ path: resolvePath(projectRoot, '.env.local'), quiet: true })
config({ path: resolvePath(projectRoot, '.env'), quiet: true })
register(pathToFileURL(resolvePath(here, 'alias-loader.mjs')).href, pathToFileURL(projectRoot))

const { PILOT_INITIAL_CREDITS, PILOT_FEEDBACK_REWARD_CREDITS, PILOT_TOTAL_BUDGET_USD } =
  await import('../src/lib/billing/pilot-policy.ts')
const { decideSponsoredEntitlement } = await import('../src/lib/billing/sponsored-entitlement-policy.ts')
const { allowanceAction } = await import('../src/lib/billing/allowance-policy.ts')
const { findBillingPlan } = await import('../src/lib/billing/catalog.ts')
const { usdBudgetForCredits } = await import('../src/lib/billing/credits.ts')

/**
 * Read-only proof that a pilot tester receives the bounded allowance, and only
 * that allowance, for as long as the sponsored seat lasts.
 *
 * Writes nothing. It exists because the interesting failure is not the grant —
 * that is easy to read — but the monthly allowance refresh silently restoring
 * the commercial 120 four days into a two-week pilot.
 */

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

const everyday = findBillingPlan('everyday')
console.log(`PILOT ALLOWANCE`)
console.log(`  pilot grant       ${PILOT_INITIAL_CREDITS} credits`)
console.log(`  follow-up reward  ${PILOT_FEEDBACK_REWARD_CREDITS} credits`)
console.log(`  everyday plan     ${everyday.includedCredits} credits (commercial)`)
console.log(`  programme budget  $${PILOT_TOTAL_BUDGET_USD}`)
console.log('')

// 1. The grant itself.
const granted = decideSponsoredEntitlement({
  planSlug: 'everyday',
  allowanceCredits: PILOT_INITIAL_CREDITS,
  activeSubscriptions: [],
})
check(
  'a pilot seat grants the bounded allowance, not the plan allowance',
  granted.ok && granted.allowanceCredits === PILOT_INITIAL_CREDITS,
  granted.ok ? `${granted.allowanceCredits} credits on ${granted.plan.slug}` : `refused: ${granted.reason}`,
)

// 2. The ceiling. A sponsored seat must never quietly beat the paying customer.
const over = decideSponsoredEntitlement({
  planSlug: 'everyday',
  allowanceCredits: everyday.includedCredits + 1,
  activeSubscriptions: [],
})
check(
  'a sponsored allowance cannot exceed the commercial plan',
  !over.ok && over.reason === 'invalid_allowance',
)

for (const bad of [0, -5, 2.5]) {
  const decision = decideSponsoredEntitlement({
    planSlug: 'everyday', allowanceCredits: bad, activeSubscriptions: [],
  })
  check(`an allowance of ${bad} is refused`, !decision.ok && decision.reason === 'invalid_allowance')
}

// 3. Omitting the allowance still falls back to the full plan, so the ordinary
//    sponsored path is unchanged by the pilot's narrower one.
const fallback = decideSponsoredEntitlement({ planSlug: 'everyday', activeSubscriptions: [] })
check(
  'an unspecified allowance still means the whole plan',
  fallback.ok && fallback.allowanceCredits === everyday.includedCredits,
)

// 4. THE ONE THAT MATTERS. `ensureAllowance` runs on every balance read and
//    tops an account back up to `plan.includedCredits`. If it ever fires for a
//    sponsored workspace, a tester holding 10 credits silently becomes a tester
//    holding 120 — most likely at the month boundary, mid-pilot.
const sameMonth = allowanceAction({
  entitledPlan: 'everyday', accountPlan: 'everyday',
  accountPeriod: '2026-08', currentPeriod: '2026-08',
})
const nextMonth = allowanceAction({
  entitledPlan: 'everyday', accountPlan: 'everyday',
  accountPeriod: '2026-08', currentPeriod: '2026-09',
})
check('the pilot allowance is not refreshed inside the month', sameMonth === 'keep', `→ ${sameMonth}`)
check(
  'the pilot allowance is not refreshed at the month boundary',
  nextMonth === 'keep',
  `→ ${nextMonth}  (anything else restores the full ${everyday.includedCredits})`,
)

// 5. When the seat lapses the workspace must fall back to the free plan, not
//    keep a paid-tier allowance it is no longer entitled to.
const lapsed = allowanceAction({
  entitledPlan: 'explorer', accountPlan: 'everyday',
  accountPeriod: '2026-08', currentPeriod: '2026-09',
})
check('an expired seat falls back to the free allowance', lapsed === 'refresh_free', `→ ${lapsed}`)

// 6. What the allowance is worth against the programme budget.
const perTester = usdBudgetForCredits(PILOT_INITIAL_CREDITS)
const withReward = usdBudgetForCredits(PILOT_INITIAL_CREDITS + PILOT_FEEDBACK_REWARD_CREDITS)
console.log('')
console.log('BUDGET REACH')
console.log(`  one tester        $${perTester.toFixed(4)}  (${PILOT_INITIAL_CREDITS} credits)`)
console.log(`  with follow-up    $${withReward.toFixed(4)}  (${PILOT_INITIAL_CREDITS + PILOT_FEEDBACK_REWARD_CREDITS} credits)`)
console.log(`  $${PILOT_TOTAL_BUDGET_USD} covers        ${Math.floor(PILOT_TOTAL_BUDGET_USD / perTester)} testers at the initial grant`)
console.log(`                    ${Math.floor(PILOT_TOTAL_BUDGET_USD / withReward)} testers if every one earns the follow-up`)
console.log(`  63 invited        $${(63 * withReward).toFixed(2)} worst case, all fully spent`)

const failed = checks.filter((entry) => !entry.ok)
console.log('')
console.log(`${checks.length - failed.length}/${checks.length} checks passed`)
// Set rather than `process.exit`: the alias loader runs as a module-hook worker,
// and tearing that down abruptly trips a libuv assertion on Windows that turns a
// passing run into a non-zero exit.
process.exitCode = failed.length ? 1 : 0
