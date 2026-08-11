import { config } from 'dotenv'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })
register('./alias-loader.mjs', pathToFileURL('./scripts/'))

const { createWorkspaceAuthContext } = await import('../src/lib/workspace.ts')
const { ensureWorkspaceRecord } = await import('../src/lib/workspace-db.ts')
const { getPostgres } = await import('../src/lib/postgres.ts')
const {
  addProjectFile, listProjectFiles, deleteProjectFile, getProjectKnowledge,
} = await import('../src/lib/studio/project-files.ts')

/**
 * Exercises the project knowledge base against the live database, using a
 * disposable workspace that is removed afterwards.
 */

const stamp = `pf${Date.now()}`
const context = createWorkspaceAuthContext({ userId: `user_${stamp}` })
const key = context.workspace.key
const projectId = `proj_${stamp}`
const sql = getPostgres()

const results = []
const check = (name, passed, detail = '') => {
  results.push({ name, passed })
  console.log(`${passed ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

try {
  await sql.begin(async (tx) => ensureWorkspaceRecord(tx, context))

  // A file cannot attach to a project that does not exist.
  let guarded = false
  try {
    await addProjectFile(context, { projectId, name: 'x.txt', mimeType: 'text/plain', sizeBytes: 3, extractedText: 'abc' })
  } catch (error) {
    guarded = error.message === 'PROJECT_NOT_FOUND'
  }
  check('a file cannot attach to a missing project', guarded)

  // Create the project the files belong to.
  await sql`
    insert into public.lab_studio_projects (id, owner_id, workspace_key, name, project_data, client_updated_at)
    values (${projectId}, ${context.userId}, ${key}, 'Knowledge test', ${sql.json({ id: projectId })}, 1000)`

  const first = await addProjectFile(context, {
    projectId, name: 'brand.md', mimeType: 'text/markdown', sizeBytes: 40,
    extractedText: 'Warm, plain, local. Never salesy.',
  })
  check('a text file is added and its length recorded', first.charCount === 'Warm, plain, local. Never salesy.'.length, `charCount=${first.charCount}`)

  await addProjectFile(context, {
    projectId, name: 'prices.csv', mimeType: 'text/csv', sizeBytes: 20,
    extractedText: 'item,price\ntea,20',
  })

  const files = await listProjectFiles(context, projectId)
  check('both files are listed for the project', files.length === 2, `${files.length} file(s)`)
  check('listing does not leak the raw text', files.every((f) => !('extractedText' in f)))

  const knowledge = await getProjectKnowledge(context, projectId)
  check('knowledge concatenates both files, labelled by name',
    knowledge.includes('--- brand.md ---') && knowledge.includes('--- prices.csv ---') && knowledge.includes('tea,20'))

  // Isolation: another workspace cannot see these files.
  const other = createWorkspaceAuthContext({ userId: `user_${stamp}_other` })
  await sql.begin(async (tx) => ensureWorkspaceRecord(tx, other))
  const leaked = await listProjectFiles(other, projectId)
  check('another workspace cannot read the files', leaked.length === 0)
  await sql`delete from public.lab_workspaces where workspace_key = ${other.workspace.key}`

  const removed = await deleteProjectFile(context, projectId, first.id)
  check('a file can be removed', removed === true)
  const afterDelete = await listProjectFiles(context, projectId)
  check('the removed file is gone', afterDelete.length === 1)

  // Deleting the project cascades to its remaining knowledge.
  await sql`delete from public.lab_studio_projects where workspace_key = ${key} and id = ${projectId}`
  const [{ n }] = await sql`select count(*)::int as n from public.lab_project_files where project_id = ${projectId}`
  check('deleting the project cascades to its files', n === 0, `${n} orphaned`)
} finally {
  await sql`delete from public.lab_workspaces where workspace_key = ${key}`
  await sql.end()
}

const failed = results.filter((r) => !r.passed)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) process.exitCode = 1
