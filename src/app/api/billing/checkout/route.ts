import { checkoutRequestSchema } from '@/lib/billing/checkout-contract'
import { findBillingPlan } from '@/lib/billing/catalog'
import { getOptionalAuthContext } from '@/lib/auth'
import { rateLimit, rejectLargeRequest, resolveRequester } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'
import { createExpressPayProvider, ExpressPayError } from '@/lib/payments/expresspay'
import {
  createPaymentAttempt,
  markPaymentFailed,
  markPaymentInitiating,
  markPaymentReady,
  readBillingProfile,
} from '@/lib/payments/payment-repository'
import { isPaymentProviderConfigured } from '@/lib/payments/contracts'
import { isPostgresConfigured } from '@/lib/postgres'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The origin ExpressPay will call back on.
 *
 * The provider fetches `redirect-url` and `post-url` from its own servers, so
 * they must be publicly reachable over HTTPS. A localhost origin cannot satisfy
 * that: it used to be allowed through here and then rejected a few lines later
 * by the provider adapter, which turned "you need a public URL" into a generic
 * checkout failure. It is refused here instead, with a reason that names the fix.
 * To exercise checkout locally, point `NEXT_PUBLIC_APP_URL` at an HTTPS tunnel.
 */
function applicationOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (!configured) throw new Error('AI360_APP_URL_NOT_CONFIGURED')

  let origin: URL
  try {
    origin = new URL(configured)
  } catch {
    throw new Error('AI360_APP_URL_INVALID: NEXT_PUBLIC_APP_URL must be an absolute URL')
  }

  if (origin.protocol !== 'https:') {
    throw new Error(
      'AI360_APP_URL_MUST_BE_PUBLIC_HTTPS: ExpressPay calls redirect-url and post-url '
      + 'from its own servers, so NEXT_PUBLIC_APP_URL must be a public HTTPS origin. '
      + 'Use the deployed origin or an HTTPS tunnel; localhost cannot receive callbacks.',
    )
  }
  return origin.origin
}

