import { existsSync, readFileSync } from 'node:fs'
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

const { parseParticipantList } = await import('../src/lib/admin/participant-import.ts')
const { getPostgres } = await import('../src/lib/postgres.ts')

const apply = process.argv.includes('--apply')
const files = process.argv.slice(2).filter((value) => value !== '--apply')
if (!files.length) {
  console.error('Usage: node --experimental-strip-types scripts/normalize-invitation-credits.mjs [--apply] <csv> [csv...]')
  process.exit(2)
}

const emails = new Set()
for (const file of files) {
  for (const row of parseParticipantList(readFileSync(file, 'utf8')).rows) emails.add(row.email)
}

const sql = getPostgres()
const campaignEmails = [...emails]
const reason = 'Normalize unused additive top-up; sponsored Everyday pilot entitlement supplies the 120-credit allowance.'
const keyPrefix = 'normalize-starting-credits-2026-08-28'

async function readState(connection = sql) {
  return connection`
    select id, invited_by, invite_status, starting_credits
      from public.lab_admin_invitations
     where program_key = 'pilot'
       and email = any(${campaignEmails})
     order by id`
}

try {
  const before = await readState()
  const targets = before.filter((row) => ['pending', 'sent'].includes(row.invite_status) && Number(row.starting_credits) === 20)
  const accepted = before.filter((row) => row.invite_status === 'accepted')

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    exportedUnique: campaignEmails.length,
    invitationsFound: before.length,
    eligibleToNormalize: targets.length,
    acceptedExcluded: accepted.length,
    otherExcluded: before.length - targets.length - accepted.length,
    fromCredits: 20,
    toCredits: 0,
  }, null, 2))

  if (!apply) process.exitCode = targets.length ? 0 : 1
  else {
    const updated = await sql.begin(async (tx) => {
      const locked = await tx`
        select id, invited_by, invite_status, starting_credits
          from public.lab_admin_invitations
         where program_key = 'pilot'
           and email = any(${campaignEmails})
           and invite_status in ('pending', 'sent')
           and starting_credits = 20
         order by id
         for update`

      for (const invitation of locked) {
        await tx`
          update public.lab_admin_invitations
             set starting_credits = 0, updated_at = now()
           where id = ${invitation.id}`
        await tx`
          insert into public.lab_admin_invitation_events
            (id, invitation_id, actor_id, action, reason, idempotency_key, metadata)
          values (${`invitation_event_${crypto.randomUUID()}`}, ${invitation.id}, ${invitation.invited_by},
                  'imported', ${reason}, ${`${keyPrefix}:${invitation.id}`},
                  ${tx.json({ kind: 'starting_credits_normalized', previousCredits: 20, newCredits: 0 })})
          on conflict (idempotency_key) do nothing`
      }
      return locked.length
    })

    const after = await readState()
    const remaining = after.filter((row) => ['pending', 'sent'].includes(row.invite_status) && Number(row.starting_credits) !== 0)
    const acceptedAfter = after.filter((row) => row.invite_status === 'accepted')
    console.log(JSON.stringify({
      updated,
      remainingUnacceptedWithNonzeroTopUp: remaining.length,
      acceptedAccountsUnchanged: acceptedAfter.length,
      verified: updated === targets.length && remaining.length === 0 && acceptedAfter.length === accepted.length,
    }, null, 2))
    if (updated !== targets.length || remaining.length || acceptedAfter.length !== accepted.length) process.exitCode = 1
  }
} finally {
  await sql.end()
}
