import { rateLimit, rejectLargeRequest } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'
import { createExpressPayProvider, isExpressPayOrderId, isExpressPayToken } from '@/lib/payments/expresspay'
import { applyVerifiedPayment, recordPaymentNotification } from '@/lib/payments/payment-repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/billing/expresspay/notify')
  try {
    const tooLarge = rejectLargeRequest(request, 8_000)
    if (tooLarge) return tooLarge
    const limited = rateLimit(request, 'payment_callback', { minute: 60, daily: 2_000 })
    if (limited) return limited
    const form = await request.formData()
    const orderId = String(form.get('order-id') || '')
    const token = String(form.get('token') || '')
    if (!isExpressPayOrderId(orderId) || !isExpressPayToken(token)) {
      log.finish(400, { outcome: 'invalid_notification' })
      return Response.json({ error: 'Invalid payment notification.' }, { status: 400, headers: log.headers() })
    }

    const notification = await recordPaymentNotification({ orderId, providerReference: token })
    const verified = await createExpressPayProvider().queryPayment(token)
    if (verified.orderId !== orderId) throw new Error('PAYMENT_NOTIFICATION_ORDER_MISMATCH')
    const result = await applyVerifiedPayment(verified)
    log.finish(200, { outcome: 'notification_verified', orderId, paymentStatus: result.status, duplicate: notification.duplicate })
    return Response.json({ received: true }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('billing.notification_failed', errorDetails(error))
    log.finish(503, { outcome: 'notification_failed' })
    return Response.json({ received: false }, { status: 503, headers: log.headers({ 'Cache-Control': 'no-store' }) })
  }
}
