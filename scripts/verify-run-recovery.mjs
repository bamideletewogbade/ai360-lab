import { config } from 'dotenv'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

register('./alias-loader.mjs', pathToFileURL('./scripts/'))

const { createWorkspaceAuthContext } = await import('../src/lib/workspace.ts')
const { openRun, saveProgress, saveResult, setRunStatus, loadRun } = await import('../src/lib/agent/store.ts')
const { getPostgres } = await import('../src/lib/postgres.ts')

/**
 * Proves a run survives the connection that started it: progress and the
 * finished answer are readable afterwards by the workspace that owns it, and
 * by nobody else.
 */

const stamp = `recover${Date.now()}`
const context = createWorkspaceAuthContext({ userId: `user_${stamp}` })
const stranger = createWorkspaceAuthContext({ userId: `user_${stamp}x` })
const sql = getPostgres()

const results = []
const check = (name, passed, detail = '') => {
  results.push({ name, passed })
  console.log(`${passed ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

try {
  await sql`insert into public.lab_users (clerk_user_id) values (${context.userId}) on conflict do nothing`
  await sql`
    insert into public.lab_workspaces (workspace_key, workspace_type, subject_id, created_by_user_id)
    values (${context.workspace.key}, 'user', ${context.workspace.subjectId}, ${context.userId})
    on conflict do nothing`

  const handle = await openRun({
    context,
    runId: `run_${stamp}`,
    goal: 'What does GhIPSS do?',
    coordinatorModel: 'test/model',
    maxCostUsd: 0.05,
    maxDurationMs: 150_000,
  })
  check('a run is written durably the moment it starts', handle.persisted === true)

  // Nothing has finished yet, which is what a client reconnecting mid-run sees.
  await saveProgress(handle, {
    steps: [
      { id: 'plan', label: 'Plan ready', status: 'complete' },
      { id: 'task_1', label: 'Researching', status: 'active' },
    ],
    plan: { objectives: ['What GhIPSS does'], depth: 'quick', awaitingApproval: false, estimatedCredits: 5 },
  })
  const midRun = await loadRun(context.workspace.key, `run_${stamp}`)
  check('progress is readable while the run is still going', midRun?.steps?.length === 2, `${midRun?.steps?.length} steps`)
  check('the plan survives the connection too', midRun?.plan?.objectives?.[0] === 'What GhIPSS does')
  check('an unfinished run reports no answer yet', midRun?.content === null && midRun?.status === 'planning')

  // The connection died here. The run carried on and finished.
  await saveResult(handle, {
    content: 'GhIPSS runs Ghana national payment infrastructure.',
    sources: [{ url: 'https://ghipss.net', title: 'GhIPSS' }],
    usage: { totalTokens: 812, cost: 0.0063 },
  })
  await setRunStatus(handle, 'completed', { actualCostUsd: 0.0063 })

  const recovered = await loadRun(context.workspace.key, `run_${stamp}`)
  check('the answer is there after the connection died', Boolean(recovered?.content), `${recovered?.content?.length ?? 0} chars`)
  check('the run reports itself finished', recovered?.status === 'completed')
  check('sources survive', recovered?.sources?.[0]?.url === 'https://ghipss.net')
  check('cost survives, so the charge can still be reconciled', recovered?.usage?.cost === 0.0063)

  // A run id is not a capability. Another workspace must not be able to read it.
  const leaked = await loadRun(stranger.workspace.key, `run_${stamp}`)
  check('another workspace cannot read the run even knowing its id', leaked === null)

  const missing = await loadRun(context.workspace.key, 'run_does_not_exist')
  check('an unknown run returns nothing rather than an error', missing === null)
} finally {
  await sql`delete from public.lab_agent_runs where workspace_key = ${context.workspace.key}`
  await sql`delete from public.lab_workspaces where workspace_key = ${context.workspace.key}`
  await sql`delete from public.lab_users where clerk_user_id = ${context.userId}`
  await sql.end()
}

const failed = results.filter((result) => !result.passed)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) process.exitCode = 1
