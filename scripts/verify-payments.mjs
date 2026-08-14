#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { config } from 'dotenv'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })
register('./alias-loader.mjs', pathToFileURL('./scripts/'))

const { findBillingPlan } = await import('../src/lib/billing/catalog.ts')
const { readBalance } = await import('../src/lib/billing/credit-repository.ts')
const {
  applyVerifiedPayment,
  createPaymentAttempt,
  isKnownPaymentReference,
  markPaymentInitiating,
  markPaymentReady,
  readWorkspaceSubscription,
  recordPaymentNotification,
} = await import('../src/lib/payments/payment-repository.ts')
const { getPostgres } = await import('../src/lib/postgres.ts')
const { createWorkspaceAuthContext } = await import('../src/lib/workspace.ts')

const stamp = `payment${Date.now()}`
const context = createWorkspaceAuthContext({ userId: `user_${stamp}` })
const plan = findBillingPlan('everyday')
assert.ok(plan && plan.monthlyPriceGhs > 0)
const sql = getPostgres()
const createdOrderIds = []
const notificationIds = []

const check = (name, passed, detail = '') => {
  console.log(`${passed ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  assert.ok(passed, name)
}

try {
  const first = await createPaymentAttempt({
    context,
    plan,
    paymentMethod: 'mobile_money',
    idempotencyKey: `${stamp}_checkout`,
  })
  createdOrderIds.push(first.attempt.id)
  check('a checkout attempt is created once', !first.reused)

  const replay = await createPaymentAttempt({
    context,
    plan,
    paymentMethod: 'mobile_money',
    idempotencyKey: `${stamp}_checkout`,
  })
  check('an idempotent checkout retry reuses its attempt', replay.reused && replay.attempt.id === first.attempt.id)

  const initiating = await markPaymentInitiating(first.attempt.id, context.workspace.key)
  check('one worker claims checkout initialization', initiating?.status === 'initiating')
  const token = `sandbox.${stamp}`
  const ready = await markPaymentReady({
    id: first.attempt.id,
    workspaceKey: context.workspace.key,
    providerReference: token,
    checkoutUrl: `https://sandbox.expresspaygh.com/payment?token=${token}`,
  })
  check('the provider token moves checkout to pending', ready.status === 'pending')

  check('unknown callback references are rejected before a provider query',
    !await isKnownPaymentReference(first.attempt.id, 'sandbox.unknown'))
  const notification = await recordPaymentNotification({ orderId: first.attempt.id, providerReference: token })
  notificationIds.push(createHash('sha256').update(`expresspay:${first.attempt.id}:${token}`).digest('hex'))
  check('a callback is admitted only for the stored order and token', notification.accepted && !notification.duplicate)
  const duplicateNotification = await recordPaymentNotification({ orderId: first.attempt.id, providerReference: token })
  check('a duplicate callback is recorded once', duplicateNotification.accepted && duplicateNotification.duplicate)

  const mismatch = await applyVerifiedPayment({
    provider: 'expresspay', providerReference: token, providerTransactionId: `txn_${stamp}_mismatch`,
    orderId: first.attempt.id, status: 'approved', statusText: 'Approved',
    amountMinor: plan.monthlyPriceGhs * 100 + 1, currency: 'GHS', processedAt: new Date().toISOString(),
  })
  check('a verified amount mismatch enters manual review without activation', mismatch.status === 'review' && !mismatch.activated)

  const approved = await applyVerifiedPayment({
    provider: 'expresspay', providerReference: token, providerTransactionId: `txn_${stamp}`,
    orderId: first.attempt.id, status: 'approved', statusText: 'Approved',
    amountMinor: plan.monthlyPriceGhs * 100, currency: 'GHS', processedAt: new Date().toISOString(),
  })
  check('a matching server-verified payment activates exactly once', approved.activated && approved.status === 'approved')

  const subscription = await readWorkspaceSubscription(context)
  check('activation creates the paid workspace subscription', subscription?.planSlug === plan.slug && subscription.status === 'active')
  const balance = await readBalance(context)
  check('activation grants the plan allowance', balance?.available === plan.includedCredits && balance.allowance === plan.includedCredits)

  // Paid pilot access is manually renewed. Crossing a calendar month may
  // refresh Explorer, but it must never manufacture a second paid allowance.
  await sql`
    update public.lab_credit_accounts set allowance_period = '2000-01'
     where workspace_key = ${context.workspace.key}`
  const afterCalendarBoundary = await readBalance(context)
  check('a calendar boundary cannot grant paid credits without another payment',
    afterCalendarBoundary?.available === plan.includedCredits && afterCalendarBoundary.allowance === plan.includedCredits)

  const duplicateApproval = await applyVerifiedPayment({
    provider: 'expresspay', providerReference: token, providerTransactionId: `txn_${stamp}`,
    orderId: first.attempt.id, status: 'approved', statusText: 'Approved',
    amountMinor: plan.monthlyPriceGhs * 100, currency: 'GHS', processedAt: new Date().toISOString(),
  })
  const afterDuplicate = await readBalance(context)
  check('a duplicate approval cannot grant credits twice', duplicateApproval.duplicate && afterDuplicate?.available === plan.includedCredits)

  const [{ count: paymentGrants }] = await sql`
    select count(*)::text as count from public.lab_credit_ledger
     where workspace_key = ${context.workspace.key} and source_type = 'subscription_payment'`
  check('the ledger contains one payment grant', Number(paymentGrants) === 1)

  await sql`
    update public.lab_subscriptions set current_period_end = now() - interval '1 second'
     where workspace_key = ${context.workspace.key}`
  const expired = await readBalance(context)
  check('expired prepaid access falls back to Explorer on the next credit touch',
    expired?.plan === 'explorer' && expired.available === 5 && expired.allowance === 5,
    JSON.stringify(expired))
} finally {
  for (const eventId of notificationIds) {
    await sql`delete from public.lab_billing_webhook_events where provider = 'expresspay' and event_id = ${eventId}`
  }
  await sql`delete from public.lab_credit_reservations where workspace_key = ${context.workspace.key}`
  await sql`delete from public.lab_credit_ledger where workspace_key = ${context.workspace.key}`
  await sql`delete from public.lab_subscriptions where workspace_key = ${context.workspace.key}`
  await sql`delete from public.lab_payment_attempts where workspace_key = ${context.workspace.key}`
  await sql`delete from public.lab_credit_accounts where workspace_key = ${context.workspace.key}`
  await sql`delete from public.lab_workspace_memberships where workspace_key = ${context.workspace.key}`
  await sql`delete from public.lab_workspaces where workspace_key = ${context.workspace.key}`
  await sql`delete from public.lab_users where clerk_user_id = ${context.userId}`
  await sql.end()
}
