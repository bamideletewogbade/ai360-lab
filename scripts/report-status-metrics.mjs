import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import postgres from 'postgres'

/**
 * Aggregate-only facts for a status report: how many accounts, how much work,
 * whether money has moved. Counts only — no names, no message content, nothing
 * that identifies a person.
 *
 *   node scripts/report-status-metrics.mjs [envFile]
 */

const envFile = process.argv[2]
  || (existsSync('ai360-production.env') ? 'ai360-production.env' : '.env.local')
config({ path: envFile, quiet: true })
console.log(`Environment: ${envFile}\n`)

const sql = postgres(process.env.DATABASE_URL, {
  max: 1, prepare: false, ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
})

const count = async (table, where = sql``) => {
  const [row] = await sql.unsafe(`select count(*)::int as total from public.${table}`)
  void where
  return row.total
}

try {
  for (const table of [
    'lab_users', 'lab_workspaces', 'lab_conversations', 'lab_messages',
    'lab_studio_projects', 'lab_agent_runs', 'lab_media_jobs', 'lab_assets',
    'lab_payment_attempts', 'lab_subscriptions', 'lab_billing_customers',
    'lab_credit_accounts', 'lab_quality_reports',
  ]) {
    console.log(`${table.replace('lab_', '').padEnd(20)} ${await count(table)}`)
  }

  console.log('\n--- accounts over time ---')
  const signups = await sql`
    select to_char(created_at, 'YYYY-MM-DD') as day, count(*)::int as total
      from public.lab_users group by day order by day desc limit 10`
  for (const row of signups) console.log(`  ${row.day}  ${row.total}`)

  console.log('\n--- payments ---')
  const payments = await sql`
    select status, count(*)::int as total, coalesce(sum(amount_minor), 0) as minor
      from public.lab_payment_attempts group by status order by total desc`
  console.log(payments.length
    ? payments.map((row) => `  ${row.status.padEnd(12)} ${row.total} attempt(s), ${row.minor} minor units`).join('\n')
    : '  no payment attempts recorded')

  console.log('\n--- subscriptions ---')
  const subs = await sql`
    select plan_slug, status, count(*)::int as total
      from public.lab_subscriptions group by plan_slug, status order by total desc`
  console.log(subs.length
    ? subs.map((row) => `  ${row.plan_slug} ${row.status}: ${row.total}`).join('\n')
    : '  none')

  console.log('\n--- credits in circulation ---')
  const [creditRow] = await sql`
    select coalesce(sum(available_credits), 0)::int as available,
           coalesce(sum(reserved_credits), 0)::int as reserved,
           count(*)::int as accounts
      from public.lab_credit_accounts`
  console.log(`  ${creditRow.accounts} accounts, ${creditRow.available} available, ${creditRow.reserved} held`)

  console.log('\n--- work produced ---')
  const work = await sql`
    select media_type, status, count(*)::int as total
      from public.lab_media_jobs group by media_type, status order by total desc`
  console.log(work.length
    ? work.map((row) => `  ${row.media_type} ${row.status}: ${row.total}`).join('\n')
    : '  none')

  console.log('\n--- provider spend to date (measured) ---')
  const [spend] = await sql`
    select round(coalesce(sum(cost_usd), 0)::numeric, 4) as usd,
           count(*)::int as events,
           min(occurred_at) as first_event, max(occurred_at) as last_event
      from public.lab_cost_ledger`
  console.log(`  $${spend.usd} across ${spend.events} charged events`)
  console.log(`  from ${spend.first_event?.toISOString?.() ?? '-'} to ${spend.last_event?.toISOString?.() ?? '-'}`)
} finally {
  await sql.end()
}
