export type UsageEventInput = {
  requestId: string
  route: string
  feature: string
  provider?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  estimatedCostUsd?: number
  actualCostUsd?: number
  latencyMs?: number
  outcome: string
  metadata?: Record<string, unknown>
}

function finiteNonNegative(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function integer(value: unknown) {
  const number = finiteNonNegative(value)
  return number === null ? null : Math.round(number)
}

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.slice(0, max) : null
}

export function normalizeUsageEvent(input: UsageEventInput) {
  return {
    requestId: text(input.requestId, 64) || 'unknown',
    route: text(input.route, 120) || 'unknown',
    feature: text(input.feature, 80) || 'unknown',
    provider: text(input.provider, 80),
    model: text(input.model, 120),
    inputTokens: integer(input.inputTokens),
    outputTokens: integer(input.outputTokens),
    estimatedCostUsd: finiteNonNegative(input.estimatedCostUsd),
    actualCostUsd: finiteNonNegative(input.actualCostUsd),
    latencyMs: integer(input.latencyMs),
    outcome: text(input.outcome, 40) || 'unknown',
    metadata: input.metadata ? JSON.stringify(input.metadata).slice(0, 16_000) : null,
  }
}
