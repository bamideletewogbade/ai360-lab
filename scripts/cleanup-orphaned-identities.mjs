import { config } from 'dotenv'
import postgres from 'postgres'

/**
 * Removes application data belonging to identities that no longer exist in
 * Supabase Auth.
 *
 * Deleting someone in the Supabase dashboard does not touch our tables: nothing
 * references `auth.users`, so their workspace, credits and conversations stay
 * behind. That is both untidy and wrong for a deletion request, which is what
 * this closes.
 *
 * The order matters. `lab_workspaces.created_by_user_id` is ON DELETE SET NULL,
 * so removing the person's row leaves the workspace — and everything hanging off
 * it — in place. The workspace has to go first; its own cascades then clear
 * credits, conversations, projects, drafts and reservations.
 *
 * Financial and quality history is deliberately preserved. `lab_usage_events`
 * and `lab_quality_reports` are ON DELETE SET NULL, so the records survive with
 * the identity detached rather than disappearing from the audit trail.
 *
 * Reports only, unless run with --delete.
 *
 *   node scripts/cleanup-orphaned-identities.mjs
 *   node scripts/cleanup-orphaned-identities.mjs --delete
 */

config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!connectionString) throw new Error('Missing DIRECT_URL or DATABASE_URL')

const apply = process.argv.includes('--delete')
const sql = postgres(connectionString, {
  max: 1,
  prepare: false,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
})

function line(label, value) {
  console.log(`  ${String(label).padEnd(34)} ${value}`)
}

try {
  // A live identity is one Supabase Auth still knows about. Everything else in
  // lab_users is a leftover: retired Clerk accounts, or people since deleted.
  const orphans = await sql`
    select u.clerk_user_id, u.email, u.display_name
      from public.lab_users u
     where not exists (
       select 1 from auth.users a where a.id::text = u.clerk_user_id
     )
     order by u.created_at`

  if (!orphans.length) {
    console.log('No orphaned identities. Application data matches Supabase Auth.')
    process.exit(0)
  }

  console.log(`${orphans.length} orphaned identit${orphans.length === 1 ? 'y' : 'ies'} found:\n`)

  let totalCredits = 0
  for (const person of orphans) {
    const workspaceKey = `user:${person.clerk_user_id}`
    const [counts] = await sql`
      select
        (select coalesce(sum(available_credits), 0)::int from public.lab_credit_accounts where workspace_key = ${workspaceKey}) as credits,
        (select count(*)::int from public.lab_conversations   where workspace_key = ${workspaceKey}) as conversations,
        (select count(*)::int from public.lab_studio_projects where workspace_key = ${workspaceKey}) as projects,
        (select count(*)::int from public.lab_payment_attempts where workspace_key = ${workspaceKey}) as payments`
    totalCredits += counts.credits

    console.log(`  ${person.email || '(no email)'} — ${person.display_name || 'no name'}`)
    line('identity', person.clerk_user_id)
    line('credits to be released', counts.credits)
    line('conversations', counts.conversations)
    line('projects', counts.projects)
    line('payment attempts', counts.payments)
    if (counts.payments > 0) {
      console.log('    NOTE: this identity has payment attempts. Confirm before deleting.')
    }
    console.log('')
  }

  if (!apply) {
    console.log(`Dry run. Nothing was changed. ${totalCredits} credits across ${orphans.length} identities.`)
    console.log('Re-run with --delete to remove them.')
    process.exit(0)
  }

  let removed = 0
  for (const person of orphans) {
    await sql.begin(async (tx) => {
      // Workspace first: its cascades clear credits, conversations, projects,
      // drafts and reservations. Deleting the person first would orphan them.
      await tx`delete from public.lab_workspaces where workspace_key = ${`user:${person.clerk_user_id}`}`
      await tx`delete from public.lab_users where clerk_user_id = ${person.clerk_user_id}`
    })
    removed += 1
  }

  console.log(`Removed ${removed} orphaned identit${removed === 1 ? 'y' : 'ies'} and their workspace data.`)
  console.log('Usage and quality records were kept with the identity detached.')
} finally {
  await sql.end()
}
