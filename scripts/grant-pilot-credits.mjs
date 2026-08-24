import { readFile } from 'node:fs/promises'
import { register } from 'node:module'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config } from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolvePath(here, '..')

config({ path: resolvePath(projectRoot, '.env.local'), quiet: true })
config({ path: resolvePath(projectRoot, '.env'), quiet: true })
register(pathToFileURL(resolvePath(here, 'alias-loader.mjs')).href, pathToFileURL(projectRoot))

const {
  DEFAULT_PILOT_CREDITS,
  normalizePilotCohort,
  normalizePilotEmail,
  parsePilotCreditCsv,
  pilotGrantIdempotencyKey,
} = await import('../src/lib/billing/pilot-credits.ts')
const { grantCredits } = await import('../src/lib/billing/credit-repository.ts')
const { getPostgres } = await import('../src/lib/postgres.ts')
const { createWorkspaceAuthContext } = await import('../src/lib/workspace.ts')

const POSTGRES_TEXT_OID = 25
const USAGE = `
Grant sponsored credits to a private pilot cohort by registered account email.

Dry run (default; writes nothing):
  npm run credits:pilot -- --file <users.csv> --cohort <cohort>

Apply after reviewing the dry run:
  npm run credits:pilot -- --file <users.csv> --cohort <cohort> --apply

Options:
  --file <path>       CSV with an email column and optional credits column
  --cohort <name>     Stable label, for example pilot-2026-09
  --credits <number>  Default per user when the CSV cell is empty (default: ${DEFAULT_PILOT_CREDITS})
  --apply             Grant credits; without this flag the command is read-only
  --help              Show this help
`.trim()

function readOptions(argv) {
  const options = {
    file: '',
    cohort: '',
    credits: DEFAULT_PILOT_CREDITS,
    apply: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--apply') {
      options.apply = true
      continue
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    if (!['--file', '--cohort', '--credits'].includes(argument)) {
      throw new Error(`Unknown option: ${argument}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`)
    index += 1
    if (argument === '--file') options.file = value
    if (argument === '--cohort') options.cohort = value
    if (argument === '--credits') options.credits = value
  }
  return options
}

function printResolutionProblems(unmatched, ambiguous) {
  if (unmatched.length) {
    console.error('\nNot found (each user must register and sign in once first):')
    for (const row of unmatched) console.error(`  row ${row.rowNumber}: ${row.email}`)
  }
  if (ambiguous.length) {
    console.error('\nAmbiguous (more than one active account has this email):')
    for (const item of ambiguous) console.error(`  row ${item.row.rowNumber}: ${item.row.email}`)
  }
}

async function main() {
  let options
  try {
    options = readOptions(process.argv.slice(2))
    if (options.help) {
      console.log(USAGE)
      return 0
    }
    if (!options.file) throw new Error('--file is required')
    if (!options.cohort) throw new Error('--cohort is required')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.error(`\n${USAGE}`)
    return 2
  }

  const cohort = normalizePilotCohort(options.cohort)
  const csvPath = resolvePath(process.cwd(), options.file)
  const input = await readFile(csvPath, 'utf8')
  const pilotRows = parsePilotCreditCsv(input, { defaultCredits: options.credits })
  const emails = pilotRows.map((row) => row.email)
  const sql = getPostgres()

  try {
    const users = await sql`
      select u.clerk_user_id, u.email, u.display_name, a.available_credits
        from public.lab_users u
       left join public.lab_credit_accounts a
          on a.workspace_key = 'user:' || u.clerk_user_id
       where u.deleted_at is null
         and lower(btrim(u.email)) = any(${sql.array(emails, POSTGRES_TEXT_OID)})
       order by u.created_at desc`

    const usersByEmail = new Map()
    for (const user of users) {
      const email = normalizePilotEmail(user.email || '')
      const matches = usersByEmail.get(email) || []
      matches.push(user)
      usersByEmail.set(email, matches)
    }

    const unmatched = pilotRows.filter((row) => !usersByEmail.has(row.email))
    const ambiguous = pilotRows
      .map((row) => ({ row, users: usersByEmail.get(row.email) || [] }))
      .filter((item) => item.users.length > 1)
    if (unmatched.length || ambiguous.length) {
      printResolutionProblems(unmatched, ambiguous)
      console.error('\nNo credits were granted. Fix the list and run the preview again.')
      return 1
    }

    const totalCredits = pilotRows.reduce((sum, row) => sum + row.credits, 0)
    console.log(`\nPilot cohort: ${cohort}`)
    console.log(`Mode: ${options.apply ? 'APPLY' : 'DRY RUN'}`)
    console.log(`Users: ${pilotRows.length}`)
    console.log(`Credits scheduled: ${totalCredits}\n`)

    for (const row of pilotRows) {
      const [user] = usersByEmail.get(row.email)
      const available = Number(user.available_credits ?? 0)
      console.log(`  ${row.email}  ${available} -> ${available + row.credits} (+${row.credits})`)
    }

    if (!options.apply) {
      console.log('\nDry run complete. Nothing was changed. Re-run with --apply after reviewing this list.')
      return 0
    }

    let granted = 0
    let alreadyGranted = 0
    const failures = []
    console.log('')
    for (const row of pilotRows) {
      const [user] = usersByEmail.get(row.email)
      const context = createWorkspaceAuthContext({
        userId: user.clerk_user_id,
        email: user.email,
        displayName: user.display_name,
      })
      try {
        const result = await grantCredits({
          context,
          credits: row.credits,
          sourceType: 'sponsored_seat',
          sourceId: cohort,
          idempotencyKey: pilotGrantIdempotencyKey(cohort),
        })
        const [account] = await sql`
          select available_credits from public.lab_credit_accounts
           where workspace_key = ${context.workspace.key}`
        if (result.granted) {
          granted += 1
          console.log(`GRANTED  ${row.email}  balance ${Number(account?.available_credits ?? 0)}`)
        } else if (result.reason === 'already_granted') {
          alreadyGranted += 1
          console.log(`SKIPPED  ${row.email}  cohort already granted`)
        } else {
          failures.push({ email: row.email, reason: result.reason || 'unknown_error' })
          console.error(`FAILED   ${row.email}  ${result.reason || 'unknown_error'}`)
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        failures.push({ email: row.email, reason })
        console.error(`FAILED   ${row.email}  ${reason}`)
      }
    }

    console.log(`\nComplete: ${granted} granted, ${alreadyGranted} already granted, ${failures.length} failed.`)
    if (failures.length) {
      console.error('It is safe to retry: completed grants will be skipped for this cohort.')
      return 1
    }
    return 0
  } finally {
    await sql.end()
  }
}

try {
  process.exitCode = await main()
} catch (error) {
  console.error(`Pilot credit grant failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
