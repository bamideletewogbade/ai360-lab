import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const runtimeMigrationUrl = new URL('../database/postgres/0002_runtime_foundation.sql', import.meta.url)
const onboardingMigrationUrl = new URL('../database/postgres/0013_workspace_onboarding.sql', import.meta.url)
const onboardingMemberMigrationUrl = new URL('../database/postgres/0014_onboarding_per_member.sql', import.meta.url)

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
