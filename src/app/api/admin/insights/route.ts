import { getOptionalAuthContext } from '@/lib/auth'
import { isAdminOperator } from '@/lib/admin/access'
import { generateAdminAiBriefing } from '@/lib/admin/ai-insights'
import { parseAdminRange } from '@/lib/admin/contracts'
import { readAdminDashboardData } from '@/lib/admin/repository'
import { errorDetails, requestLogger } from '@/lib/observability'
import { recordUsageEventSafe } from '@/lib/usage'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/admin/insights')
  const startedAt = performance.now()
  try {
    const context = await getOptionalAuthContext()
    if (!context) return Response.json({ error: 'Sign in to run AI insights.' }, { status: 401, headers: log.headers() })
    if (!isAdminOperator(context)) return Response.json({ error: 'Approved operator access is required.' }, { status: 403, headers: log.headers() })
    const body = await request.json().catch(() => ({})) as { range?: unknown }
    const range = parseAdminRange(typeof body.range === 'string' ? body.range : null)
    const dashboard = await readAdminDashboardData(range)
    const briefing = await generateAdminAiBriefing(dashboard)
    await recordUsageEventSafe({
      requestId: log.requestId, route: '/api/admin/insights', feature: 'admin.insights',
      provider: 'openrouter', model: briefing.model, inputTokens: briefing.usage.inputTokens,
      outputTokens: briefing.usage.outputTokens, actualCostUsd: briefing.usage.costUsd,
      latencyMs: Math.round(performance.now() - startedAt), outcome: 'success',
    })
    log.finish(200, { outcome: 'success', range, model: briefing.model })
    return Response.json({
      generatedAt: briefing.generatedAt,
      model: briefing.model,
      headline: briefing.headline,
      summary: briefing.summary,
      priorities: briefing.priorities,
    }, { headers: log.headers({ 'Cache-Control': 'private, no-store' }) })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const status = message === 'AI_INSIGHTS_NOT_CONFIGURED' ? 503 : 502
    log.error('admin.insights_failed', errorDetails(error))
    log.finish(status, { outcome: 'insights_failed' })
    return Response.json({ error: status === 503 ? 'AI insights are not configured yet.' : 'AI360 could not produce the briefing.' }, { status, headers: log.headers() })
  }
}
