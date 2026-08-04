import type { Requester } from '@/lib/guardrails'
import { estimateCredits, type CreditEstimate, type CreditFeature } from '@/lib/billing/credits'
import { reserveCredits, settleReservation } from '@/lib/billing/credit-repository'

/**
 * The seam between a route and the credit engine.
 *
 * A route opens a gate before doing paid work and settles it afterward. The
 * gate is deliberately forgiving about being switched off: when no durable
 * database is configured, or the caller is anonymous, it becomes a no-op so
 * the Lab still runs and demos exactly as it does today. Enforcement turns on
 * by configuration, not by a code change.
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

/**
 * A retried request should reuse its hold rather than reserve twice. Clients
 * that can retry safely send `Idempotency-Key`; without one the request ID is
 * used, which still prevents double settlement within a single attempt.
 */
function idempotencyKey(request: Request, requestId: string, feature: CreditFeature) {
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
  const reservation = await reserveCredits({
    context,
    estimate,
    requestId: input.requestId,
    idempotencyKey: idempotencyKey(input.request, input.requestId, input.feature),
  })

  if (!reservation.ok) {
    if (reservation.reason === 'insufficient_credits') {
      return {
        denied: Response.json({
          error: 'You do not have enough credits for this task.',
          status: 'insufficient_credits',
          required: reservation.required,
          available: reservation.balance.available,
        }, { status: 402, headers: { 'Cache-Control': 'no-store' } }),
      }
    }
    // A missing database or an already-settled retry must not block real work.
    return { gate: OPEN_GATE }
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
          console.error(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'error',
            service: 'ai360-lab',
            event: 'credit.settle_failed',
            requestId: input.requestId.slice(0, 64),
            feature: input.feature,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          }))
        })
      },
    },
  }
}
