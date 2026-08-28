import { dirname, resolve as resolvePath } from 'node:path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config } from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolvePath(here, '..')
config({ path: resolvePath(projectRoot, '.env.local'), quiet: true })
register(pathToFileURL(resolvePath(here, 'alias-loader.mjs')).href, pathToFileURL(projectRoot))

const { getPostgres } = await import('../src/lib/postgres.ts')
const sql = getPostgres()

const EMAILS = ['yawf4556@gmail.com', 'oforikelvin71@gmail.com']

for (const email of EMAILS) {
  console.log(`\n=== ${email} ===`)
  const [u] = await sql`
    select clerk_user_id, display_name from public.lab_users where lower(email) = ${email}`
  if (!u) { console.log('  no lab_users row'); continue }
  const wk = `user:${u.clerk_user_id}`
  console.log(`  workspace = ${wk}`)

  const [acct] = await sql`
    select available_credits, reserved_credits, allowance_credits, allowance_plan, allowance_period
      from public.lab_credit_accounts where workspace_key = ${wk}`
  if (!acct) { console.log('  no credit account'); continue }
  console.log(`  available=${acct.available_credits}  reserved=${acct.reserved_credits}  allowance=${acct.allowance_credits} (${acct.allowance_plan}, ${acct.allowance_period})`)

  const led = await sql`
    select entry_type, credits_delta, source_type, created_at
      from public.lab_credit_ledger where workspace_key = ${wk}
     order by created_at`
  console.log('  ledger:')
  for (const r of led) {
    console.log(`    ${r.created_at.toISOString().slice(0,16)}  ${String(r.entry_type).padEnd(12)} ${String(r.credits_delta).padStart(5)}  ${r.source_type ?? ''}`)
  }

  const [spend] = await sql`
    select coalesce(sum(cost_usd),0)::numeric usd, count(*) n
      from public.lab_cost_ledger where workspace_key = ${wk}`
  console.log(`  real provider spend: $${Number(spend.usd).toFixed(4)} over ${spend.n} calls`)
}

await sql.end({ timeout: 5 })
