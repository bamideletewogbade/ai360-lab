import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { summarizePilotCohort, type PilotTesterMetrics } from '../src/lib/pilot/report-contract.ts'
import { createWorkspaceAuthContext } from '../src/lib/workspace.ts'
import { isPilotOperator } from '../src/lib/pilot/access.ts'

function tester(overrides: Partial<PilotTesterMetrics> = {}): PilotTesterMetrics {
  return {
    email: 'tester@example.com', displayName: null, grantAt: '2026-08-01T00:00:00.000Z',
    creditsGranted: 25, creditsSpent: 4, accountBalance: 21, activeDays: 1,
    firstActiveAt: '2026-08-20T10:00:00.000Z', lastActiveAt: '2026-08-20T10:00:00.000Z',
    conversations: 1, messages: 2, userMessages: 1, projects: 0, agentRuns: 0,
    mediaJobs: 0, images: 0, videos: 0, files: 0, requests: 1,
    deliveredRequests: 1, successfulRequests: 1, failedRequests: 0, providerCostUsd: 0.02,
    ...overrides,
  }
}

test('pilot summary separates activation, recent activity and returning use', () => {
  const report = summarizePilotCohort([
    tester({ email: 'active@example.com' }),
    tester({ email: 'returning@example.com', activeDays: 3, creditsSpent: 9, failedRequests: 1, requests: 2 }),
    tester({ email: 'waiting@example.com', deliveredRequests: 0, successfulRequests: 0, requests: 0, lastActiveAt: null, activeDays: 0, creditsSpent: 0 }),
  ], new Date('2026-08-24T00:00:00.000Z'))

  assert.equal(report.testers, 3)
  assert.equal(report.activated, 2)
  assert.equal(report.activeLast7Days, 2)
  assert.equal(report.returning, 1)
  assert.equal(report.creditsGranted, 75)
  assert.equal(report.creditsSpent, 13)
  assert.equal(report.activationRate, 67)
  assert.equal(report.returnRate, 33)
  assert.equal(report.requestSuccessRate, 67)
})

test('pilot operator access is an explicit account allowlist', () => {
  const previousIds = process.env.AI360_PILOT_OPERATOR_IDS
  const previousEmails = process.env.AI360_PILOT_OPERATOR_EMAILS
  try {
    process.env.AI360_PILOT_OPERATOR_IDS = 'operator_id'
    process.env.AI360_PILOT_OPERATOR_EMAILS = 'founder@example.com'
    assert.equal(isPilotOperator(createWorkspaceAuthContext({ userId: 'operator_id' })), true)
    assert.equal(isPilotOperator(createWorkspaceAuthContext({ userId: 'another_id', email: 'Founder@Example.com' })), true)
    assert.equal(isPilotOperator(createWorkspaceAuthContext({ userId: 'tester_id', email: 'tester@example.com' })), false)
  } finally {
    if (previousIds === undefined) delete process.env.AI360_PILOT_OPERATOR_IDS
    else process.env.AI360_PILOT_OPERATOR_IDS = previousIds
    if (previousEmails === undefined) delete process.env.AI360_PILOT_OPERATOR_EMAILS
    else process.env.AI360_PILOT_OPERATOR_EMAILS = previousEmails
  }
})

test('pilot reporting stays metadata-only and uses measured spend', async () => {
  const reporting = await readFile(new URL('../src/lib/pilot/reporting.ts', import.meta.url), 'utf8')
  assert.match(reporting, /from public\.lab_cost_ledger/)
  assert.match(reporting, /settled_credits/)
  assert.doesNotMatch(reporting, /message\.content|conversation\.content|project_data/)
})
