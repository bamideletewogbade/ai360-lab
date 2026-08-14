import { NextResponse, after } from 'next/server'
import { errorDetails, requestLogger } from '@/lib/observability'
import { rateLimit } from '@/lib/guardrails'
import { createExpressPayProvider, isExpressPayOrderId, isExpressPayToken } from '@/lib/payments/expresspay'
import { applyVerifiedPayment, isKnownPaymentReference } from '@/lib/payments/payment-repository'
import { sendPaymentReceipt } from '@/lib/payments/receipts'
import { paymentStatusUrl } from '@/lib/payments/status-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function statusUrl(request: Request, orderId: string, check?: string) {
  // Never resolve the redirect from `request.url` alone: behind a proxy it is
  // the listen address (0.0.0.0:3000), not the origin the browser can reach.
  return paymentStatusUrl({
    forwardedHost: request.headers.get('x-forwarded-host'),
    host: request.headers.get('host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
    configuredAppUrl: process.env.NEXT_PUBLIC_APP_URL,
    requestUrl: request.url,
    orderId,
    check,
  })
}

export async function GET(request: Request) {
  const log = requestLogger(request, '/api/billing/expresspay/return')
  const limited = rateLimit(request, 'payment_callback', { minute: 30, daily: 500 })
  if (limited) return limited
  const params = new URL(request.url).searchParams
  const orderId = params.get('order-id') || ''
  const token = params.get('token') || ''
  if (!isExpressPayOrderId(orderId) || !isExpressPayToken(token)) {
    log.finish(400, { outcome: 'invalid_return' })
    return NextResponse.redirect(statusUrl(request, '', 'invalid'))
  }

  try {
    if (!await isKnownPaymentReference(orderId, token)) {
      log.finish(303, { outcome: 'unknown_return', orderId })
      return NextResponse.redirect(statusUrl(request, '', 'invalid'), 303)
    }
    const verified = await createExpressPayProvider().queryPayment(token)
    if (verified.orderId !== orderId) throw new Error('PAYMENT_RETURN_ORDER_MISMATCH')
    const result = await applyVerifiedPayment(verified)
    if (result.activated) after(() => sendPaymentReceipt(orderId))
    log.finish(303, { outcome: 'return_verified', orderId, paymentStatus: result.status })
    return NextResponse.redirect(statusUrl(request, orderId), 303)
  } catch (error) {
    log.error('billing.return_failed', errorDetails(error))
    log.finish(303, { outcome: 'return_check_failed', orderId })
    return NextResponse.redirect(statusUrl(request, orderId, 'retry'), 303)
  }
}
