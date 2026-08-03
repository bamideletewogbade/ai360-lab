import { getOptionalAuthContext } from '@/lib/auth'
import { isDatabaseConfigured, withTransaction } from '@/lib/mysql'
import { normalizeUsageEvent, type UsageEventInput } from '@/lib/usage-contract'
import { ensureWorkspaceRecord } from '@/lib/workspace-db'

export { normalizeUsageEvent, type UsageEventInput } from '@/lib/usage-contract'

export async function recordUsageEvent(input: UsageEventInput) {
  if (!isDatabaseConfigured()) return { recorded: false, reason: 'database_not_configured' as const }
  const event = normalizeUsageEvent(input)
  const context = await getOptionalAuthContext()

  await withTransaction(async (connection) => {
    if (context) await ensureWorkspaceRecord(connection, context)
    await connection.execute(
      `INSERT INTO lab_usage_events
        (owner_id, workspace_key, request_id, route, feature, provider, model,
         input_tokens, output_tokens, estimated_cost_usd, actual_cost_usd,
         latency_ms, outcome, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         owner_id = COALESCE(VALUES(owner_id), owner_id),
         workspace_key = COALESCE(VALUES(workspace_key), workspace_key),
         feature = VALUES(feature), provider = VALUES(provider), model = VALUES(model),
         input_tokens = COALESCE(VALUES(input_tokens), input_tokens),
         output_tokens = COALESCE(VALUES(output_tokens), output_tokens),
         estimated_cost_usd = COALESCE(VALUES(estimated_cost_usd), estimated_cost_usd),
         actual_cost_usd = COALESCE(VALUES(actual_cost_usd), actual_cost_usd),
         latency_ms = COALESCE(VALUES(latency_ms), latency_ms),
         outcome = VALUES(outcome), metadata = COALESCE(VALUES(metadata), metadata)`,
      [
        context?.userId || null,
        context?.workspace.key || null,
        event.requestId,
        event.route,
        event.feature,
        event.provider,
        event.model,
        event.inputTokens,
        event.outputTokens,
        event.estimatedCostUsd,
        event.actualCostUsd,
        event.latencyMs,
        event.outcome,
        event.metadata,
      ],
    )
  })
  return { recorded: true as const }
}

export async function recordUsageEventSafe(input: UsageEventInput) {
  try {
    return await recordUsageEvent(input)
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'ai360-lab',
      event: 'usage.record_failed',
      requestId: input.requestId.slice(0, 64),
      route: input.route.slice(0, 120),
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }))
    return { recorded: false, reason: 'write_failed' as const }
  }
}
