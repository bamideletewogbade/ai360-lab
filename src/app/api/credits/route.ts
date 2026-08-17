import { getOptionalAuthContext } from '@/lib/auth'
import { readBalance } from '@/lib/billing/credit-repository'
import { BILLING_PLANS, CREDIT_GUIDE, CREDIT_TOP_UPS } from '@/lib/billing/catalog'
import { FEATURE_WEIGHTS } from '@/lib/billing/credits'
import { lowCreditThreshold } from '@/lib/email/config'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const log = requestLogger(request, '/api/credits')
  try {
    const context = await getOptionalAuthContext()
    if (!context) {
      log.finish(401, { outcome: 'auth_required' })
      return Response.json({ error: 'Sign in to see your credits.' }, { status: 401, headers: log.headers() })
    }

    const balance = await readBalance(context)
    if (!balance) {
      log.finish(503, { outcome: 'database_not_configured' })
      return Response.json({
        error: 'Credits are not switched on yet.',
        status: 'credits_not_enabled',
      }, { status: 503, headers: log.headers({ 'Cache-Control': 'no-store' }) })
    }

    log.finish(200, { outcome: 'success', workspaceType: context.workspace.type })
    return Response.json({
      available: balance.available,
      reserved: balance.reserved,
      // The part of the balance that expires at the end of this month.
      allowance: balance.allowance,
      plan: balance.plan,
      period: balance.period,
      // Balance at or below which the interface suggests a top-up. The same
      // threshold drives the low-credit email, so one value keeps both honest.
      lowThreshold: lowCreditThreshold(),
      // What each kind of work costs, so the interface never has to hardcode it.
      costs: Object.fromEntries(
        Object.entries(FEATURE_WEIGHTS)
          .filter(([, weight]) => weight.ceiling > 0)
          .map(([feature, weight]) => [feature, { from: weight.floor, to: weight.ceiling }]),
      ),
      guide: CREDIT_GUIDE,
      // One-time credit bundles, so the interface never has to hardcode prices.
      topUps: CREDIT_TOP_UPS.map(({ slug, priceGhs, credits }) => ({ slug, priceGhs, credits })),
      // Public plan facts (name, price, included credits) so a "need credits"
      // moment can offer both a quick top-up and a plan. Internal economics
      // like CREDIT_VALUE_GHS are never exposed here.
      plans: BILLING_PLANS.map(({ slug, name, monthlyPriceGhs, includedCredits, featured }) => ({
        slug, name, monthlyPriceGhs, includedCredits, featured,
      })),
    }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('credits.read_failed', errorDetails(error))
    log.finish(500, { outcome: 'read_failed' })
    return Response.json({ error: 'Your credit balance could not be loaded.' }, { status: 500, headers: log.headers() })
  }
}
