import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const runtimeMigrationUrl = new URL('../database/postgres/0002_runtime_foundation.sql', import.meta.url)

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

test('task dependencies cannot cross agent runs', async () => {
  const migration = await readFile(runtimeMigrationUrl, 'utf8')

  assert.match(migration, /foreign key \(workspace_key, run_id, task_id\)/)
  assert.match(migration, /references public\.lab_agent_tasks\(workspace_key, run_id, id\)/)
  assert.match(migration, /check \(task_id <> depends_on_task_id\)/)
})
