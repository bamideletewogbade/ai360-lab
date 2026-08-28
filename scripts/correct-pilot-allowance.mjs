import { dirname, resolve as resolvePath } from 'node:path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config } from 'dotenv'
import crypto from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolvePath(here, '..')
config({ path: resolvePath(projectRoot, '.env.local'), quiet: true })
config({ path: resolvePath(projectRoot, '.env'), quiet: true })
register(pathToFileURL(resolvePath(here, 'alias-loader.mjs')).href, pathToFileURL(projectRoot))

/**
 * Brings a participant granted under an earlier policy down to the current
 * pilot allowance.
 *
 * Two people claimed their invitation while the code still handed out the full
 * commercial Everyday allowance of 120 credits. Current policy is
 * `PILOT_INITIAL_CREDITS`. Left alone they hold twelve times what everyone else
 * does, which distorts the one number the pilot exists to measure.
 *
 * The reduction is written twice, in the transaction that moves the balance:
 * to `lab_credit_ledger` as an `adjustment` with a negative delta, which is the
 * authoritative append-only record of the balance, and to
 * `lab_admin_audit_events` as a `credit_adjustment`, which is the record of who
 * did it and why.
 *
 * That second row needs migration 0029. Before it, the audit table constrained
 * `credits_delta > 0` and its `action` to `credit_grant` / `credit_refund` —
 * the product was built assuming an operator could only ever add credits, so a
 * correction had nowhere honest to go.
 *
 * Refuses to take credits somebody has already spent or reserved.
 *
 *   node scripts/correct-pilot-allowance.mjs            # preview, writes nothing
 *   node scripts/correct-pilot-allowance.mjs --apply    # perform the correction
 */

const { PILOT_INITIAL_CREDITS } = await import('../src/lib/billing/pilot-policy.ts')
const { getPostgres } = await import('../src/lib/postgres.ts')

const apply = process.argv.includes('--apply')
const TARGET = PILOT_INITIAL_CREDITS
const REASON = `Correct pre-policy pilot grant down to the agreed ${TARGET}-credit allowance`
const EMAILS = ['yawf4556@gmail.com', 'oforikelvin71@gmail.com']
const OPERATOR_EMAIL = 'accrainnovationcenter@gmail.com'

const sql = getPostgres()

const [operator] = await sql`
  select clerk_user_id from public.lab_users where lower(email) = ${OPERATOR_EMAIL}`
if (!operator) {
  console.error(`Operator ${OPERATOR_EMAIL} not found.`)
  process.exitCode = 1
} else {
  const requestId = `manual-correction-${new Date().toISOString().slice(0, 10)}`
  console.log(`${apply ? 'APPLYING' : 'PREVIEW (nothing will be written)'}`)
  console.log(`  target allowance : ${TARGET} credits`)
  console.log(`  operator         : ${operator.clerk_user_id}`)
  console.log(`  reason           : ${REASON}\n`)

  for (const email of EMAILS) {
    const [user] = await sql`
      select clerk_user_id from public.lab_users where lower(email) = ${email}`
    if (!user) { console.log(`  ${email}: no account, skipped\n`); continue }
    const workspaceKey = `user:${user.clerk_user_id}`
    // Scoped to the workspace and the target, so re-running is a no-op rather
    // than a second reduction.
    const idempotencyKey = `pilot-allowance-correction:${workspaceKey}:${TARGET}`

    const result = await sql.begin(async (tx) => {
      const [done] = await tx`
        select id from public.lab_credit_ledger where idempotency_key = ${idempotencyKey} limit 1`
      if (done) return { status: 'already_corrected' }

      const [account] = await tx`
        select available_credits, reserved_credits, allowance_credits, allowance_plan
          from public.lab_credit_accounts where workspace_key = ${workspaceKey} for update`
      if (!account) return { status: 'no_credit_account' }

      const available = Number(account.available_credits)
      const reserved = Number(account.reserved_credits)
      const spendable = available - reserved

      if (available <= TARGET) {
        return { status: 'already_at_or_below', available }
      }
      // Never claw back what is already committed to work in flight. If a
      // reservation is open, the most that can be removed is what sits above it.
      const removal = Math.min(available - TARGET, Math.max(0, spendable - 0))
      if (removal <= 0) return { status: 'blocked_by_reservations', available, reserved }

      const balanceAfter = available - removal

      if (!apply) {
        return { status: 'would_correct', available, reserved, removal, balanceAfter }
      }

      await tx`
        update public.lab_credit_accounts
           set available_credits = ${balanceAfter},
               allowance_credits = ${TARGET},
               version = version + 1,
               updated_at = now()
         where workspace_key = ${workspaceKey}`

      await tx`
        insert into public.lab_credit_ledger
          (workspace_key, entry_type, credits_delta, balance_after, source_type,
           source_id, idempotency_key, metadata)
        values (${workspaceKey}, 'adjustment', ${-removal}, ${balanceAfter},
                'adjustment', 'pilot-main', ${idempotencyKey},
                ${tx.json({
                  correction: 'pre_policy_sponsored_grant',
                  previousAvailable: available,
                  previousAllowance: Number(account.allowance_credits),
                  newAllowance: TARGET,
                })})`

      // Who did this, and why. Signed delta: the change as it happened.
      await tx`
        insert into public.lab_admin_audit_events
          (id, actor_id, target_workspace_key, action, credits_delta, balance_before,
           balance_after, reason, request_id, idempotency_key, metadata)
        values (${`adm_${crypto.randomUUID()}`}, ${operator.clerk_user_id}, ${workspaceKey},
                'credit_adjustment', ${-removal}, ${available}, ${balanceAfter},
                ${REASON}, ${requestId}, ${idempotencyKey},
                ${tx.json({
                  correction: 'pre_policy_sponsored_grant',
                  previousAllowance: Number(account.allowance_credits),
                  newAllowance: TARGET,
                })})
        on conflict (idempotency_key) do nothing`

      return { status: 'corrected', available, reserved, removal, balanceAfter }
    })

    const line = `  ${email.padEnd(30)}`
    switch (result.status) {
      case 'would_correct':
        console.log(`${line} ${result.available} -> ${result.balanceAfter}  (remove ${result.removal})`)
        break
      case 'corrected':
        console.log(`${line} ${result.available} -> ${result.balanceAfter}  (removed ${result.removal})  DONE`)
        break
      case 'already_corrected':
        console.log(`${line} already corrected, nothing to do`)
        break
      case 'already_at_or_below':
        console.log(`${line} holds ${result.available}, at or below target, left alone`)
        break
      case 'blocked_by_reservations':
        console.log(`${line} BLOCKED: ${result.available} available but ${result.reserved} reserved for work in flight`)
        break
      default:
        console.log(`${line} ${result.status}`)
    }
  }

  if (!apply) console.log('\nRe-run with --apply to perform this.')
}

await sql.end({ timeout: 5 })
