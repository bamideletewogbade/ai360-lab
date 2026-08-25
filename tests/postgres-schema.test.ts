import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const runtimeMigrationUrl = new URL('../database/postgres/0002_runtime_foundation.sql', import.meta.url)
const onboardingMigrationUrl = new URL('../database/postgres/0013_workspace_onboarding.sql', import.meta.url)
const onboardingMemberMigrationUrl = new URL('../database/postgres/0014_onboarding_per_member.sql', import.meta.url)
const adminMigrationUrl = new URL('../database/postgres/0023_admin_console.sql', import.meta.url)
const adminFinanceMigrationUrl = new URL('../database/postgres/0024_admin_finance_indexes.sql', import.meta.url)
const adminProgramMigrationUrl = new URL('../database/postgres/0025_admin_program_operations.sql', import.meta.url)
const pilotInvitationMigrationUrl = new URL('../database/postgres/0026_pilot_invitations.sql', import.meta.url)

test('the Supabase runtime foundation persists every durable agent boundary', async () => {
  const migration = await readFile(runtimeMigrationUrl, 'utf8')
  const requiredTables = [
    'lab_assets',
    'lab_agent_runs',
    'lab_agent_tasks',
    'lab_agent_task_dependencies',
    'lab_agent_events',
    'lab_agent_artifacts',
    'lab_agent_approvals',
    'lab_credit_accounts',
    'lab_credit_reservations',
  ]

  for (const table of requiredTables) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
  }
})

test('private assets and agent data are read-only to the authenticated browser role', async () => {
  const migration = await readFile(runtimeMigrationUrl, 'utf8')

  assert.match(migration, /revoke all on public\.lab_assets[\s\S]+from anon, authenticated/)
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all)[^;]+lab_agent_/i)
  assert.match(migration, /values \('ai360-private', 'ai360-private', false, 104857600\)/)
})

test('workspace onboarding is workspace-scoped, guarded and not writable by the browser role', async () => {
  const migration = await readFile(onboardingMigrationUrl, 'utf8')

  assert.match(migration, /create table if not exists public\.lab_workspace_onboarding/)
  assert.match(migration, /alter table public\.lab_workspace_onboarding enable row level security/)
  // Referential integrity to the workspace and the owning user.
  assert.match(migration, /references public\.lab_workspaces\(workspace_key\) on delete cascade/)
  assert.match(migration, /references public\.lab_users\(clerk_user_id\) on delete cascade/)
  // A completed record must carry both answers; a skip must carry neither.
  assert.match(migration, /status = 'completed' and role is not null and goal is not null/)
  assert.match(migration, /status = 'skipped' and role is null and goal is null/)
  // Read-only to the authenticated browser role; writes go through the service path.
  assert.match(migration, /revoke all on public\.lab_workspace_onboarding\s+from anon, authenticated/)
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all)[^;]+lab_workspace_onboarding/i)
})

test('onboarding is keyed per member so an org never shares one record', async () => {
  const migration = await readFile(onboardingMemberMigrationUrl, 'utf8')
  assert.match(migration, /drop constraint lab_workspace_onboarding_pkey/)
  assert.match(migration, /primary key \(workspace_key, owner_id\)/)
})

test('task dependencies cannot cross agent runs', async () => {
  const migration = await readFile(runtimeMigrationUrl, 'utf8')

  assert.match(migration, /foreign key \(workspace_key, run_id, task_id\)/)
  assert.match(migration, /references public\.lab_agent_tasks\(workspace_key, run_id, id\)/)
  assert.match(migration, /check \(task_id <> depends_on_task_id\)/)
})

test('admin credit mutations have a private immutable audit table', async () => {
  const migration = await readFile(adminMigrationUrl, 'utf8')
  assert.match(migration, /create table if not exists public\.lab_admin_audit_events/)
  assert.match(migration, /action text not null check \(action in \('credit_grant', 'credit_refund'\)\)/)
  assert.match(migration, /balance_before bigint not null/)
  assert.match(migration, /balance_after bigint not null/)
  assert.match(migration, /alter table public\.lab_admin_audit_events enable row level security/)
  assert.match(migration, /revoke all on public\.lab_admin_audit_events from public, anon, authenticated/)
})

