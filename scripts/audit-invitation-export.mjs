import { existsSync, readFileSync } from 'node:fs'
import { register } from 'node:module'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config } from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolvePath(here, '..')
const envFile = process.env.AI360_ENV_FILE
  || (existsSync(resolvePath(projectRoot, '.env.local')) ? '.env.local' : 'ai360-production.env')
config({ path: resolvePath(projectRoot, envFile), quiet: true })
register(pathToFileURL(resolvePath(here, 'alias-loader.mjs')).href, pathToFileURL(projectRoot))

const { parseParticipantList } = await import('../src/lib/admin/participant-import.ts')
const { classifyImportRows } = await import('../src/lib/admin/invitations.ts')
const { getPostgres } = await import('../src/lib/postgres.ts')

const files = process.argv.slice(2)
if (!files.length) {
  console.error('Usage: node --experimental-strip-types scripts/audit-invitation-export.mjs <csv> [csv...]')
  process.exit(2)
}

const exported = new Map()
for (const file of files) {
  const parsed = parseParticipantList(readFileSync(file, 'utf8'))
  for (const row of parsed.rows) exported.set(row.email, row)
}

const sql = getPostgres()
try {
  const emails = [...exported.keys()]
  const preview = await classifyImportRows({
    format: 'csv', truncated: false, rows: [...exported.values()], issues: [],
  }, 'pilot')
  const invitations = emails.length
    ? await sql`
        select email, display_name, invite_status, send_attempts, starting_credits,
               cohort_key, sent_at, accepted_at
          from public.lab_admin_invitations
         where program_key = 'pilot' and email = any(${emails})
         order by email`
    : []
  const users = emails.length
    ? await sql`
        select lower(email) as email
          from public.lab_users
         where deleted_at is null and lower(email) = any(${emails})`
    : []

  const byStatus = Object.fromEntries(
    [...new Set(invitations.map((row) => row.invite_status))]
      .sort()
      .map((status) => [status, invitations.filter((row) => row.invite_status === status).length]),
  )
  const missingNames = invitations.filter((row) => !row.display_name?.trim())
  const differentNames = invitations.filter((row) => {
    const source = exported.get(row.email)?.displayName?.trim() || ''
    const stored = row.display_name?.trim() || ''
    return source && stored && source !== stored
  })

  console.log(JSON.stringify({
    exportedUnique: emails.length,
    existingInvitations: invitations.length,
    missingInvitations: emails.length - invitations.length,
    existingUsers: new Set(users.map((row) => row.email)).size,
    missingStoredNames: missingNames.length,
    differingStoredNames: differentNames.length,
    sendAttempts: Object.fromEntries(
      [...new Set(invitations.map((row) => Number(row.send_attempts || 0)))]
        .sort((a, b) => a - b)
        .map((attempts) => [attempts, invitations.filter((row) => Number(row.send_attempts || 0) === attempts).length]),
    ),
    startingCredits: Object.fromEntries(
      [...new Set(invitations.map((row) => Number(row.starting_credits || 0)))]
        .sort((a, b) => a - b)
        .map((credits) => [credits, invitations.filter((row) => Number(row.starting_credits || 0) === credits).length]),
    ),
    statuses: byStatus,
    currentImportPreview: {
      newInvitations: preview.ready.length,
      missingNamesToRepair: preview.updates.length,
      setAside: preview.skipped.length,
      counts: preview.counts,
    },
  }, null, 2))
} finally {
  await sql.end()
}
