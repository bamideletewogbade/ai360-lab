import { config } from 'dotenv'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

register('./alias-loader.mjs', pathToFileURL('./scripts/'))

const { createWorkspaceAuthContext } = await import('../src/lib/workspace.ts')
const { currentBillingPeriod, estimateCredits } = await import('../src/lib/billing/credits.ts')
const { grantCredits, readBalance, reserveCredits, settleReservation } = await import('../src/lib/billing/credit-repository.ts')
const { getPostgres } = await import('../src/lib/postgres.ts')

/**
 * End-to-end check of the credit loop against the configured database.
 *
 * Uses a disposable workspace and removes it afterward, so it is safe to run
 * against a live environment.
 */

const stamp = process.env.CREDITS_VERIFY_ID || `verify${Date.now()}`
const context = createWorkspaceAuthContext({ userId: `user_${stamp}` })
const currentPeriod = currentBillingPeriod()
const sql = getPostgres()

const results = []
const check = (name, passed, detail = '') => {
  results.push({ name, passed, detail })
  console.log(`${passed ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

try {
  // A brand new workspace should receive the free tier automatically.
  const first = await readBalance(context)
  check('a new workspace receives the free allowance without a scheduled job',
    first?.available === 5 && first?.allowance === 5 && first?.plan === 'explorer',
    JSON.stringify(first))

  const secondVisit = await readBalance(context)
  check('revisiting in the same month does not grant twice',
    secondVisit?.available === 5 && secondVisit?.allowance === 5,
    JSON.stringify(secondVisit))

  const tooBig = await reserveCredits({
    context, estimate: estimateCredits('video'), requestId: `${stamp}_a`, idempotencyKey: `${stamp}:a`,
  })
  check('the free allowance cannot cover a video', tooBig.ok === false && tooBig.reason === 'insufficient_credits', tooBig.reason)

  await grantCredits({ context, credits: 115, sourceType: 'top_up', sourceId: 'topup-100', idempotencyKey: `${stamp}:grant` })
  const granted = await readBalance(context)
  check('a top-up adds to the balance', granted?.available === 120, JSON.stringify(granted))

  const repeat = await grantCredits({ context, credits: 115, sourceType: 'top_up', sourceId: 'topup-100', idempotencyKey: `${stamp}:grant` })
  const afterRepeat = await readBalance(context)
  check('a repeated grant does not double credit', repeat.granted === false && afterRepeat?.available === 120, JSON.stringify(afterRepeat))

  const estimate = estimateCredits('image')
  const held = await reserveCredits({ context, estimate, requestId: `${stamp}_b`, idempotencyKey: `${stamp}:b` })
  const heldBalance = await readBalance(context)
  check('reserving moves credits from available to held',
    held.ok && heldBalance?.available === 120 - estimate.reserve && heldBalance?.reserved === estimate.reserve,
    JSON.stringify(heldBalance))

  check('spending draws the expiring allowance before purchased credits',
    heldBalance?.allowance === Math.max(0, 5 - estimate.reserve),
    `allowance ${heldBalance?.allowance} after reserving ${estimate.reserve}`)

  const retry = await reserveCredits({ context, estimate, requestId: `${stamp}_b2`, idempotencyKey: `${stamp}:b` })
  check('a retry reuses its hold instead of reserving twice', retry.ok === false && retry.reason === 'already_reserved', retry.reason)

  // A cheap success should charge the floor and return the rest.
  const settled = await settleReservation({
    context, reservationId: held.reservationId, estimate, measuredUsd: 0.001, outcome: 'success',
  })
  const afterSettle = await readBalance(context)
  check('a cheap success charges the floor and releases the rest',
    settled.ok && settled.charged === 3 && settled.released === estimate.reserve - 3 && afterSettle?.reserved === 0,
    settled.ok ? `charged ${settled.charged}, released ${settled.released}` : settled.reason)

  const doubleSettle = await settleReservation({
    context, reservationId: held.reservationId, estimate, measuredUsd: 0.001, outcome: 'success',
  })
  check('a settled reservation cannot be settled again', doubleSettle.ok === false && doubleSettle.reason === 'not_held', doubleSettle.reason)

  // Failure must return the entire hold.
  const beforeFailure = await readBalance(context)
  const failing = await reserveCredits({ context, estimate, requestId: `${stamp}_c`, idempotencyKey: `${stamp}:c` })
  const refunded = await settleReservation({
    context, reservationId: failing.reservationId, estimate, measuredUsd: 0.05, outcome: 'failure',
  })
  const afterFailure = await readBalance(context)
  check('failed work charges nothing and returns the hold',
    refunded.ok && refunded.charged === 0 && afterFailure?.available === beforeFailure?.available,
    JSON.stringify(afterFailure))

  // Expensive work must not exceed what was reserved.
  const capped = await reserveCredits({
    context, estimate, requestId: `${stamp}_d`, idempotencyKey: `${stamp}:d`,
  })
  const overrun = await settleReservation({
    context, reservationId: capped.reservationId, estimate, measuredUsd: 999, outcome: 'success',
  })
  check('a task cannot charge more than it reserved',
    overrun.ok && overrun.charged === estimate.reserve && overrun.released === 0,
    overrun.ok ? `charged ${overrun.charged} of ${estimate.reserve}` : overrun.reason)

  // A month boundary, on a workspace that has not yet seen this period. Unused
  // allowance must expire; purchased credits must survive.
  const rollover = createWorkspaceAuthContext({ userId: `user_${stamp}roll` })
  await readBalance(rollover)
  await grantCredits({
    context: rollover, credits: 40, sourceType: 'top_up', sourceId: 'topup-50',
    idempotencyKey: `${stamp}:rolltop`,
  })
  // Backdate the period and its ledger key so the next read looks like a new month.
  await sql`
    update public.lab_credit_accounts set allowance_period = '2000-01'
     where workspace_key = ${rollover.workspace.key}`
  await sql`
    update public.lab_credit_ledger
       set idempotency_key = ${'allowance:' + rollover.workspace.key + ':2000-01'}
     where workspace_key = ${rollover.workspace.key} and source_type = 'plan_allowance'`

  const rolled = await readBalance(rollover)
  check('a new month expires unused allowance and grants a fresh one',
    rolled?.allowance === 5 && rolled?.period === currentPeriod,
    `allowance ${rolled?.allowance}, period ${rolled?.period}`)
  check('purchased credits survive the monthly reset',
    rolled?.available === 45,
    `expected 45 (40 purchased + 5 fresh), got ${rolled?.available}`)

  const rollLedger = await sql`
    select credits_delta from public.lab_credit_ledger
     where workspace_key = ${rollover.workspace.key}`
  const rollNet = rollLedger.reduce((sum, row) => sum + Number(row.credits_delta), 0)
  check('the rollover ledger reconciles', rollNet === rolled?.available, `ledger ${rollNet}, balance ${rolled?.available}`)

  const ledger = await sql`
    select entry_type, credits_delta from public.lab_credit_ledger
     where workspace_key = ${context.workspace.key} order by id`
  const net = ledger.reduce((sum, row) => sum + Number(row.credits_delta), 0)
  const final = await readBalance(context)
  check('the ledger reconciles to the balance', net === final?.available, `ledger net ${net}, balance ${final?.available}`)
  console.log(`\nledger entries: ${ledger.map((row) => `${row.entry_type}:${row.credits_delta}`).join(' ')}`)
} finally {
  for (const scope of [context, createWorkspaceAuthContext({ userId: `user_${stamp}roll` })]) {
    await sql`delete from public.lab_credit_ledger where workspace_key = ${scope.workspace.key}`
    await sql`delete from public.lab_credit_reservations where workspace_key = ${scope.workspace.key}`
    await sql`delete from public.lab_credit_accounts where workspace_key = ${scope.workspace.key}`
    await sql`delete from public.lab_workspaces where workspace_key = ${scope.workspace.key}`
    await sql`delete from public.lab_users where clerk_user_id = ${scope.userId}`
  }
  await sql.end()
}

const failed = results.filter((result) => !result.passed)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) process.exitCode = 1
