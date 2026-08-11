import { after } from 'next/server'
import { getOptionalAuthContext } from '@/lib/auth'
import { errorDetails, requestLogger } from '@/lib/observability'
import { createExpressPayProvider, isExpressPayOrderId } from '@/lib/payments/expresspay'
import { applyVerifiedPayment, claimPaymentReconciliation, readPaymentAttempt } from '@/lib/payments/payment-repository'
import { sendPaymentReceipt } from '@/lib/payments/receipts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: RouteContext<'/api/billing/payments/[orderId]'>) {
  const log = requestLogger(request, '/api/billing/payments/[orderId]')
  const identity = await getOptionalAuthContext()
  if (!identity) {
    log.finish(401, { outcome: 'auth_required' })
    return Response.json({ error: 'Sign in to view this payment.' }, { status: 401, headers: log.headers() })
  }
  const { orderId } = await context.params
  if (!isExpressPayOrderId(orderId)) {
    log.finish(400, { outcome: 'invalid_order' })
    return Response.json({ error: 'This payment reference is invalid.' }, { status: 400, headers: log.headers() })
  }
  let attempt = await readPaymentAttempt(identity, orderId)
  if (!attempt) {
    log.finish(404, { outcome: 'payment_not_found' })
    return Response.json({ error: 'This payment could not be found.' }, { status: 404, headers: log.headers() })
  }
  if (attempt.status === 'pending' && attempt.providerReference) {
    const claim = await claimPaymentReconciliation(identity, orderId)
    if (claim?.providerReference) {
      try {
        const verified = await createExpressPayProvider().queryPayment(claim.providerReference)
        if (verified.orderId !== orderId) throw new Error('PAYMENT_STATUS_ORDER_MISMATCH')
        const applied = await applyVerifiedPayment(verified)
        if (applied.activated) after(() => sendPaymentReceipt(orderId))
        attempt = await readPaymentAttempt(identity, orderId) ?? attempt
      } catch (error) {
        log.error('billing.status_reconciliation_failed', errorDetails(error))
      }
    }
  }
  log.finish(200, { outcome: 'payment_read', paymentStatus: attempt.status, orderId })
  return Response.json({
    orderId: attempt.id,
    plan: attempt.planSlug,
    amountGhs: attempt.amountMinor / 100,
    currency: attempt.currency,
    status: attempt.status,
    message: attempt.providerStatusText,
    activated: Boolean(attempt.activatedAt),
    createdAt: attempt.createdAt,
  }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
}