function checkoutError(error: unknown) {
  if (!(error instanceof ExpressPayError)) return { status: 500, copy: 'Checkout could not be prepared.' }
  if (error.code === 'invalid_credentials' || error.code === 'invalid_ip' || error.code === 'not_configured') {
    return { status: 503, copy: 'Payments are being configured. Please try again later.' }
  }
  if (error.code === 'invalid_request') {
    return { status: 502, copy: 'The payment provider could not accept this checkout.' }
  }
  return { status: 502, copy: 'The payment provider is temporarily unavailable.' }
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/billing/checkout')
  let attempt: { id: string; workspaceKey: string } | null = null
  try {
    const tooLarge = rejectLargeRequest(request, 8_000)
    if (tooLarge) return tooLarge
    const requester = await resolveRequester(request)
    const limited = rateLimit(request, 'billing_checkout', { minute: 5, daily: 30 }, requester)
    if (limited) return limited

    const context = await getOptionalAuthContext()
    if (!context) {
      log.finish(401, { outcome: 'auth_required' })
      return Response.json({ error: 'Sign in before choosing a paid plan.' }, { status: 401, headers: log.headers() })
    }

    const parsed = checkoutRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      log.finish(400, { outcome: 'invalid_checkout_request' })
      return Response.json({ error: parsed.error.issues[0]?.message || 'Check the payment details.' }, { status: 400, headers: log.headers() })
    }
    const idempotencyKey = request.headers.get('idempotency-key')?.trim()
    if (!idempotencyKey || !/^[A-Za-z0-9._-]{12,160}$/.test(idempotencyKey)) {
      log.finish(400, { outcome: 'missing_idempotency_key' })
      return Response.json({ error: 'Refresh the page and try again.' }, { status: 400, headers: log.headers() })
    }

    const plan = findBillingPlan(parsed.data.plan)
    if (!plan || plan.monthlyPriceGhs === 0 || plan.assisted) {
      log.finish(400, { outcome: 'paid_plan_required' })
      return Response.json({ error: 'Choose an available individual plan.' }, { status: 400, headers: log.headers() })
    }

    if (
      process.env.NEXT_PUBLIC_BILLING_ENABLED !== 'true' ||
      !isPostgresConfigured() ||
      !isPaymentProviderConfigured()
    ) {
      log.finish(503, {
        outcome: 'billing_not_activated',
        databaseConfigured: isPostgresConfigured(),
        paymentProviderConfigured: isPaymentProviderConfigured(),
        plan: plan.slug,
      })
      return Response.json({
        error: 'Payments are not open yet.',
        status: 'pilot_waitlist',
        plan: plan.slug,
        amountGhs: plan.monthlyPriceGhs,
      }, { status: 503, headers: log.headers({ 'Cache-Control': 'no-store' }) })
    }

    const profile = await readBillingProfile(context)
    if (!profile) {
      log.finish(409, { outcome: 'billing_profile_incomplete' })
      return Response.json({ error: 'Add a verified email to your account before paying.' }, { status: 409, headers: log.headers() })
    }

    const created = await createPaymentAttempt({
      context,
      plan,
      paymentMethod: parsed.data.paymentMethod,
      idempotencyKey,
    })
    attempt = { id: created.attempt.id, workspaceKey: created.attempt.workspaceKey }
    if (created.reused) {
      if (created.attempt.checkoutUrl && created.attempt.status === 'pending') {
        log.finish(200, { outcome: 'checkout_reused', orderId: created.attempt.id })
        return Response.json({
          orderId: created.attempt.id,
          checkoutUrl: created.attempt.checkoutUrl,
          reused: true,
        }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
      }
      log.finish(409, { outcome: 'checkout_already_processing', orderId: created.attempt.id })
      return Response.json({ error: 'This payment is already being prepared. Refresh its status before trying again.' }, { status: 409, headers: log.headers() })
    }

    const claimed = await markPaymentInitiating(created.attempt.id, context.workspace.key)
    if (!claimed) {
      log.finish(409, { outcome: 'checkout_claim_failed', orderId: created.attempt.id })
      return Response.json({ error: 'This payment is already being prepared.' }, { status: 409, headers: log.headers() })
    }

    const origin = applicationOrigin()
    const provider = createExpressPayProvider()
    const session = await provider.createCheckout({
      idempotencyKey: created.attempt.id,
      workspaceKey: context.workspace.key,
      ownerId: context.userId,
      planSlug: plan.slug,
      amountMinor: plan.monthlyPriceGhs * 100,
      currency: 'GHS',
      cadence: 'monthly',
      preferredMethod: parsed.data.paymentMethod,
      customer: profile,
      returnUrl: `${origin}/api/billing/expresspay/return`,
      webhookUrl: `${origin}/api/billing/expresspay/notify`,
      metadata: { catalogVersion: 'current' },
    })
    const ready = await markPaymentReady({
      id: created.attempt.id,
      workspaceKey: context.workspace.key,
      providerReference: session.providerReference,
      checkoutUrl: session.checkoutUrl,
    })
    log.finish(201, { outcome: 'checkout_created', orderId: ready.id, plan: plan.slug })
    return Response.json({
      orderId: ready.id,
      checkoutUrl: ready.checkoutUrl,
      reused: false,
    }, { status: 201, headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    if (attempt) {
      try {
        await markPaymentFailed(attempt.id, attempt.workspaceKey, error instanceof ExpressPayError ? error.code : 'internal_error')
      } catch (stateError) {
        log.error('billing.checkout_failure_state_unpersisted', {
          orderId: attempt.id,
          ...errorDetails(stateError),
        })
      }
    }
    const response = checkoutError(error)
    log.error('billing.checkout_failed', errorDetails(error))
    log.finish(response.status, { outcome: 'checkout_failed' })
    return Response.json({ error: response.copy }, { status: response.status, headers: log.headers({ 'Cache-Control': 'no-store' }) })
  }
}
