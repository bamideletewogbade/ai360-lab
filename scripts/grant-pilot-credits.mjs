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
const { grantSponsoredEntitlement } = await import('../src/lib/billing/sponsored-entitlement.ts')
const {
  DEFAULT_SPONSORED_DAYS,
  MAX_SPONSORED_DAYS,
  explainSponsoredRefusal,
} = await import('../src/lib/billing/sponsored-entitlement-policy.ts')
const { findBillingPlan } = await import('../src/lib/billing/catalog.ts')
const { getPostgres } = await import('../src/lib/postgres.ts')
const { createWorkspaceAuthContext } = await import('../src/lib/workspace.ts')

const USAGE = `
Grant sponsored credits to a private pilot cohort by registered account email.

Dry run (default; writes nothing):
  npm run credits:pilot -- --file <users.csv> --cohort <cohort>

Apply after reviewing the dry run:
  npm run credits:pilot -- --file <users.csv> --cohort <cohort> --apply

Sponsor a plan tier instead of a bare credit balance:
  npm run credits:pilot -- --file <users.csv> --cohort <cohort> --entitlement everyday --apply

Options:
  --file <path>          CSV with an email column and optional credits column
  --cohort <name>        Stable label, for example pilot-2026-09
  --credits <number>     Default per user when the CSV cell is empty (default: ${DEFAULT_PILOT_CREDITS}).
                         Ignored with --entitlement, which grants the plan allowance.
  --entitlement <plan>   Place each user on a plan without a payment: explorer,
                         everyday or builder. Grants that plan's included credits
                         AND its daily chat cap. Without this, a user keeps the
                         Explorer cap of 10 chat messages a day and the granted
                         credits meter away on chat overflow.
  --days <number>        How long sponsored access runs (default: ${DEFAULT_SPONSORED_DAYS}, max: ${MAX_SPONSORED_DAYS})
  --apply                Grant credits; without this flag the command is read-only
  --help                 Show this help
`.trim()

function readOptions(argv) {
  const options = {
    file: '',
    cohort: '',
    credits: DEFAULT_PILOT_CREDITS,
    entitlement: '',
    days: DEFAULT_SPONSORED_DAYS,
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
    if (!['--file', '--cohort', '--credits', '--entitlement', '--days'].includes(argument)) {
      throw new Error(`Unknown option: ${argument}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`)
    index += 1
    if (argument === '--file') options.file = value
    if (argument === '--cohort') options.cohort = value
    if (argument === '--credits') options.credits = value
    if (argument === '--entitlement') options.entitlement = value.trim().toLowerCase()
    if (argument === '--days') {
      const days = Number(value)
      if (!Number.isSafeInteger(days) || days < 1 || days > MAX_SPONSORED_DAYS) {
        throw new Error(`--days must be a whole number between 1 and ${MAX_SPONSORED_DAYS}`)
      }
      options.days = days
    }
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
    if (options.entitlement) {
      const plan = findBillingPlan(options.entitlement)
      if (!plan) throw new Error(`--entitlement must name a catalogue plan, not "${options.entitlement}"`)
      if (plan.workspace !== 'personal') {
        throw new Error(`${plan.name} is an organization plan and cannot be sponsored onto a personal workspace`)
      }
    }
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
         and lower(btrim(u.email)) in ${sql(emails)}
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

    const sponsoredPlan = options.entitlement ? findBillingPlan(options.entitlement) : null
    const perUserCredits = (row) => (sponsoredPlan ? sponsoredPlan.includedCredits : row.credits)
    const totalCredits = pilotRows.reduce((sum, row) => sum + perUserCredits(row), 0)

    console.log(`\nPilot cohort: ${cohort}`)
    console.log(`Mode: ${options.apply ? 'APPLY' : 'DRY RUN'}`)
    console.log(`Users: ${pilotRows.length}`)
    if (sponsoredPlan) {
      console.log(`Entitlement: ${sponsoredPlan.name} for ${options.days} days (no payment taken)`)
      console.log(`Allowance:   ${sponsoredPlan.includedCredits} credits each, replacing any current allowance`)
      console.log('Note:        --credits is ignored; the plan allowance is the grant.')
    } else {
      console.log('Entitlement: none — users stay on Explorer (10 chat messages a day).')
      console.log('             Pass --entitlement everyday so granted credits are')
      console.log('             spent on real work instead of chat overflow.')
    }
    console.log(`Credits scheduled: ${totalCredits}\n`)

    for (const row of pilotRows) {
      const [user] = usersByEmail.get(row.email)
      const available = Number(user.available_credits ?? 0)
      const credits = perUserCredits(row)
      console.log(`  ${row.email}  ${available} -> ${available + credits} (+${credits})`)
    }
    if (sponsoredPlan) {
      console.log('\n  Balances above ignore allowance replacement: any unspent Explorer')
      console.log('  allowance is withdrawn first, exactly as a paid activation does.')
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
        const result = sponsoredPlan
          ? await grantSponsoredEntitlement({
            context,
            cohort,
            planSlug: sponsoredPlan.slug,
            periodDays: options.days,
          })
          : await grantCredits({
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
          const suffix = sponsoredPlan ? `  ${sponsoredPlan.name} until ${result.periodEnd.slice(0, 10)}` : ''
          console.log(`GRANTED  ${row.email}  balance ${Number(account?.available_credits ?? 0)}${suffix}`)
        } else if (result.reason === 'already_granted') {
          alreadyGranted += 1
          console.log(`SKIPPED  ${row.email}  cohort already granted`)
        } else {
          const reason = result.reason || 'unknown_error'
          // A policy refusal is an operator decision, not a crash: say what it
          // means rather than printing the enum and leaving them to guess.
          const detail = sponsoredPlan ? explainSponsoredRefusal(reason) : ''
          failures.push({ email: row.email, reason })
          console.error(`FAILED   ${row.email}  ${reason}${detail ? `  — ${detail}` : ''}`)
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
