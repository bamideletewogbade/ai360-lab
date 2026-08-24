import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  adminBalanceHealth,
  adminRangeStart,
  adminUserStatus,
  summarizeAdminCohort,
  type AdminCohortUserMetrics,
} from '../src/lib/admin/contracts.ts'
import { canManageAdminCredits, isAdminOperator } from '../src/lib/admin/access.ts'
import { isMissingAdminAuditTable } from '../src/lib/admin/audit.ts'
import { createWorkspaceAuthContext } from '../src/lib/workspace.ts'

function user(overrides: Partial<AdminCohortUserMetrics> = {}): AdminCohortUserMetrics {
  return {
    userId: 'user_01', email: 'user@example.com', displayName: null,
    grantAt: '2026-08-01T00:00:00.000Z', creditsGranted: 25, creditsSpent: 4,
    accountBalance: 21, activeDays: 1, firstActiveAt: '2026-08-20T10:00:00.000Z',
    lastActiveAt: '2026-08-20T10:00:00.000Z', conversations: 1, messages: 2,
    userMessages: 1, projects: 0, agentRuns: 0, mediaJobs: 0, images: 0,
    videos: 0, files: 0, requests: 1, deliveredRequests: 1,
    successfulRequests: 1, failedRequests: 0, providerCostUsd: 0.02,
    ...overrides,
  }
}

test('admin cohort summary separates activation, recent activity and returning use', () => {
  const report = summarizeAdminCohort([
    user({ email: 'active@example.com' }),
    user({ userId: 'user_02', email: 'returning@example.com', activeDays: 3, creditsSpent: 9, failedRequests: 1, requests: 2 }),
    user({ userId: 'user_03', email: 'waiting@example.com', deliveredRequests: 0, successfulRequests: 0, requests: 0, lastActiveAt: null, activeDays: 0, creditsSpent: 0 }),
  ], new Date('2026-08-24T00:00:00.000Z'))

  assert.equal(report.users, 3)
  assert.equal(report.activated, 2)
  assert.equal(report.activeLast7Days, 2)
  assert.equal(report.returning, 1)
  assert.equal(report.creditsSpent, 13)
  assert.equal(report.activationRate, 67)
  assert.equal(report.returnRate, 33)
  assert.equal(report.requestSuccessRate, 67)
})

test('admin filters classify activity, balances and date windows consistently', () => {
  const now = new Date('2026-08-24T00:00:00.000Z')
  assert.equal(adminUserStatus('2026-08-22T00:00:00.000Z', now), 'active')
  assert.equal(adminUserStatus('2026-08-10T00:00:00.000Z', now), 'at_risk')
  assert.equal(adminUserStatus(null, now), 'dormant')
  assert.equal(adminBalanceHealth(0), 'empty')
  assert.equal(adminBalanceHealth(10), 'low')
  assert.equal(adminBalanceHealth(11), 'healthy')
  assert.equal(adminRangeStart('7d', now)?.toISOString(), '2026-08-17T00:00:00.000Z')
  assert.equal(adminRangeStart('all', now), null)
})

test('only the missing admin audit relation activates read-only compatibility mode', () => {
  assert.equal(isMissingAdminAuditTable({
    code: '42P01',
    message: 'relation "public.lab_admin_audit_events" does not exist',
  }), true)
  assert.equal(isMissingAdminAuditTable({
    code: '42P01',
    message: 'relation "public.some_other_table" does not exist',
  }), false)
  assert.equal(isMissingAdminAuditTable({
    code: '42501',
    message: 'permission denied for table lab_admin_audit_events',
  }), false)
})

test('read access and credit mutations use separate operator capabilities', () => {
  const previous = {
    admin: process.env.AI360_ADMIN_OPERATOR_IDS,
    quality: process.env.AI360_QUALITY_REVIEWER_IDS,
    credit: process.env.AI360_CREDIT_OPERATOR_IDS,
  }
  try {
    process.env.AI360_ADMIN_OPERATOR_IDS = 'admin_id'
    process.env.AI360_QUALITY_REVIEWER_IDS = 'reviewer_id'
    process.env.AI360_CREDIT_OPERATOR_IDS = 'credit_id'
    assert.equal(isAdminOperator(createWorkspaceAuthContext({ userId: 'reviewer_id' })), true)
    assert.equal(canManageAdminCredits(createWorkspaceAuthContext({ userId: 'reviewer_id' })), false)
    assert.equal(isAdminOperator(createWorkspaceAuthContext({ userId: 'admin_id' })), true)
    assert.equal(canManageAdminCredits(createWorkspaceAuthContext({ userId: 'admin_id' })), true)
    assert.equal(canManageAdminCredits(createWorkspaceAuthContext({ userId: 'credit_id' })), true)
  } finally {
    if (previous.admin === undefined) delete process.env.AI360_ADMIN_OPERATOR_IDS
    else process.env.AI360_ADMIN_OPERATOR_IDS = previous.admin
    if (previous.quality === undefined) delete process.env.AI360_QUALITY_REVIEWER_IDS
    else process.env.AI360_QUALITY_REVIEWER_IDS = previous.quality
    if (previous.credit === undefined) delete process.env.AI360_CREDIT_OPERATOR_IDS
    else process.env.AI360_CREDIT_OPERATOR_IDS = previous.credit
  }
})

test('admin reporting and AI insights remain metadata-only', async () => {
  const repository = await readFile(new URL('../src/lib/admin/repository.ts', import.meta.url), 'utf8')
  const cohorts = await readFile(new URL('../src/lib/admin/cohorts.ts', import.meta.url), 'utf8')
  const ai = await readFile(new URL('../src/lib/admin/ai-insights.ts', import.meta.url), 'utf8')
  assert.match(repository, /from public\.lab_cost_ledger/)
  assert.match(repository, /settled_credits/)
  assert.doesNotMatch(`${repository}\n${cohorts}`, /message\.content|evidence_excerpt|project_data/)
  assert.match(ai, /aggregate, metadata-only evidence/)
  assert.doesNotMatch(ai, /\.users\.map|email:/)
})

test('credit actions write a financial ledger entry and immutable operator audit together', async () => {
  const repository = await readFile(new URL('../src/lib/billing/credit-repository.ts', import.meta.url), 'utf8')
  const migration = await readFile(new URL('../database/postgres/0023_admin_console.sql', import.meta.url), 'utf8')
  assert.match(repository, /insert into public\.lab_admin_audit_events/)
  assert.match(repository, /balance_before[\s\S]+balance_after[\s\S]+reason/)
  assert.match(migration, /idempotency_key text not null unique/)
  assert.match(migration, /revoke all on public\.lab_admin_audit_events from public, anon, authenticated/)
  assert.doesNotMatch(migration, /policy[\s\S]+for insert/i)
})
