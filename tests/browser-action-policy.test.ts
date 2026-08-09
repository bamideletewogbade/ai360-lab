import assert from 'node:assert/strict'
import test from 'node:test'
import { actionPayloadHash, evaluateActionPolicy, safePublicUrl } from '../src/lib/agent/action-policy.ts'
import { normalizedActionSchema, type NormalizedAction } from '../src/lib/agent/tool-contracts.ts'

function action(overrides: Partial<NormalizedAction> = {}): NormalizedAction {
  return normalizedActionSchema.parse({
    id: 'action_01',
    kind: 'navigate',
    capability: 'browser.navigate',
    effect: 'navigation',
    dataClass: 'public',
    url: 'https://example.com/pricing',
    input: {},
    expectedOutcome: 'The pricing page is visible.',
    idempotencyKey: 'run-01:action-01',
    ...overrides,
  })
}

const base = {
  workspaceKey: 'user_01',
  runId: 'run_01',
  pilotMode: 'read_only' as const,
  allowedDomains: ['example.com'],
  userAuthorizedTask: true,
}

test('the read-only pilot allows scoped public navigation', () => {
  const decision = evaluateActionPolicy({ ...base, action: action() })
  assert.equal(decision.decision, 'allow')
  assert.equal(decision.risk, 'reversible')
})

test('navigation cannot escape the approved domain or reach a private host', () => {
  assert.equal(evaluateActionPolicy({ ...base, action: action({ url: 'https://evil.example.net' }) }).decision, 'block')
  assert.equal(safePublicUrl('http://127.0.0.1/admin', ['127.0.0.1']), null)
  assert.equal(safePublicUrl('file:///etc/passwd', ['example.com']), null)
  assert.equal(safePublicUrl('https://shop.example.com/item', ['example.com'])?.hostname, 'shop.example.com')
})

test('page text that looks consequential raises the risk even if the model calls it a click', () => {
  const decision = evaluateActionPolicy({
    ...base,
    action: action({ kind: 'click', capability: 'browser.interact', observedRole: 'button', observedLabel: 'Confirm purchase' }),
  })
  assert.equal(decision.risk, 'consequential')
  assert.equal(decision.decision, 'block')
})

test('a write requires an exact, unexpired approval receipt', () => {
  const write = action({
    kind: 'submit', capability: 'external.write', effect: 'external_write',
    observedLabel: 'Publish post', expectedOutcome: 'The approved post is published.',
  })
  const writeBase = { ...base, pilotMode: 'approved_write' as const, action: write }

  assert.equal(evaluateActionPolicy(writeBase).decision, 'approval_required')

  const approval = {
    id: 'approval_01', status: 'approved' as const, workspaceKey: base.workspaceKey,
    runId: base.runId, actionId: write.id, payloadHash: actionPayloadHash(write),
    expiresAt: '2030-01-01T00:00:00.000Z',
  }
  assert.equal(evaluateActionPolicy({ ...writeBase, approval, now: new Date('2029-01-01') }).decision, 'allow')

  const changed = { ...write, input: { body: 'A different post' } }
  assert.equal(evaluateActionPolicy({ ...writeBase, action: changed, approval, now: new Date('2029-01-01') }).decision, 'approval_required')
  assert.equal(evaluateActionPolicy({ ...writeBase, approval, now: new Date('2031-01-01') }).decision, 'approval_required')
})

test('a model cannot expand beyond the customer-authorized task', () => {
  const decision = evaluateActionPolicy({ ...base, action: action(), userAuthorizedTask: false })
  assert.equal(decision.decision, 'block')
  assert.equal(decision.reasonCode, 'outside_user_scope')
})

test('an action cannot claim a weaker capability than its operation requires', () => {
  const parsed = normalizedActionSchema.safeParse({
    ...action(),
    kind: 'click',
    capability: 'browser.observe',
  })
  assert.equal(parsed.success, false)
})

test('desktop control remains closed during the browser rollout', () => {
  const decision = evaluateActionPolicy({
    ...base,
    action: action({ kind: 'click', capability: 'desktop.control' }),
  })
  assert.equal(decision.decision, 'block')
  assert.equal(decision.risk, 'prohibited')
})
