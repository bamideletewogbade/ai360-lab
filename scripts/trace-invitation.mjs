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

const { getPostgres } = await import('../src/lib/postgres.ts')

/**
 * Follows one invited person through every stage, read-only.
 *
 * A test invitation touches seven systems: the invitation row, the delivery
 * ledger, Resend, Supabase Auth, the claim, the credit grant and the funnel.
 * "Did it work?" has seven different answers, and reading them one table at a
 * time is how a broken link gets mistaken for a broken mailbox.
 *
 *   npm run invite:trace -- bamstewo@gmail.com
 */

const email = (process.argv[2] || '').trim().toLowerCase()
if (!email || !email.includes('@')) {
  console.error('Usage: npm run invite:trace -- <email address>')
  process.exit(2)
}

function iso(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().replace('T', ' ').slice(0, 19)
}
function line(label, value, hint = '') {
  const shown = value === null || value === undefined || value === '' ? '—' : String(value)
  console.log(`  ${String(label).padEnd(22)} ${shown}${hint ? `   ${hint}` : ''}`)
}
function stage(n, title) {
  console.log(`\n${n}. ${title}`)
}

async function main() {
  const sql = getPostgres()
  try {
    console.log(`\nTracing ${email}   (env: ${envFile})`)
    console.log('='.repeat(64))

    // 1 — the invitation itself
    stage(1, 'Invitation record')
    const [invite] = await sql`
      select id, program_key, cohort_key, display_name, participation_status,
             starting_credits, invite_status, claimed_user_id, import_key,
             sent_at, accepted_at, last_attempt_at, send_attempts, created_at
        from public.lab_admin_invitations
       where email = ${email}
       order by created_at desc limit 1`
    if (!invite) {
      line('found', 'NO — no invitation exists for this address')
      console.log('\n   Import the address in /admin -> Participants before sending.')
      return 1
    }
    line('id', invite.id)
    line('program / cohort', `${invite.program_key} / ${invite.cohort_key || '—'}`)
    line('status', invite.invite_status,
      invite.invite_status === 'pending' ? '(never sent, or the last send failed)' : '')
    line('starting credits', invite.starting_credits)
    line('send attempts', invite.send_attempts)
    line('sent at', iso(invite.sent_at))
    line('accepted at', iso(invite.accepted_at))

    // 2 — the delivery ledger
    stage(2, 'Delivery attempts')
    const events = await sql`
      select action, delivery_status, provider_message_id, failure_reason, reason, created_at
        from public.lab_admin_invitation_events
       where invitation_id = ${invite.id}
       order by created_at asc`
    if (!events.length) line('events', 'none recorded')
    for (const event of events) {
      const status = event.delivery_status ? ` [${event.delivery_status}]` : ''
      console.log(`  ${iso(event.created_at)}  ${event.action}${status}`)
      if (event.provider_message_id) console.log(`      provider message: ${event.provider_message_id}`)
      if (event.failure_reason) console.log(`      FAILURE: ${event.failure_reason}`)
      if (event.reason) console.log(`      reason: ${event.reason}`)
    }
    const delivered = events.some((e) => e.delivery_status === 'sent')
    const prepared = events.some((e) => e.delivery_status === 'prepared')
    if (prepared && !delivered) {
      console.log('\n   A send was reserved but never finished — the provider call failed mid-flight.')
    }
    if (!events.some((e) => e.action === 'invited' || e.action === 'resent')) {
      console.log('\n   No send was ever attempted. The console blocks this when the operator')
      console.log('   lacks email permission, or email/Supabase admin are unconfigured.')
    }

    // 3 — did an account appear
    stage(3, 'Account')
    const [user] = await sql`
      select clerk_user_id, email, display_name, created_at
        from public.lab_users
       where lower(email) = ${email} and deleted_at is null
       order by created_at desc limit 1`
    line('account exists', user ? 'YES' : 'no — they have not signed in yet')
    if (user) {
      line('user id', user.clerk_user_id)
      line('created', iso(user.created_at))
    }

    // 4 — the claim turned it into a membership
    stage(4, 'Programme membership')
    if (!user) {
      line('membership', 'n/a until they sign in')
    } else {
      const [member] = await sql`
        select program_key, cohort_key, participation_status, feedback_status, enrolled_at
          from public.lab_admin_program_memberships
         where user_id = ${user.clerk_user_id}
         order by updated_at desc limit 1`
      if (!member) {
        line('membership', 'MISSING — the invitation was not claimed at sign-in')
      } else {
        line('programme', `${member.program_key} / ${member.cohort_key || '—'}`)
        line('stage', member.participation_status)
        line('enrolled', iso(member.enrolled_at))
      }
    }

    // 5 — credits actually landed
    stage(5, 'Credits')
    if (!user) {
      line('grant', 'n/a until they sign in')
    } else {
      const workspaceKey = `user:${user.clerk_user_id}`
      const grants = await sql`
        select entry_type, credits_delta, source_type, source_id, balance_after, created_at
          from public.lab_credit_ledger
         where workspace_key = ${workspaceKey}
         order by created_at desc limit 6`
      if (!grants.length) line('ledger', 'no entries')
      for (const grant of grants) {
        console.log(`  ${iso(grant.created_at)}  ${String(grant.entry_type).padEnd(11)} ${String(grant.credits_delta).padStart(6)}  ${grant.source_type}/${grant.source_id}  -> ${grant.balance_after}`)
      }
      const [account] = await sql`
        select available_credits, reserved_credits, allowance_plan, allowance_credits
          from public.lab_credit_accounts where workspace_key = ${workspaceKey}`
      if (account) {
        line('balance', account.available_credits)
        line('plan', account.allowance_plan || 'explorer',
          account.allowance_plan === 'explorer' ? '(60/day chat needs a sponsored Everyday seat)' : '')
      }
      const [subscription] = await sql`
        select provider, plan_slug, status, current_period_end
          from public.lab_subscriptions
         where workspace_key = ${workspaceKey} and status in ('active','trialing')
         order by current_period_end desc limit 1`
      line('entitlement', subscription
        ? `${subscription.plan_slug} via ${subscription.provider} until ${iso(subscription.current_period_end)}`
        : 'none — free tier, 10 chats a day')
    }

    // 6 — the funnel saw the journey
    stage(6, 'Funnel')
    const funnel = await sql`
      select step, surface, referrer_host, occurred_at
        from public.lab_funnel_events
       where invitation_id = ${invite.id}
          or (${user?.clerk_user_id ?? null}::text is not null and user_id = ${user?.clerk_user_id ?? null})
       order by occurred_at asc`
    if (!funnel.length) {
      line('steps', 'none recorded yet')
      console.log('   Expected once they click: invite_clicked, landing_viewed, signup_started,')
      console.log('   signup_completed, workspace_entered.')
    }
    for (const step of funnel) {
      console.log(`  ${iso(step.occurred_at)}  ${String(step.step).padEnd(18)} ${step.surface || ''} ${step.referrer_host || ''}`)
    }

    // Verdict
    console.log(`\n${'='.repeat(64)}`)
    const checks = [
      ['invitation exists', true],
      ['a send was attempted', events.some((e) => ['invited', 'resent'].includes(e.action))],
      ['provider accepted it', delivered],
      ['they signed in', Boolean(user)],
      ['invitation claimed', invite.invite_status === 'accepted'],
      ['funnel recorded the visit', funnel.length > 0],
    ]
    for (const [label, ok] of checks) console.log(`  ${ok ? 'YES' : ' no'}  ${label}`)
    const firstFailure = checks.find(([, ok]) => !ok)
    console.log(firstFailure
      ? `\nFurthest stage reached: everything before "${firstFailure[0]}".`
      : '\nFull journey completed end to end.')
    return 0
  } finally {
    await sql.end()
  }
}

try {
  process.exitCode = await main()
} catch (error) {
  console.error(`Trace failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
