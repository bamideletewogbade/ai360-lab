import type { RowDataPacket } from 'mysql2'
import { getOptionalAuthContext } from '@/lib/auth'
import { isDatabaseConfigured, withTransaction } from '@/lib/mysql'
import { errorDetails, requestLogger } from '@/lib/observability'
import { ensureWorkspaceRecord } from '@/lib/workspace-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type UsageSummaryRow = RowDataPacket & {
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
    if (!isDatabaseConfigured()) {
      log.finish(503, { outcome: 'database_not_configured' })
      return Response.json({ error: 'Usage reporting is not configured yet.' }, { status: 503, headers: log.headers() })
    }

    const now = new Date()
    const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01 00:00:00`
    const rows = await withTransaction(async (connection) => {
      await ensureWorkspaceRecord(connection, context)
      const [result] = await connection.query<UsageSummaryRow[]>(
        `SELECT feature, COUNT(*) AS requests,
           COALESCE(SUM(input_tokens), 0) AS input_tokens,
           COALESCE(SUM(output_tokens), 0) AS output_tokens,
           COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd,
           COALESCE(SUM(actual_cost_usd), 0) AS actual_cost_usd,
           SUM(CASE WHEN outcome IN ('success', 'success_without_done_event', 'submitted', 'completed', 'quote', 'status') THEN 0 ELSE 1 END) AS failures
         FROM lab_usage_events
         WHERE workspace_key = ? AND created_at >= ?
         GROUP BY feature ORDER BY actual_cost_usd DESC, requests DESC`,
        [context.workspace.key, monthStart],
      )
      return result
    })

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
