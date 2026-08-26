import { dirname, resolve as resolvePath } from 'node:path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config } from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolvePath(here, '..')

config({ path: resolvePath(projectRoot, '.env.local'), quiet: true })
config({ path: resolvePath(projectRoot, '.env'), quiet: true })
register(pathToFileURL(resolvePath(here, 'alias-loader.mjs')).href, pathToFileURL(projectRoot))

const { getPostgres } = await import('../src/lib/postgres.ts')
const { usdBudgetForCredits, FEATURE_WEIGHTS } = await import('../src/lib/billing/credits.ts')
const {
  readSpendCaps,
  decideSpend,
  parseBudgetSince,
  budgetConfigIncomplete,
  BUDGET_SINCE_ENV,
} = await import('../src/lib/billing/spend-cap-policy.ts')

/**
 * Read-only check of the spend circuit breaker.
 *
 * Writes nothing. It proves the ledger query runs, that its day window is a
 * real UTC day on this connection, that the supporting indexes exist, and that
 * today's spend is inside the configured ceilings.
 */

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

const REQUIRED_INDEXES = [
  'idx_lab_usage_cost_created',
  'idx_lab_usage_cost_owner_created',
  'idx_lab_media_jobs_cost_workspace_occurred',
  'idx_lab_media_jobs_cost_owner_occurred',
]

async function main() {
  const sql = getPostgres()
  try {
    const caps = readSpendCaps(process.env)
    console.log('\nConfigured ceilings (USD):')
    for (const [scope, cap] of Object.entries(caps)) {
      const window = scope === 'budget' ? 'cumulative' : 'per day'
      console.log(`  ${scope.padEnd(12)} ${(cap === null ? 'off' : `$${cap}`).padEnd(10)} ${window}`)
    }
    console.log('')

    // A per-scope ceiling below the dearest single request refuses that request
    // every time, for everyone, permanently — the cap would read as "video is
    // broken" rather than as a budget decision. Catch it here, not in support.
    const dearest = usdBudgetForCredits(FEATURE_WEIGHTS.video.ceiling)
    for (const scope of ['workspace', 'user', 'application']) {
      const cap = caps[scope]
      if (cap === null) continue
      check(
        `${scope} ceiling admits the dearest single request`,
        cap > dearest,
        cap > dearest ? `$${cap} > $${dearest.toFixed(3)}` : `$${cap} would always refuse a full-length video ($${dearest.toFixed(3)})`,
      )
    }

    const [view] = await sql`
      select count(*)::int as present from pg_views
       where schemaname = 'public' and viewname = 'lab_cost_ledger'`
    check('lab_cost_ledger view exists', view.present === 1)

    const indexes = await sql`
      select indexname from pg_indexes
       where schemaname = 'public' and indexname = any(${REQUIRED_INDEXES})`
    const present = new Set(indexes.map((row) => row.indexname))
    for (const name of REQUIRED_INDEXES) {
      check(`index ${name}`, present.has(name), present.has(name) ? '' : '(apply 0027_spend_caps.sql)')
    }

    // The boundary must be a real UTC day regardless of the session time zone.
    const [window] = await sql`
      select date_trunc('day', now() at time zone 'utc') at time zone 'utc' as day_start,
             current_setting('TimeZone') as session_tz`
    const dayStart = new Date(window.day_start)
    const expected = new Date(Date.UTC(
      new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(),
    ))
    check(
      'day window is a real UTC midnight',
      Math.abs(dayStart.getTime() - expected.getTime()) < 1000,
      `session TimeZone=${window.session_tz} start=${dayStart.toISOString()}`,
    )

    const [totals] = await sql`
      select
        coalesce((select sum(cost_usd) from public.lab_cost_ledger
                   where occurred_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'), 0)::numeric as today_usd,
        coalesce((select sum(cost_usd) from public.lab_cost_ledger), 0)::numeric as all_time_usd,
        (select count(*)::int from public.lab_cost_ledger) as rows_all_time`
    const todayUsd = Number(totals.today_usd)
    check('application spend query runs', Number.isFinite(todayUsd),
      `today=$${todayUsd.toFixed(4)} all-time=$${Number(totals.all_time_usd).toFixed(4)} rows=${totals.rows_all_time}`)

    // The programme budget: the number an operator actually watches.
    const since = parseBudgetSince(process.env[BUDGET_SINCE_ENV])
    const incomplete = budgetConfigIncomplete(process.env)
    check('budget configuration is complete', !incomplete, incomplete || '')

    let budgetUsd = 0
    if (since) {
      const [budget] = await sql`
        select coalesce(sum(cost_usd), 0)::numeric as spent_usd
          from public.lab_cost_ledger
         where occurred_at >= ${since.toISOString()}::timestamptz`
      budgetUsd = Number(budget.spent_usd)
      const cap = caps.budget
      const pct = cap ? Math.round((budgetUsd / cap) * 100) : 0
      console.log('')
      console.log(`PROGRAMME BUDGET since ${since.toISOString().slice(0, 10)}`)
      console.log(`  spent     : $${budgetUsd.toFixed(4)}`)
      console.log(`  ceiling   : ${cap ? `$${cap}` : 'not enforced'}`)
      if (cap) {
        const bars = Math.min(40, Math.max(0, Math.round((budgetUsd / cap) * 40)))
        console.log(`  remaining : $${Math.max(0, cap - budgetUsd).toFixed(4)}  (${pct}% used)`)
        console.log(`  [${'#'.repeat(bars)}${'.'.repeat(40 - bars)}]`)
      }
      console.log('')
      if (cap) {
        check('programme budget has headroom', budgetUsd < cap,
          budgetUsd < cap ? `${pct}% used` : 'BUDGET REACHED — expensive work is being refused')
        if (budgetUsd >= cap * 0.8 && budgetUsd < cap) {
          console.log('WARN  Budget is 80% or more consumed. Top up the provider account or narrow further invitations.')
        }
      }
    } else {
      console.log('\nNo programme budget is being enforced (set AI360_SPEND_CAP_TOTAL_USD and AI360_SPEND_CAP_SINCE).\n')
    }

    const decision = decideSpend({
      caps,
      spent: { budget: budgetUsd, application: todayUsd, workspace: 0, user: 0 },
      projectedUsd: 0,
    })
    check('today is inside every platform ceiling', decision.allowed,
      decision.allowed ? '' : `${decision.scope}: spent $${decision.spentUsd.toFixed(4)} of $${decision.capUsd}`)

    // Top spenders today, so an operator can see who a cap would bite first.
    const spenders = await sql`
      select workspace_key, round(sum(cost_usd), 4) as usd
        from public.lab_cost_ledger
       where occurred_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
         and workspace_key is not null
       group by workspace_key order by sum(cost_usd) desc limit 5`
    if (spenders.length) {
      console.log('\nTop workspaces today:')
      for (const row of spenders) {
        const over = caps.workspace !== null && Number(row.usd) > caps.workspace
        console.log(`  ${row.workspace_key}  $${row.usd}${over ? '  <-- over the workspace cap' : ''}`)
      }
    } else {
      console.log('\nNo recorded provider spend today.')
    }

    const failed = checks.filter((entry) => !entry.ok)
    console.log(`\n${checks.length - failed.length}/${checks.length} checks pass.`)
    if (failed.length) {
      console.error('Spend caps are not fully verified. Nothing was changed.')
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
  console.error(`Spend cap verification failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
