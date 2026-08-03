import { checkoutRequestSchema } from '@/lib/billing/checkout-contract'
import { findBillingPlan, planPrice } from '@/lib/billing/catalog'
import { getOptionalAuthContext } from '@/lib/auth'
import { isDatabaseConfigured } from '@/lib/mysql'
import { errorDetails, requestLogger } from '@/lib/observability'
import { isPaymentProviderConfigured } from '@/lib/payments/contracts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/billing/checkout')
  try {
    const context = await getOptionalAuthContext()
    if (!context) {
      log.finish(401, { outcome: 'auth_required' })
      return Response.json({ error: 'Sign in before choosing a paid plan.' }, { status: 401, headers: log.headers() })
    }

    const parsed = checkoutRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      log.finish(400, { outcome: 'invalid_checkout_request' })
      return Response.json({ error: 'Choose a valid plan and payment method.' }, { status: 400, headers: log.headers() })
    }

    const plan = findBillingPlan(parsed.data.plan)
    if (!plan || plan.monthlyPriceGhs === 0) {
      log.finish(400, { outcome: 'paid_plan_required' })
      return Response.json({ error: 'This plan does not require checkout.' }, { status: 400, headers: log.headers() })
    }

    if (!isDatabaseConfigured() || !isPaymentProviderConfigured()) {
      log.finish(503, {
        outcome: 'billing_not_activated',
        databaseConfigured: isDatabaseConfigured(),
        paymentProviderConfigured: isPaymentProviderConfigured(),
        plan: plan.slug,
      })
      return Response.json({
        error: 'Payments are not open yet.',
        status: 'pilot_waitlist',
        plan: plan.slug,
        amountGhs: planPrice(plan, parsed.data.cadence),
      }, { status: 503, headers: log.headers({ 'Cache-Control': 'no-store' }) })
    }

    // MojoPay's authenticated endpoint, signature format, recurring MoMo contract
    // and webhook event schema must be confirmed before this boundary is activated.
    log.finish(501, { outcome: 'provider_adapter_pending_verified_contract', plan: plan.slug })
    return Response.json({
      error: 'The verified MojoPay checkout adapter is awaiting merchant activation.',
      status: 'provider_adapter_pending',
    }, { status: 501, headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('billing.checkout_failed', errorDetails(error))
    log.finish(500, { outcome: 'checkout_failed' })
    return Response.json({ error: 'Checkout could not be prepared.' }, { status: 500, headers: log.headers() })
  }
}
