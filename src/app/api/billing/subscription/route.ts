import { getOptionalAuthContext } from '@/lib/auth'
import { findBillingPlan } from '@/lib/billing/catalog'
import { readBalance } from '@/lib/billing/credit-repository'
import { SPONSORED_PROVIDER } from '@/lib/billing/sponsored-entitlement-policy'
import { errorDetails, requestLogger } from '@/lib/observability'
import { listWorkspacePaymentAttempts, readWorkspaceSubscription } from '@/lib/payments/payment-repository'
import { isPostgresConfigured } from '@/lib/postgres'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const log = requestLogger(request, '/api/billing/subscription')
  try {
    const context = await getOptionalAuthContext()
    if (!context) {
      log.finish(200, { outcome: 'guest_subscription' })
      return Response.json({
        subscription: null,
        attempts: [],
        billingEnabled: process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true',
        signedIn: false,
      }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
    }

    if (!isPostgresConfigured()) {
      log.finish(503, { outcome: 'database_not_configured' })
      return Response.json({
        subscription: null,
        attempts: [],
        billingEnabled: process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true',
      }, { status: 503, headers: log.headers({ 'Cache-Control': 'no-store' }) })
    }

    const subscription = await readWorkspaceSubscription(context)
    const attempts = await listWorkspacePaymentAttempts(context, 15)

    const activePlan = subscription ? findBillingPlan(subscription.planSlug) : findBillingPlan('explorer')
    const sponsored = subscription?.provider === SPONSORED_PROVIDER
    const sponsoredBalance = sponsored ? await readBalance(context) : null

    log.finish(200, { outcome: 'success', hasSubscription: Boolean(subscription) })
    return Response.json({
      subscription: subscription ? {
        id: subscription.id,
        planSlug: subscription.planSlug,
        planName: sponsored ? `${activePlan?.name ?? subscription.planSlug} pilot access` : (activePlan?.name ?? subscription.planSlug),
        status: subscription.status,
        cadence: subscription.cadence,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        includedCredits: sponsoredBalance?.allowance ?? activePlan?.includedCredits ?? 0,
        monthlyPriceGhs: sponsored ? 0 : (activePlan?.monthlyPriceGhs ?? 0),
      } : null,
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        planSlug: attempt.planSlug,
        planName: findBillingPlan(attempt.planSlug)?.name ?? attempt.planSlug,
        paymentMethod: attempt.paymentMethod,
        amountGhs: attempt.amountMinor / 100,
        status: attempt.status,
        createdAt: attempt.createdAt,
        activatedAt: attempt.activatedAt,
      })),
      billingEnabled: process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true',
      signedIn: true,
    }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('billing.subscription_read_failed', errorDetails(error))
    log.finish(500, { outcome: 'read_failed' })
    return Response.json({ error: 'Billing details could not be loaded.' }, { status: 500, headers: log.headers() })
  }
}
