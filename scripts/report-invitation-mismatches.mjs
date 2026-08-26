import { existsSync } from 'node:fs'
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

const { readInvitationMismatches } = await import('../src/lib/admin/invitations.ts')
const { getPostgres } = await import('../src/lib/postgres.ts')

/**
 * Read-only. Lists people who followed an invitation, signed in, and were never
 * claimed — so nobody is quietly left with an empty account for four weeks.
 *
 *   npm run invite:mismatches
 */

const programKey = process.argv[2] || 'pilot'

async function main() {
  const sql = getPostgres()
  try {
    const { ready, mismatches } = await readInvitationMismatches(programKey)
    if (!ready) {
      console.log('\nInvitation or funnel tables are missing. Apply migrations 0026 and 0028.')
      return 1
    }
    if (!mismatches.length) {
      console.log(`\nNo stranded invitations in programme "${programKey}". Everyone who clicked was claimed.`)
      return 0
    }

    const healing = mismatches.filter((row) => row.sameMailbox)
    const stuck = mismatches.filter((row) => !row.sameMailbox)

    console.log(`\n${mismatches.length} invitation(s) clicked but never claimed\n`)

    if (healing.length) {
      console.log('SELF-HEALING — the claim now resolves these; they land on the next sign-in:')
      for (const row of healing) {
        console.log(`  invited ${row.invitedEmail}`)
        console.log(`  signed in as ${row.signedInEmail}   (${row.startingCredits} credits waiting)`)
        console.log(`  last seen ${row.lastSeenAt}\n`)
      }
    }

    if (stuck.length) {
      console.log('NEEDS AN OPERATOR — genuinely different mailboxes, no safe automatic match:')
      for (const row of stuck) {
        console.log(`  invited   ${row.invitedEmail}`)
        console.log(`  signed in ${row.signedInEmail}  ${row.displayName ? `(${row.displayName})` : ''}`)
        console.log(`  cohort    ${row.cohortKey || '—'}   credits owed: ${row.startingCredits}`)
        console.log(`  user id   ${row.userId}`)
        console.log(`  last seen ${row.lastSeenAt}\n`)
      }
      console.log('  To resolve each: in /admin grant the credits to the account they actually')
      console.log('  used, set their programme membership, then withdraw the stale invitation.')
    }

    return 0
  } finally {
    await sql.end()
  }
}

try {
  process.exitCode = await main()
} catch (error) {
  console.error(`Mismatch report failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
