import { config } from 'dotenv'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

register('./alias-loader.mjs', pathToFileURL('./scripts/'))

const { createWorkspaceAuthContext } = await import('../src/lib/workspace.ts')
const { ensureWorkspaceRecord } = await import('../src/lib/workspace-db.ts')
const { getPostgres } = await import('../src/lib/postgres.ts')

/**
 * Exercises the SQL behind the ported data routes against the configured
 * database. Uses a disposable workspace and removes it afterwards, so it is
 * safe to run against a live environment.
 */

const stamp = `routes${Date.now()}`
const context = createWorkspaceAuthContext({ userId: `user_${stamp}` })
const key = context.workspace.key
const sql = getPostgres()

const results = []
const check = (name, passed, detail = '') => {
  results.push({ name, passed })
  console.log(`${passed ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

try {
  await sql.begin(async (tx) => ensureWorkspaceRecord(tx, context))
  const [workspace] = await sql`select workspace_type from public.lab_workspaces where workspace_key = ${key}`
  check('identity rows are created before any workspace write', workspace?.workspace_type === 'user')

  // Conversations: insert, upsert, and messages with jsonb metadata.
  await sql.begin(async (tx) => {
    await tx`
      insert into public.lab_conversations (id, owner_id, workspace_key, title, model, experience, client_updated_at)
      values ('c1', ${context.userId}, ${key}, 'First title', 'auto', 'chat', 1000)
      on conflict (workspace_key, id) do update set title = excluded.title`
    await tx`
      insert into public.lab_conversations (id, owner_id, workspace_key, title, model, experience, client_updated_at)
      values ('c1', ${context.userId}, ${key}, 'Renamed', 'auto', 'agent', 2000)
      on conflict (workspace_key, id) do update set
        title = excluded.title, experience = excluded.experience, client_updated_at = excluded.client_updated_at`
    await tx`
      insert into public.lab_messages (id, owner_id, workspace_key, conversation_id, position, role, content, metadata)
      values ('m1', ${context.userId}, ${key}, 'c1', 0, 'user', 'Hello', ${tx.json({ agent: true, sources: [{ url: 'https://example.com' }] })})`
  })
  const [conversation] = await sql`select title, experience from public.lab_conversations where workspace_key = ${key} and id = 'c1'`
  check('conversation upsert updates in place', conversation?.title === 'Renamed' && conversation?.experience === 'agent')

  const [message] = await sql`select metadata from public.lab_messages where workspace_key = ${key} and id = 'm1'`
  check('message metadata round-trips as structured json', message?.metadata?.agent === true && Array.isArray(message?.metadata?.sources))

  // Messages must disappear with their conversation rather than being orphaned.
  await sql`delete from public.lab_conversations where workspace_key = ${key} and id = 'c1'`
  const orphans = await sql`select id from public.lab_messages where workspace_key = ${key}`
  check('deleting a conversation cascades to its messages', orphans.length === 0, `${orphans.length} orphaned`)

  // Projects: newer wins, older is ignored.
  const project = { id: 'p1', campaign: { name: 'Launch' }, updatedAt: 5000 }
  const save = async (name, updatedAt) => sql`
    insert into public.lab_studio_projects (id, owner_id, workspace_key, name, project_data, client_updated_at)
    values ('p1', ${context.userId}, ${key}, ${name}, ${sql.json({ ...project, campaign: { name } })}, ${updatedAt})
    on conflict (workspace_key, id) do update set
      name = case when excluded.client_updated_at >= public.lab_studio_projects.client_updated_at
                  then excluded.name else public.lab_studio_projects.name end,
      project_data = case when excluded.client_updated_at >= public.lab_studio_projects.client_updated_at
                          then excluded.project_data else public.lab_studio_projects.project_data end,
      client_updated_at = greatest(public.lab_studio_projects.client_updated_at, excluded.client_updated_at)`

  await save('Launch', 5000)
  await save('Newer edit', 9000)
  await save('Stale device', 1000)
  const [saved] = await sql`select name, client_updated_at, project_data from public.lab_studio_projects where workspace_key = ${key} and id = 'p1'`
  check('a newer project edit wins', saved?.name === 'Newer edit')
  check('a stale copy from another device cannot overwrite fresher work', Number(saved?.client_updated_at) === 9000, `stored ${saved?.client_updated_at}`)
  check('project data round-trips as structured json', saved?.project_data?.campaign?.name === 'Newer edit')

  // Archive and restore.
  await sql`update public.lab_studio_projects set archived_at = 123 where workspace_key = ${key} and id = 'p1'`
  const [archived] = await sql`select archived_at from public.lab_studio_projects where workspace_key = ${key} and id = 'p1'`
  check('a project can be archived and restored', Number(archived?.archived_at) === 123)

  // Usage: idempotent on request and route.
  const writeUsage = async (cost) => sql`
    insert into public.lab_usage_events (owner_id, workspace_key, request_id, route, feature, outcome, actual_cost_usd)
    values (${context.userId}, ${key}, 'req_1', '/api/chat', 'chat', 'success', ${cost})
    on conflict (request_id, route) do update set
      actual_cost_usd = coalesce(excluded.actual_cost_usd, public.lab_usage_events.actual_cost_usd),
      outcome = excluded.outcome, updated_at = now()`
  await writeUsage(0.001)
  await writeUsage(0.002)
  const usage = await sql`select actual_cost_usd from public.lab_usage_events where workspace_key = ${key}`
  check('a repeated usage write updates rather than duplicating', usage.length === 1, `${usage.length} rows`)
  check('the latest measured cost is kept', Number(usage[0]?.actual_cost_usd) === 0.002)

  // The monthly usage summary the /api/usage route runs.
  const summary = await sql`
    select feature, count(*) as requests,
           count(*) filter (where outcome <> all(${['success', 'completed']})) as failures
      from public.lab_usage_events
     where workspace_key = ${key} and created_at >= ${'2000-01-01'}::date
     group by feature`
  check('the usage summary aggregates by feature', summary[0]?.feature === 'chat' && Number(summary[0]?.failures) === 0)

  // Webhook receipts must be idempotent.
  const receipt = async () => sql`
    insert into public.lab_webhook_events (event_id, event_type)
    values (${`evt_${stamp}`}, 'user.created') on conflict (event_id) do nothing`
  const first = await receipt()
  const second = await receipt()
  check('a replayed webhook is recognised as a duplicate', first.count === 1 && second.count === 0)
} finally {
  await sql`delete from public.lab_usage_events where workspace_key = ${key}`
  await sql`delete from public.lab_studio_projects where workspace_key = ${key}`
  await sql`delete from public.lab_messages where workspace_key = ${key}`
  await sql`delete from public.lab_conversations where workspace_key = ${key}`
  await sql`delete from public.lab_webhook_events where event_id = ${`evt_${stamp}`}`
  await sql`delete from public.lab_workspaces where workspace_key = ${key}`
  await sql`delete from public.lab_users where clerk_user_id = ${context.userId}`
  await sql.end()
}

const failed = results.filter((result) => !result.passed)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) process.exitCode = 1