test('admin finance time-window queries have partial cost indexes', async () => {
  const migration = await readFile(adminFinanceMigrationUrl, 'utf8')
  assert.match(migration, /lab_credit_reservations\(feature, settled_at desc\)/)
  assert.match(migration, /where status = 'settled' and feature in \('image', 'video'\)/)
  assert.match(migration, /lab_usage_events\(feature, created_at desc\)/)
  assert.match(migration, /where actual_cost_usd > 0/)
})

test('pilot operations use private indexed membership, audit, and per-recipient contact tables', async () => {
  const migration = await readFile(adminProgramMigrationUrl, 'utf8')
  assert.match(migration, /create table if not exists public\.lab_admin_program_memberships/)
  assert.match(migration, /primary key \(program_key, user_id\)/)
  assert.match(migration, /participation_status in \('invited', 'enrolled', 'activated', 'returning', 'completed', 'withdrawn'\)/)
  assert.match(migration, /create table if not exists public\.lab_admin_program_events/)
  assert.match(migration, /idempotency_key text not null unique/)
  assert.match(migration, /create table if not exists public\.lab_admin_contact_events/)
  assert.match(migration, /idx_lab_admin_program_memberships_segment/)
  assert.match(migration, /idx_lab_admin_contact_events_member_created/)
  assert.match(migration, /revoke all on public\.lab_admin_program_memberships from public, anon, authenticated/)
  assert.match(migration, /revoke all on public\.lab_admin_contact_events from public, anon, authenticated/)
  assert.doesNotMatch(migration, /policy[\s\S]+for insert/i)
})

test('pilot invitations are keyed on a lower-cased address, not a user id', async () => {
  const migration = await readFile(pilotInvitationMigrationUrl, 'utf8')
  assert.match(migration, /create table if not exists public\.lab_admin_invitations/)
  assert.match(migration, /unique \(program_key, email\)/)
  // Storing the address already folded keeps the sign-in claim an index probe.
  assert.match(migration, /check \(email = lower\(email\)\)/)
  assert.match(migration, /idx_lab_admin_invitations_claimable/)
  // An invitation may only ever start someone at the beginning of the funnel.
  assert.match(migration, /participation_status in \('invited', 'enrolled'\)/)
  assert.match(migration, /invite_status in \('pending', 'sent', 'accepted', 'bounced', 'revoked'\)/)
  // Accepted state and its evidence cannot drift apart.
  assert.match(migration, /\(invite_status = 'accepted'\) = \(claimed_user_id is not null\)/)
  assert.match(migration, /\(invite_status = 'accepted'\) = \(accepted_at is not null\)/)
})

test('invitation mail has its own delivery ledger because contact events require a membership', async () => {
  const invitations = await readFile(pilotInvitationMigrationUrl, 'utf8')
  const programs = await readFile(adminProgramMigrationUrl, 'utf8')
  // The reason the invitation ledger has to exist: a contact event is bound to
  // a membership row, which an invitee has no way to have yet.
  assert.match(programs, /references public\.lab_admin_program_memberships\(program_key, user_id\) on delete cascade/)
  assert.match(invitations, /create table if not exists public\.lab_admin_invitation_events/)
  assert.match(invitations, /delivery_status is null or delivery_status in \('prepared', 'sent', 'failed', 'skipped'\)/)
  // Same claim/finish idempotency contract as `claimAdminContactEvent`.
  assert.match(invitations, /idempotency_key text not null unique/)
  assert.match(invitations, /alter table public\.lab_admin_invitations enable row level security/)
  assert.match(invitations, /alter table public\.lab_admin_invitation_events enable row level security/)
  assert.match(invitations, /revoke all on public\.lab_admin_invitations from public, anon, authenticated/)
  assert.match(invitations, /revoke all on public\.lab_admin_invitation_events from public, anon, authenticated/)
  assert.doesNotMatch(invitations, /policy[\s\S]+for insert/i)
})
