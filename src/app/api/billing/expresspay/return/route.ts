import { NextResponse } from 'next/server'
import { errorDetails, requestLogger } from '@/lib/observability'
import { createExpressPayProvider, isExpressPayOrderId, isExpressPayToken } from '@/lib/payments/expresspay'
import { applyVerifiedPayment } from '@/lib/payments/payment-repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function statusUrl(request: Request, orderId: string, check?: string) {
  const url = new URL('/payment/status', request.url)
  if (orderId) url.searchParams.set('order', orderId)
  if (check) url.searchParams.set('check', check)
  return url
}

export async function GET(request: Request) {
  const log = requestLogger(request, '/api/billing/expresspay/return')
  const params = new URL(request.url).searchParams
  const orderId = params.get('order-id') || ''
  const token = params.get('token') || ''
  if (!isExpressPayOrderId(orderId) || !isExpressPayToken(token)) {
    log.finish(400, { outcome: 'invalid_return' })
    return NextResponse.redirect(statusUrl(request, '', 'invalid'))
  }

  try {
    const verified = await createExpressPayProvider().queryPayment(token)
    if (verified.orderId !== orderId) throw new Error('PAYMENT_RETURN_ORDER_MISMATCH')
    const result = await applyVerifiedPayment(verified)
    log.finish(303, { outcome: 'return_verified', orderId, paymentStatus: result.status })
    return NextResponse.redirect(statusUrl(request, orderId), 303)
  } catch (error) {
    log.error('billing.return_failed', errorDetails(error))
    log.finish(303, { outcome: 'return_check_failed', orderId })
    return NextResponse.redirect(statusUrl(request, orderId, 'retry'), 303)
  }
}
