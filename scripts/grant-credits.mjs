import { config } from 'dotenv'
import { register } from 'node:module'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Paths are resolved from this file's own location, so the script works no
// matter which directory it is run from (`node scripts/grant-credits.mjs` or
// `cd scripts && node grant-credits.mjs`).
const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolvePath(here, '..')

config({ path: resolvePath(projectRoot, '.env.local'), quiet: true })
config({ path: resolvePath(projectRoot, '.env'), quiet: true })

register(pathToFileURL(resolvePath(here, 'alias-loader.mjs')).href, pathToFileURL(projectRoot))

const { createWorkspaceAuthContext } = await import('../src/lib/workspace.ts')
const { grantCredits, readBalance } = await import('../src/lib/billing/credit-repository.ts')
const { getPostgres } = await import('../src/lib/postgres.ts')

/**
 * Manually grant credits to a specific account for testing (no payment runs).
 *
 * Usage:
 *   node scripts/grant-credits.mjs <supabaseAuthUserId> <credits> [reason]
 *
 * The app keys every workspace by the Supabase auth user UUID (`user.id` from
 * `supabase.auth.getUser()`, stored in `lab_users.clerk_user_id`). Pass that
 * UUID — the same one the signed-in account resolves to at runtime — so the
 * grant lands on the right account.
 *
 * Example:
 *   node scripts/grant-credits.mjs efcc54e7-1692-4750-869f-1f212271e255 200 "video-testing-2026-08-15"
 *
 * The grant is idempotent: re-running with the same reason grants nothing
 * twice, so it is safe to retry. It lands as an `adjustment` ledger entry and
 * never touches the monthly allowance, exactly like a purchased top-up.
 */

const userId = process.argv[2]
const credits = Number(process.argv[3])
const reason = process.argv[4] || `manual-grant-${Date.now()}`

if (!userId || !Number.isFinite(credits) || credits <= 0) {
  console.error('usage: node scripts/grant-credits.mjs <supabaseAuthUserId> <credits> [reason]')
  process.exit(2)
}

const context = createWorkspaceAuthContext({ userId })
const sql = getPostgres()

try {
  const before = await readBalance(context)
  if (!before) {
    console.error('The credit ledger is not configured. Check DATABASE_URL / POSTGRES settings.')
    process.exitCode = 1
  } else {
    const result = await grantCredits({
      context,
      credits: Math.floor(credits),
      sourceType: 'adjustment',
      sourceId: reason,
      idempotencyKey: `manual:${reason}`,
    })

    const after = await readBalance(context)

    if (result.granted) {
      console.log(`granted ${Math.floor(credits)} credits to ${userId} (reason: ${reason})`)
      console.log(`balance: ${before.available} -> ${after?.available} available`)
    } else {
      console.log(`no grant applied (${result.reason}) — balance unchanged at ${after?.available} available`)
    }
  }
} finally {
  await sql.end()
}
