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
import {
  canManageAdminCredits,
  canManageAdminPrograms,
  canSendAdminEmail,
  isAdminOperator,
} from '../src/lib/admin/access.ts'
import { isMissingAdminAuditTable } from '../src/lib/admin/audit.ts'
import { buildAdminFinance } from '../src/lib/admin/finance.ts'
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

test('admin finance uses the real credit engine for price, landed cost and margin', () => {
  const finance = buildAdminFinance({
    cashCollectedGhs: 125,
    approvedPayments: 1,
    chargedCredits: 9,
    providerCostUsd: 0.1,
    media: [
      { mediaType: 'image', settledJobs: 1, chargedJobs: 1, chargedCredits: 3, providerCharges: 1, providerCostUsd: 0.02 },
      { mediaType: 'video', settledJobs: 1, chargedJobs: 1, chargedCredits: 6, providerCharges: 1, providerCostUsd: 0.08 },
    ],
    recentMedia: [{
      id: 'media_1', userId: 'user_1', email: 'person@example.com', displayName: 'Person',
      mediaType: 'image', model: 'image-model', status: 'completed', chargedCredits: 3,
      providerCostUsd: 0.02, occurredAt: '2026-08-24T12:00:00.000Z',
    }],
  })

  assert.equal(finance.calculation.referencePlanName, 'Everyday')
  assert.equal(finance.calculation.referenceCreditPriceGhs, 1.0417)
  assert.equal(finance.calculation.costBudgetPerCreditGhs, 0.26)
  assert.equal(finance.calculation.unitGrossMarginPercent, 75)
  assert.equal(finance.media[0].referenceBilledGhs, 3.13)
  assert.equal(finance.media[0].landedCostGhs, 0.3)
  assert.equal(finance.media[0].grossProfitGhs, 2.82)
  assert.equal(finance.recentMedia[0].grossMarginPercent, 90.3)
  assert.equal(finance.creditRates.find((rate) => rate.id === 'topup-50')?.pricePerCreditGhs, 1.25)
})

test('read access and credit mutations use separate operator capabilities', () => {
  const previous = {
    admin: process.env.AI360_ADMIN_OPERATOR_IDS,
    quality: process.env.AI360_QUALITY_REVIEWER_IDS,
    credit: process.env.AI360_CREDIT_OPERATOR_IDS,
    program: process.env.AI360_PROGRAM_OPERATOR_IDS,
    email: process.env.AI360_EMAIL_OPERATOR_IDS,
  }
  try {
    process.env.AI360_ADMIN_OPERATOR_IDS = 'admin_id'
    process.env.AI360_QUALITY_REVIEWER_IDS = 'reviewer_id'
    process.env.AI360_CREDIT_OPERATOR_IDS = 'credit_id'
    process.env.AI360_PROGRAM_OPERATOR_IDS = 'program_id'
    process.env.AI360_EMAIL_OPERATOR_IDS = 'email_id'
    assert.equal(isAdminOperator(createWorkspaceAuthContext({ userId: 'reviewer_id' })), true)
    assert.equal(canManageAdminCredits(createWorkspaceAuthContext({ userId: 'reviewer_id' })), false)
    assert.equal(isAdminOperator(createWorkspaceAuthContext({ userId: 'admin_id' })), true)
    assert.equal(canManageAdminCredits(createWorkspaceAuthContext({ userId: 'admin_id' })), true)
    assert.equal(canManageAdminCredits(createWorkspaceAuthContext({ userId: 'credit_id' })), true)
    assert.equal(canManageAdminPrograms(createWorkspaceAuthContext({ userId: 'program_id' })), true)
    assert.equal(canManageAdminCredits(createWorkspaceAuthContext({ userId: 'program_id' })), false)
    assert.equal(canSendAdminEmail(createWorkspaceAuthContext({ userId: 'email_id' })), true)
    assert.equal(canManageAdminPrograms(createWorkspaceAuthContext({ userId: 'email_id' })), false)
  } finally {
    if (previous.admin === undefined) delete process.env.AI360_ADMIN_OPERATOR_IDS
    else process.env.AI360_ADMIN_OPERATOR_IDS = previous.admin
    if (previous.quality === undefined) delete process.env.AI360_QUALITY_REVIEWER_IDS
    else process.env.AI360_QUALITY_REVIEWER_IDS = previous.quality
    if (previous.credit === undefined) delete process.env.AI360_CREDIT_OPERATOR_IDS
    else process.env.AI360_CREDIT_OPERATOR_IDS = previous.credit
    if (previous.program === undefined) delete process.env.AI360_PROGRAM_OPERATOR_IDS
    else process.env.AI360_PROGRAM_OPERATOR_IDS = previous.program
    if (previous.email === undefined) delete process.env.AI360_EMAIL_OPERATOR_IDS
    else process.env.AI360_EMAIL_OPERATOR_IDS = previous.email
  }
})

