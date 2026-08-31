import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  isVideoTerminalStatus, videoFailureCode, videoFailureMessage,
} from '../src/lib/media/video-completion.ts'

const worker = readFileSync(new URL('../src/app/api/internal/media/reconcile-video/route.ts', import.meta.url), 'utf8')
const webhook = readFileSync(new URL('../src/app/api/webhooks/openrouter/video/route.ts', import.meta.url), 'utf8')
const completion = readFileSync(new URL('../src/lib/media/video-completion.ts', import.meta.url), 'utf8')
const repository = readFileSync(new URL('../src/lib/media/job-repository.ts', import.meta.url), 'utf8')

/**
 * A refusal and an outage need different words because they need different
 * actions. Telling someone their filtered prompt was a provider fault sends
 * them to press a button that cannot work, however many times they press it.
 */
test('a filtered render is told apart from a technical failure', () => {
  for (const message of [
    'Content was filtered by the safety system',
    'Request blocked by moderation',
    'This violates the content policy',
  ]) {
    assert.equal(videoFailureCode(message), 'provider_filtered')
    assert.match(videoFailureMessage(message), /No credits were charged/)
    assert.match(videoFailureMessage(message), /Try describing the same creative idea/)
  }

  assert.equal(videoFailureCode('upstream returned 503'), 'provider_failed')
  // A technical failure keeps the provider's own words rather than replacing
  // them with safety advice that does not apply.
  assert.equal(videoFailureMessage('upstream returned 503'), 'upstream returned 503')
  assert.equal(videoFailureMessage(''), 'The video provider could not complete this render.')
})

test('only genuinely terminal provider states end a render', () => {
  for (const status of ['completed', 'failed', 'cancelled', 'expired']) {
    assert.equal(isVideoTerminalStatus(status), true)
  }
  for (const status of ['running', 'queued', 'pending', '', null, undefined, 7]) {
    assert.equal(isVideoTerminalStatus(status), false)
  }
})

/**
 * Three doors, one room. The browser poll, the webhook and the sweep all end a
 * render, and when each carried its own copy of "store it, mark it, settle it"
 * the copies drifted — the webhook told a filtered customer something the route
 * did not, and only the route knew a refusal is not a fault.
 */
test('delivery and settlement live in one module, not in each route', () => {
  for (const route of [worker, webhook]) {
    assert.match(route, /finalizeVideoJob/)
    assert.doesNotMatch(route, /persistGeneratedMedia/)
    assert.doesNotMatch(route, /videos\/\$\{encodeURIComponent\([^)]*\)\}\/content/)
  }
  assert.doesNotMatch(webhook, /includes\("filtered"\)/)
  assert.match(completion, /persistGeneratedMedia/)
})

test('an output is never stored twice and a hold is never settled twice', () => {
  // Both doors can legitimately reach the same job at the same moment.
  assert.match(completion, /if \(!job\.outputAssetId\)/)

  // Measured inside the function, not the file: the import block lists these
  // names in its own order and would happily "prove" any sequence at all.
  const body = completion.slice(completion.indexOf('export async function finalizeVideoJob'))
  // Bytes reach storage before the job is marked complete, so a finished job
  // is never handed to someone who cannot open it, and the hold is settled
  // only once both have happened.
  const order = ['persistGeneratedMedia', 'updateMediaJobResult', 'settleReservation']
    .map((name) => body.indexOf(name))
  assert.ok(order.every((position) => position > 0), 'every step must appear in the function')
  assert.deepEqual(
    [...order].sort((left, right) => left - right),
    order,
    'store the media, then mark the job, then settle the hold',
  )
})

test('the sweep is authorised by a constant-time bearer check and fails closed', () => {
  assert.match(worker, /timingSafeEqual/)
  assert.match(worker, /AI360_MEDIA_RECONCILE_SECRET \|\| process\.env\.CRON_SECRET/)
  // An absent secret must not mean an open endpoint.
  assert.match(worker, /if \(!configured \|\| configured\.length !== supplied\.length\) return false/)
  assert.match(worker, /log\.finish\(401, \{ outcome: "unauthorized" \}\)/)
})

/**
 * The failure that costs money is not a stale row, it is a customer's credits
 * held for a render they never received. Every terminal path the sweep can
 * reach has to release the hold.
 */
test('every way a render can end without a video returns the credits', () => {
  for (const code of ['provider_job_lost', 'provider_abandoned']) {
    assert.match(worker, new RegExp(`errorCode: "${code}"`))
  }
  const settlements = worker.match(/outcome: "failure"/g) || []
  assert.equal(settlements.length, 2, 'both the lost and abandoned paths must settle as a failure')
  assert.match(worker, /measuredUsd: null/)
})

test('the sweep leaves running renders alone until they are genuinely lost', () => {
  // A job the browser is still polling must not be raced to the delivery.
  assert.match(worker, /const STALE_SECONDS = 180/)
  assert.match(worker, /ABANDON_AFTER_MS = 6 \* 60 \* 60 \* 1_000/)
  assert.match(worker, /if \(ageMs > ABANDON_AFTER_MS\)/)
  // A provider that is briefly unreadable is retried, not buried: the claim is
  // released with an error so the next sweep can pick the job up again.
  assert.match(worker, /finishMediaWebhookEvent\(\s*`reconcile:\$\{providerJobId\}`,\s*"Still running",?\s*\)/)
})

test('the stale query is bounded, oldest first, and only touches submitted work', () => {
  assert.match(repository, /listStaleVideoJobsForReconciliation/)
  assert.match(repository, /job\.provider_job_id is not null/)
  assert.match(repository, /job\.status in \('queued', 'submitted', 'running'\)/)
  assert.match(repository, /order by job\.updated_at asc limit \$2/)
  // Oldest first matters: the longest-held credits are always in the batch,
  // whatever the limit.
  assert.match(repository, /Math\.min\(200, Math\.max\(1, Math\.floor\(input\.limit\)\)\)/)
  assert.match(repository, /Math\.min\(86_400, Math\.max\(60, Math\.floor\(input\.staleSeconds\)\)\)/)
})

test('the sweep is scoped to each job own workspace, never a caller supplied one', () => {
  assert.match(repository, /function contextForRow/)
  assert.match(repository, /key: row\.workspace_key/)
  // The trusted lookups take no context argument, so there is nothing for a
  // caller to widen.
  assert.match(repository, /export async function listStaleVideoJobsForReconciliation\(input: \{\s*staleSeconds: number;\s*limit: number;\s*\}\)/)
})

test('a completed render records which door delivered it', () => {
  assert.match(completion, /deliveredBy: "openrouter_webhook" \| "reconciliation_worker"/)
  assert.match(worker, /deliveredBy: "reconciliation_worker"/)
  assert.match(webhook, /deliveredBy: "openrouter_webhook"/)
})
