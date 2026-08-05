import { getOptionalAuthContext } from '@/lib/auth'
import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import { errorDetails, requestLogger } from '@/lib/observability'
import { ensureWorkspaceRecord } from '@/lib/workspace-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Outcomes that represent work the person actually received. */
const SUCCESSFUL_OUTCOMES = [
  'success', 'success_without_done_event', 'submitted', 'completed', 'quote', 'status',
]

type UsageSummaryRow = {
  feature: string
  requests: string | number
  input_tokens: string | number | null
  output_tokens: string | number | null
  estimated_cost_usd: string | number | null
  actual_cost_usd: string | number | null
  failures: string | number
}

export async function GET(request: Request) {
  const log = requestLogger(request, '/api/usage')
  try {
    const context = await getOptionalAuthContext()
    if (!context) {
      log.finish(401, { outcome: 'auth_required' })
      return Response.json({ error: 'Sign in to view usage.' }, { status: 401, headers: log.headers() })
    }
    if (!isPostgresConfigured()) {
      log.finish(503, { outcome: 'database_not_configured' })
      return Response.json({ error: 'Usage reporting is not configured yet.' }, { status: 503, headers: log.headers() })
    }

    const now = new Date()
    const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
    const sql = getPostgres()
    const rows = await sql.begin(async (tx) => {
      await ensureWorkspaceRecord(tx, context)
      return tx<UsageSummaryRow[]>`
        select feature, count(*) as requests,
               coalesce(sum(input_tokens), 0) as input_tokens,
               coalesce(sum(output_tokens), 0) as output_tokens,
               coalesce(sum(estimated_cost_usd), 0) as estimated_cost_usd,
               coalesce(sum(actual_cost_usd), 0) as actual_cost_usd,
               count(*) filter (where outcome <> all(${SUCCESSFUL_OUTCOMES})) as failures
          from public.lab_usage_events
         where workspace_key = ${context.workspace.key}
           and created_at >= ${monthStart}::date
         group by feature
         order by sum(actual_cost_usd) desc nulls last, count(*) desc`
    }) as UsageSummaryRow[]

    const features = rows.map((row) => ({
      feature: row.feature,
      requests: Number(row.requests),
      inputTokens: Number(row.input_tokens || 0),
      outputTokens: Number(row.output_tokens || 0),
      estimatedCostUsd: Number(row.estimated_cost_usd || 0),
      actualCostUsd: Number(row.actual_cost_usd || 0),
      failures: Number(row.failures),
    }))
    const totals = features.reduce((sum, item) => ({
      requests: sum.requests + item.requests,
      inputTokens: sum.inputTokens + item.inputTokens,
      outputTokens: sum.outputTokens + item.outputTokens,
      estimatedCostUsd: sum.estimatedCostUsd + item.estimatedCostUsd,
      actualCostUsd: sum.actualCostUsd + item.actualCostUsd,
      failures: sum.failures + item.failures,
    }), { requests: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, actualCostUsd: 0, failures: 0 })

    log.finish(200, { outcome: 'success', workspaceType: context.workspace.type, featureCount: features.length })
    return Response.json({ period: monthStart.slice(0, 7), totals, features }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('usage.summary_failed', errorDetails(error))
    log.finish(500, { outcome: 'summary_failed' })
    return Response.json({ error: 'Usage summary could not be loaded.' }, { status: 500, headers: log.headers() })
  }
}
