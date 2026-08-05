import { getOptionalAuthContext } from '@/lib/auth'
import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import { normalizeUsageEvent, type UsageEventInput } from '@/lib/usage-contract'
import { ensureWorkspaceRecord } from '@/lib/workspace-db'

export { normalizeUsageEvent, type UsageEventInput } from '@/lib/usage-contract'

/**
 * Records what a provider call actually cost.
 *
 * Keyed on request ID and route, so a retried write updates the existing row
 * rather than double counting a single call. Anonymous calls are still
 * recorded, with no owner, because the spend is real either way.
 */
export async function recordUsageEvent(input: UsageEventInput) {
  if (!isPostgresConfigured()) return { recorded: false, reason: 'database_not_configured' as const }
  const event = normalizeUsageEvent(input)
  const context = await getOptionalAuthContext()
  const sql = getPostgres()

  await sql.begin(async (tx) => {
    if (context) await ensureWorkspaceRecord(tx, context)
    await tx`
      insert into public.lab_usage_events
        (owner_id, workspace_key, request_id, route, feature, provider, model,
         input_tokens, output_tokens, estimated_cost_usd, actual_cost_usd,
         latency_ms, outcome, metadata)
      values (${context?.userId ?? null}, ${context?.workspace.key ?? null}, ${event.requestId},
              ${event.route}, ${event.feature}, ${event.provider}, ${event.model},
              ${event.inputTokens}, ${event.outputTokens}, ${event.estimatedCostUsd},
              ${event.actualCostUsd}, ${event.latencyMs}, ${event.outcome},
              ${event.metadata ? tx.json(JSON.parse(event.metadata)) : null})
      on conflict (request_id, route) do update set
        owner_id = coalesce(excluded.owner_id, public.lab_usage_events.owner_id),
        workspace_key = coalesce(excluded.workspace_key, public.lab_usage_events.workspace_key),
        feature = excluded.feature,
        provider = excluded.provider,
        model = excluded.model,
        input_tokens = coalesce(excluded.input_tokens, public.lab_usage_events.input_tokens),
        output_tokens = coalesce(excluded.output_tokens, public.lab_usage_events.output_tokens),
        estimated_cost_usd = coalesce(excluded.estimated_cost_usd, public.lab_usage_events.estimated_cost_usd),
        actual_cost_usd = coalesce(excluded.actual_cost_usd, public.lab_usage_events.actual_cost_usd),
        latency_ms = coalesce(excluded.latency_ms, public.lab_usage_events.latency_ms),
        outcome = excluded.outcome,
        metadata = coalesce(excluded.metadata, public.lab_usage_events.metadata),
        updated_at = now()`
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
