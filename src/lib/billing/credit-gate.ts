import type { Requester } from '@/lib/guardrails'
import {
  estimateCredits,
  usdBudgetForCredits,
  type CreditEstimate,
  type CreditFeature,
} from '@/lib/billing/credits'
import { reserveCredits, settleReservation } from '@/lib/billing/credit-repository'
import { checkSpendCaps, spendCapResponse } from '@/lib/billing/spend-caps'
import { errorDetails, logEvent } from '@/lib/observability'

/**
 * The seam between a route and the credit engine.
 *
 * A route opens a gate before doing paid work and settles it afterward. The
 * Anonymous demo traffic remains a no-op. Once a request has an authenticated
 * workspace, however, the ledger is mandatory: paid provider work must never
 * fail open because the billing database is missing or a request is replayed.
 */

export type CreditGate = {
  enforced: boolean
  reserved: number
  estimate: CreditEstimate | null
  /**
   * Set when a hold exists. Work that finishes in a later request, such as
   * video generation, must carry this forward so it can be settled then.
   */
  reservationId: string | null
  /** Charges measured cost and returns the unused hold. Safe to call once. */
  settle(outcome: 'success' | 'failure', measuredUsd?: number | null): Promise<void>
}

const OPEN_GATE: CreditGate = {
  enforced: false,
  reserved: 0,
  estimate: null,
  reservationId: null,
  async settle() {},
}

export type CreditGateResult =
  | { denied: Response; gate?: undefined }
  | { denied?: undefined; gate: CreditGate }

export function creditGateFailureResponse(
  failure: Exclude<Awaited<ReturnType<typeof reserveCredits>>, { ok: true }>,
) {
  if (failure.reason === 'insufficient_credits') {
    return Response.json({
      error: 'You do not have enough credits for this task.',
      status: 'insufficient_credits',
      required: failure.required,
      available: failure.balance.available,
    }, { status: 402, headers: { 'Cache-Control': 'no-store' } })
  }
  if (failure.reason === 'already_reserved') {
    return Response.json({
      error: 'This request is already being processed. Check the existing result before trying again.',
      status: 'duplicate_request',
    }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
  }
  return Response.json({
    error: 'Credit verification is temporarily unavailable. No work was started and no credits were used.',
    status: 'credit_service_unavailable',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * A retried request should reuse its hold rather than reserve twice. Clients
 * that can retry safely send `Idempotency-Key`; without one the request ID is
 * used, which still prevents double settlement within a single attempt.
 */
function rawIdempotencyKey(request: Request, requestId: string, feature: CreditFeature) {
  const supplied = request.headers.get('idempotency-key')?.trim()
  return `${feature}:${supplied && supplied.length <= 120 ? supplied : requestId}`
}

export async function openCreditGate(input: {
  request: Request
  requester: Requester
  feature: CreditFeature
  requestId: string
  /** A real provider price, when one is known before the work runs. */
  quotedUsd?: number
}): Promise<CreditGateResult> {
  const context = input.requester.context
  if (!context) return { gate: OPEN_GATE }

  const estimate = estimateCredits(input.feature, { quotedUsd: input.quotedUsd })

  // Checked before the reservation, so refused work never takes a hold it then
  // has to give back. A real provider quote is the honest projection when one
  // exists; otherwise the credit ceiling converted back to dollars is the most
  // this request can cost.
  const projectedUsd = input.quotedUsd ?? usdBudgetForCredits(estimate.ceiling)
  const spend = await checkSpendCaps({
    workspaceKey: context.workspace.key,
    userId: context.userId,
    projectedUsd,
    requestId: input.requestId,
    feature: input.feature,
  })
  if (!spend.allowed) return { denied: spendCapResponse(spend.decision) }

  const legacyKey = rawIdempotencyKey(input.request, input.requestId, input.feature)
  const reservation = await reserveCredits({
    context,
    estimate,
    requestId: input.requestId,
    idempotencyKey: legacyKey,
    legacyIdempotencyKey: legacyKey,
  })

  if (!reservation.ok) {
    return { denied: creditGateFailureResponse(reservation) }
  }

  let settled = false
  return {
    gate: {
      enforced: true,
      reserved: reservation.reserved,
      estimate,
      reservationId: reservation.reservationId,
      async settle(outcome, measuredUsd) {
        if (settled) return
        settled = true
        await settleReservation({
          context,
          reservationId: reservation.reservationId,
          estimate,
          measuredUsd,
          outcome,
        }).catch((error) => {
          // A settlement failure must never break the user's response. The
          // reservation expires and is reclaimed by the sweeper instead.
          logEvent('error', 'credit.settle_failed', {
            requestId: input.requestId.slice(0, 64),
            feature: input.feature,
            reservationId: reservation.reservationId,
            ...errorDetails(error),
          })
        })
      },
    },
  }
}