test('admin reporting and AI insights remain metadata-only', async () => {
  const repository = await readFile(new URL('../src/lib/admin/repository.ts', import.meta.url), 'utf8')
  const cohorts = await readFile(new URL('../src/lib/admin/cohorts.ts', import.meta.url), 'utf8')
  const ai = await readFile(new URL('../src/lib/admin/ai-insights.ts', import.meta.url), 'utf8')
  const consoleUi = await readFile(new URL('../src/components/AdminConsole.tsx', import.meta.url), 'utf8')
  assert.match(repository, /from public\.lab_cost_ledger/)
  assert.match(repository, /settled_credits/)
  assert.match(repository, /from public\.lab_payment_attempts/)
  assert.match(consoleUi, /Know what every credit earns/)
  assert.match(consoleUi, /How the engine gets to credits/)
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

test('participant operations keep pilot inside admin with safe bulk outreach', async () => {
  const consoleUi = await readFile(new URL('../src/components/AdminConsole.tsx', import.meta.url), 'utf8')
  const bulkRoute = await readFile(new URL('../src/app/api/admin/bulk/route.ts', import.meta.url), 'utf8')
  const programRepository = await readFile(new URL('../src/lib/admin/programs.ts', import.meta.url), 'utf8')
  const emailTemplate = await readFile(new URL('../src/lib/admin/participant-email.ts', import.meta.url), 'utf8')

  // Pinned by the handler each button calls rather than by its wording, so the
  // copy can be rewritten for an operator without breaking the test. The
  // labels themselves were database vocabulary until 2026-08-26 ("Invited ·
  // not activated"); what must not change is that every view still resolves to
  // an `applySavedView` case.
  for (const view of ['invited', 'no_return', 'low_credits', 'blocked', 'feedback', 'high_engagement']) {
    assert.match(consoleUi, new RegExp(`applySavedView\\('${view}'\\)`), `saved view ${view} must stay reachable`)
  }
  assert.match(consoleUi, /Exact recipients/)
  assert.match(consoleUi, /Send \$\{emailPreview\.eligible\.length\} emails/)
  assert.match(bulkRoute, /email_status === 'contactable'/)
  assert.match(bulkRoute, /claimAdminContactEvent/)
  assert.match(programRepository, /on conflict \(idempotency_key\) do nothing/)
  assert.match(emailTemplate, /escapeHtml\(note\)/)
  assert.doesNotMatch(emailTemplate, /recipient_email|provider_message_id/)
})

test('the participant screen speaks the operator’s language, not the column’s', async () => {
  const consoleUi = await readFile(new URL('../src/components/AdminConsole.tsx', import.meta.url), 'utf8')

  // Rows used to print the raw enum while the filter above them called the
  // same state something else, so filtering to "Withdrawn" produced a list
  // where every row read `revoked`.
  assert.match(consoleUi, /const INVITE_STATUS_LABELS/)
  for (const [value, shown] of [
    ['pending', 'Not sent'], ['sent', 'Invited, not signed up'], ['accepted', 'Signed up'],
    ['bounced', 'Email bounced'], ['revoked', 'Cancelled'],
  ]) {
    assert.match(consoleUi, new RegExp(`${value}: '${shown}'`), `${value} needs a plain-language label`)
  }
  // No participant ever replies to an invitation — the link does the work — so
  // no label may imply they were supposed to. Comments are stripped first:
  // this is a claim about what the screen says, not about what the source
  // discusses, and the note explaining the old wording legitimately names it.
  const withoutComments = consoleUi.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(withoutComments, /no reply/i)
  assert.match(consoleUi, /INVITE_STATUS_LABELS\[invitation\.inviteStatus\] \?\? label\(/,
    'an unknown status must fall back rather than render blank')

  // The old counter's denominator spanned every status and never fell, because
  // nothing deletes an invitation row.
  assert.doesNotMatch(consoleUi, /of \{invitations\.length\} invitations/)
  assert.match(consoleUi, /invitationCounts/)

  // Acting on rows the current filter hides is how a send reaches someone the
  // operator did not mean to contact.
  assert.match(consoleUi, /visibleInvitations\.filter\(\(item\) => invitationIds\.has\(item\.id\)\)/)

  // Nothing cleared this before, so a stale "3 sent" survived the session.
  assert.match(consoleUi, /setInviteNotice\(''\)/)

  // Eight of the nine dropdowns went; the list fits on a screen at pilot size.
  for (const gone of ['Any contact state', 'Any activity', 'Any balance', 'Any signal', 'Any stage']) {
    assert.doesNotMatch(consoleUi, new RegExp(gone), `${gone} filter should be gone`)
  }
  assert.match(consoleUi, /Include people who left/)
})

test('every CSS class the admin console references actually exists', async () => {
  // `styles.missing` is `undefined` at runtime, which silently drops the class
  // and puts a literal "undefined" in the DOM. TypeScript does not catch it.
  const consoleUi = await readFile(new URL('../src/components/AdminConsole.tsx', import.meta.url), 'utf8')
  const sheet = await readFile(new URL('../src/components/AdminConsole.module.css', import.meta.url), 'utf8')
  const referenced = [...new Set([...consoleUi.matchAll(/styles\.([A-Za-z0-9_]+)/g)].map((match) => match[1]))]
  assert.ok(referenced.length > 50, 'expected the console to reference many classes')
  const missing = referenced.filter((name) => !new RegExp(`\\.${name}[\\s,{:>]`).test(sheet))
  assert.deepEqual(missing, [], `these classes are referenced but never defined: ${missing.join(', ')}`)
})

test('participant exports offer authenticated Excel workbooks as well as CSV', async () => {
  const consoleUi = await readFile(new URL('../src/components/AdminConsole.tsx', import.meta.url), 'utf8')
  const route = await readFile(new URL('../src/app/api/admin/export/route.ts', import.meta.url), 'utf8')
  assert.match(consoleUi, /Export Excel/)
  assert.match(consoleUi, /Export CSV/)
  assert.match(route, /isAdminOperator\(operator\)/)
  assert.match(route, /readAdminDashboardData\('all'\)/)
  assert.match(route, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/)
  assert.match(route, /freezeHeader: true/)
  assert.match(route, /autoFilter: true/)
})

test('admins can onboard existing accounts into the pilot with optional starting credits', async () => {
  const consoleUi = await readFile(new URL('../src/components/AdminConsole.tsx', import.meta.url), 'utf8')
  const bulkRoute = await readFile(new URL('../src/app/api/admin/bulk/route.ts', import.meta.url), 'utf8')
  assert.match(consoleUi, /\+ Add pilot users/)
  assert.match(consoleUi, /Choose existing AI360 accounts/)
  assert.match(consoleUi, /Starting credits per user/)
  assert.doesNotMatch(consoleUi, /Program tools need migration 0025/)
  assert.match(bulkRoute, /action: z\.literal\('pilot_onboard'\)/)
  assert.match(bulkRoute, /sourceType: 'sponsored_seat'/)
  assert.match(bulkRoute, /canManageAdminPrograms\(operator\)/)
  assert.match(bulkRoute, /body\.credits > 0 && !canManageAdminCredits\(operator\)/)
})
