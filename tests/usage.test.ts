import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeUsageEvent } from '../src/lib/usage-contract.ts'

test('usage events normalize provider accounting into bounded database values', () => {
  const event = normalizeUsageEvent({
    requestId: `req_${'a'.repeat(100)}`,
    route: '/api/chat',
    feature: 'chat',
    provider: 'openrouter',
    model: 'provider/model',
    inputTokens: 10.4,
    outputTokens: 20.8,
    estimatedCostUsd: 0.002,
    latencyMs: 1543.6,
    outcome: 'success',
    metadata: { fallback: false },
  })

  assert.equal(event.requestId.length, 64)
  assert.equal(event.inputTokens, 10)
  assert.equal(event.outputTokens, 21)
  assert.equal(event.latencyMs, 1544)
  assert.equal(event.estimatedCostUsd, 0.002)
  assert.equal(event.metadata, '{"fallback":false}')
})

test('usage events reject invalid numeric accounting rather than storing corrupt totals', () => {
  const event = normalizeUsageEvent({
    requestId: '',
    route: '',
    feature: '',
    inputTokens: -1,
    outputTokens: Number.NaN,
    actualCostUsd: Number.POSITIVE_INFINITY,
    outcome: '',
  })

  assert.equal(event.requestId, 'unknown')
  assert.equal(event.route, 'unknown')
  assert.equal(event.feature, 'unknown')
  assert.equal(event.outcome, 'unknown')
  assert.equal(event.inputTokens, null)
  assert.equal(event.outputTokens, null)
  assert.equal(event.actualCostUsd, null)
})
