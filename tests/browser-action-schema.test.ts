import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../database/postgres/0009_browser_action_foundation.sql', import.meta.url)
const artifactMigrationUrl = new URL('../database/postgres/0010_browser_artifact_retention.sql', import.meta.url)

test('browser action storage preserves sessions, exact actions and scoped approvals', async () => {
  const migration = await readFile(migrationUrl, 'utf8')
  for (const table of ['lab_browser_sessions', 'lab_agent_actions']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
  }
  assert.match(migration, /payload_hash text not null check \(char_length\(payload_hash\) = 64\)/)
  assert.match(migration, /idempotency_key text not null unique/)
  assert.match(migration, /where status = 'awaiting_approval'/)
  assert.match(migration, /approval_scope jsonb not null default '\{\}'::jsonb/)
})

test('browser data remains server-written and workspace-readable only', async () => {
  const migration = await readFile(migrationUrl, 'utf8')
  assert.match(migration, /revoke all on public\.lab_browser_sessions, public\.lab_agent_actions from anon, authenticated/)
  assert.match(migration, /grant select on public\.lab_browser_sessions, public\.lab_agent_actions to authenticated/)
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all)[^;]+lab_(?:browser_sessions|agent_actions)/i)
  assert.match(migration, /private\.can_access_workspace\(workspace_key\)/)
})

test('browser action creation is serialized and idempotent before provider work', async () => {
  const store = await readFile(new URL('../src/lib/browser/store.ts', import.meta.url), 'utf8')
  const route = await readFile(new URL('../src/app/api/browser/observe/route.ts', import.meta.url), 'utf8')
  assert.match(store, /pg_advisory_xact_lock/)
  assert.match(store, /where idempotency_key =/)
  assert.ok(route.indexOf('createBrowserAction') < route.indexOf('observePage'))
  assert.match(route, /allowRedirects|redirect_requires_new_action|redirect_blocked/)
})

test('visual evidence has private workspace metadata, integrity and expiry', async () => {
  const migration = await readFile(artifactMigrationUrl, 'utf8')
  assert.match(migration, /create table if not exists public\.lab_browser_artifacts/)
  assert.match(migration, /mime_type text not null check \(mime_type = 'image\/jpeg'\)/)
  assert.match(migration, /byte_length integer not null check \(byte_length > 0 and byte_length <= 750000\)/)
  assert.match(migration, /sha256 text not null check \(char_length\(sha256\) = 64\)/)
  assert.match(migration, /expires_at timestamptz not null/)
  assert.match(migration, /private\.can_access_workspace\(workspace_key\)/)
  assert.match(migration, /revoke all on public\.lab_browser_artifacts from anon, authenticated/)
})

test('screenshot bytes are integrity checked and storage deletion uses the API', async () => {
  const storage = await readFile(new URL('../src/lib/browser/artifact-storage.ts', import.meta.url), 'utf8')
  assert.match(storage, /createHash\('sha256'\)/)
  assert.match(storage, /bytes\.length !== screenshot\.byteLength/)
  assert.match(storage, /public: false/)
  assert.match(storage, /\.remove\(paths\.slice\(0, 1000\)\)/)
  assert.doesNotMatch(storage, /storage\.objects/)
})
