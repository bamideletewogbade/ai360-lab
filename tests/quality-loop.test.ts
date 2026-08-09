import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { feedbackRequestSchema } from '../src/lib/quality/contracts.ts'
import { moreUrgentSeverity, triageFeedback } from '../src/lib/quality/triage.ts'

function feedback(overrides: Record<string, unknown> = {}) {
  return feedbackRequestSchema.parse({
    reportKind: 'quality',
    sentiment: 'needs_work',
    category: 'wrong_or_outdated',
    sourceSurface: 'quick',
    ...overrides,
  })
}

test('feedback keeps message content and contact details opt-in', () => {
  const parsed = feedback({
    evidenceScope: 'none',
    evidenceExcerpt: 'private conversation',
    contactAllowed: false,
    contactEmail: 'person@example.com',
  })

  assert.equal(parsed.evidenceExcerpt, null)
  assert.equal(parsed.contactEmail, null)
})

test('helpful feedback closes without creating work', () => {
  const result = triageFeedback(feedback({ reportKind: 'reaction', sentiment: 'helpful', category: 'other' }))
  assert.equal(result.severity, 's4')
  assert.equal(result.status, 'closed')
  assert.deepEqual(result.actions, [])
})

test('immediate safety and privacy reports reach the highest human queue', () => {
  const result = triageFeedback(feedback({
    reportKind: 'safety',
    sentiment: 'serious',
    category: 'security_or_privacy',
    immediateRisk: true,
  }))

  assert.equal(result.severity, 's0')
  assert.equal(result.status, 'human_review')
  assert.ok(result.actions.some((action) => action.type === 'alert_human'))
  assert.ok(result.actions.some((action) => action.type === 'contain_capability' && action.requiresHuman))
})

test('quality failures become test candidates while product ideas stay in product review', () => {
  const wrong = triageFeedback(feedback())
  const feature = triageFeedback(feedback({ reportKind: 'product', category: 'feature_request' }))

  assert.equal(wrong.severity, 's2')
  assert.ok(wrong.actions.some((action) => action.type === 'create_eval_case'))
  assert.equal(feature.severity, 's3')
  assert.ok(feature.actions.some((action) => action.type === 'product_review' && action.requiresHuman))
})

test('AI evaluation cannot lower a rules-first severity', () => {
  assert.equal(moreUrgentSeverity('s1', 's3'), 's1')
  assert.equal(moreUrgentSeverity('s4', 's2'), 's2')
})

test('quality migration protects each durable table and indexes the review path', async () => {
  const migration = await readFile(new URL('../database/postgres/0006_quality_loop.sql', import.meta.url), 'utf8')
  for (const table of ['lab_quality_reports', 'lab_quality_events', 'lab_quality_actions', 'lab_quality_eval_cases']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
  }
  assert.match(migration, /create index if not exists idx_lab_quality_reports_queue/)
  assert.match(migration, /revoke all on public\.lab_quality_reports,[\s\S]+from anon, authenticated/)
})
