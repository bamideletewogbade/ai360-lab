import assert from 'node:assert/strict'
import test from 'node:test'
import { providerPreferences, routeFor } from '../src/lib/models.ts'

test('provider routing constraints are dropped when server-side tools are attached', () => {
  // Verified against the live API on 2026-08-05: these fields make OpenRouter
  // return 404 or 500 whenever tools are present, which silently broke every
  // chat, agent research and studio research request.
  const withTools = providerPreferences('chat', { withTools: true }) as Record<string, unknown>
  for (const forbidden of ['require_parameters', 'sort', 'allow_fallbacks', 'preferred_min_throughput', 'max_price']) {
    assert.equal(forbidden in withTools, false, `${forbidden} must not be sent alongside tools`)
  }
  assert.ok(withTools.preferred_max_latency, 'the latency preference is the one that survives')
})

test('cost and routing controls still apply when no tools are attached', () => {
  const plain = providerPreferences('chat') as Record<string, unknown>
  assert.equal(plain.require_parameters, true)
  assert.equal(plain.sort, 'price')
  assert.ok(plain.max_price)
})

test('automatic routing keeps a fallback chain without repeating a model', () => {
  const auto = routeFor('auto', { workload: 'chat' })
  assert.ok(auto.models.length > 1, 'a fallback must exist')
  assert.equal(new Set(auto.models).size, auto.models.length, 'no model may appear twice')
  assert.equal(auto.models[0], auto.model, 'the chosen model leads its own fallback chain')
})

test('video attachments route to a multimodal model even on automatic', () => {
  const text = routeFor('auto', { workload: 'chat' })
  const video = routeFor('auto', { workload: 'chat', hasVideo: true })
  assert.notEqual(video.model, text.model)
})
