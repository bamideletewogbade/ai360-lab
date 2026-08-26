import 'server-only'

import { getPostgres } from '@/lib/postgres'
import { logEvent } from '@/lib/observability'
import { candidateDomains, isSameMailbox, resolveInvitationForEmail } from '@/lib/admin/email-identity'
import type {
  AdminImportDisposition,
  AdminImportPreview,
  AdminImportPreviewRow,
  AdminInvitation,
  AdminInviteStatus,
} from '@/lib/admin/contracts'
import type { ParticipantImportParse } from '@/lib/admin/participant-import'

/**
 * Storage for participants who have been invited but have not yet arrived.
 *
 * Everything else in the admin module is keyed on a user id and can assume a
 * `lab_users` row exists. Invitations cannot: they are the record of an intent
 * to enrol somebody the system has never seen. That difference is why they get
 * their own table, their own delivery ledger — `lab_admin_contact_events`
 * requires a membership, which an invitee has no way to have — and their own
 * repository rather than being folded into `programs.ts`.
 */

type InvitationRow = {
  id: string
  program_key: string
  email: string
  display_name: string | null
  cohort_key: string | null
  participation_status: 'invited' | 'enrolled'
  starting_credits: number
  invite_status: AdminInviteStatus
  claimed_user_id: string | null
  invited_by: string | null
  import_key: string | null
  sent_at: Date | string | null
  accepted_at: Date | string | null
  last_attempt_at: Date | string | null
  send_attempts: number
  created_at: Date | string
  updated_at: Date | string
}

function iso(value: Date | string | null) {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapInvitation(row: InvitationRow): AdminInvitation {
  return {
    id: row.id,
    programKey: row.program_key,
    email: row.email,
    displayName: row.display_name,
    cohortKey: row.cohort_key,
    participationStatus: row.participation_status,
    startingCredits: Number(row.starting_credits || 0),
    inviteStatus: row.invite_status,
    claimedUserId: row.claimed_user_id,
    invitedBy: row.invited_by,
    importKey: row.import_key,
    sentAt: iso(row.sent_at),
    acceptedAt: iso(row.accepted_at),
    lastAttemptAt: iso(row.last_attempt_at),
    sendAttempts: Number(row.send_attempts || 0),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  }
}

/** Mirrors `isMissingAdminProgramTables` so a missing 0026 degrades, not 500s. */
export function isMissingAdminInvitationTables(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown; table_name?: unknown }
  if (candidate.code !== '42P01') return false
  const text = `${String(candidate.table_name || '')} ${String(candidate.message || '')}`
  return text.includes('lab_admin_invitations') || text.includes('lab_admin_invitation_events')
}

export async function readAdminInvitations(programKey = 'pilot') {
  const sql = getPostgres()
  try {
    const rows = await sql<InvitationRow[]>`
      select id, program_key, email, display_name, cohort_key, participation_status,
             starting_credits, invite_status, claimed_user_id, invited_by, import_key,
             sent_at, accepted_at, last_attempt_at, send_attempts, created_at, updated_at
        from public.lab_admin_invitations
       where program_key = ${programKey}
       order by created_at desc
       limit 2000`
    return { ready: true, invitations: rows.map(mapInvitation) }
  } catch (error) {
    if (isMissingAdminInvitationTables(error)) return { ready: false, invitations: [] as AdminInvitation[] }
    throw error
  }
}

const DISPOSITIONS: AdminImportDisposition[] = [
  'new', 'already_invited', 'already_a_user', 'invalid_email', 'duplicate_in_file', 'missing_email',
]

function emptyCounts() {
  return Object.fromEntries(DISPOSITIONS.map((key) => [key, 0])) as Record<AdminImportDisposition, number>
}

/**
 * Decides what each parsed row would actually do, against the current state of
 * the database. The parser cannot know any of this; the route should not have
 * to assemble it by hand.
 *
 * The two lookups fold case in SQL because `lab_users.email` is stored as the
 * identity provider supplied it, while invitation addresses are always stored
 * already lower-cased. At pilot sizes these are small scans over a small table;
 * if the participant list ever grows past a few thousand this wants a
 * functional index on `lower(email)`.
 */
export async function classifyImportRows(
  parse: ParticipantImportParse,
  programKey: string,
): Promise<AdminImportPreview> {
  const sql = getPostgres()
  const emails = parse.rows.map((row) => row.email)

  const [existingUsers, existingInvitations] = emails.length
    ? await Promise.all([
      sql<Array<{ email: string }>>`
        select distinct lower(email) as email
          from public.lab_users
         where deleted_at is null and lower(email) = any(${emails})`,
      sql<Array<{ email: string }>>`
        select email
          from public.lab_admin_invitations
         where program_key = ${programKey}
           and email = any(${emails})
           and invite_status <> 'revoked'`,
    ])
    : [[], []]

  const users = new Set(existingUsers.map((row) => row.email))
  const invited = new Set(existingInvitations.map((row) => row.email))

  const ready: AdminImportPreviewRow[] = []
  const skipped: AdminImportPreviewRow[] = []
  const counts = emptyCounts()

  for (const row of parse.rows) {
    // "Already a user" outranks "already invited": if the person has an account
    // the operator wants the existing pilot-onboard flow, not another invite.
    const disposition: AdminImportDisposition = users.has(row.email)
      ? 'already_a_user'
      : invited.has(row.email)
        ? 'already_invited'
        : 'new'
    const entry: AdminImportPreviewRow = { ...row, disposition }
    counts[disposition] += 1
    if (disposition === 'new') ready.push(entry)
    else skipped.push(entry)
  }

  for (const issue of parse.issues) {
    counts[issue.reason] += 1
    skipped.push({
      email: issue.raw,
      displayName: null,
      cohortKey: null,
      line: issue.line,
      disposition: issue.reason,
    })
  }

  skipped.sort((left, right) => left.line - right.line)
  return { format: parse.format, truncated: parse.truncated, ready, skipped, counts }
}

/**
 * Writes the rows an operator confirmed. Re-running the same import is a no-op
 * rather than an error: the unique key is `(program_key, email)`, and a row
 * that already exists keeps its original invitation state so a resend is never
 * silently reset to pending.
 */
export async function createAdminInvitations(input: {
  rows: Array<{ email: string; displayName: string | null; cohortKey: string | null }>
  programKey: string
  defaultCohortKey: string | null
  participationStatus: 'invited' | 'enrolled'
  startingCredits: number
  actorId: string
  reason: string
  importKey: string
}) {
  const sql = getPostgres()
  const created: AdminInvitation[] = []
  await sql.begin(async (tx) => {
    for (const row of input.rows) {
      const [invitation] = await tx<InvitationRow[]>`
        insert into public.lab_admin_invitations
          (id, program_key, email, display_name, cohort_key, participation_status,
           starting_credits, invite_status, invited_by, reason, import_key)
        values (${`invitation_${crypto.randomUUID()}`}, ${input.programKey}, ${row.email},
                ${row.displayName}, ${row.cohortKey || input.defaultCohortKey},
                ${input.participationStatus}, ${input.startingCredits}, 'pending',
                ${input.actorId}, ${input.reason.slice(0, 240)}, ${input.importKey})
        on conflict (program_key, email) do nothing
        returning id, program_key, email, display_name, cohort_key, participation_status,
                  starting_credits, invite_status, claimed_user_id, invited_by, import_key,
                  sent_at, accepted_at, last_attempt_at, send_attempts, created_at, updated_at`
      if (!invitation) continue
      created.push(mapInvitation(invitation))
      await tx`
        insert into public.lab_admin_invitation_events
          (id, invitation_id, actor_id, action, recipient_email, reason, idempotency_key, metadata)
        values (${`invitation_event_${crypto.randomUUID()}`}, ${invitation.id}, ${input.actorId},
                'imported', ${row.email}, ${input.reason.slice(0, 240)},
                ${`${input.importKey}:${row.email}`},
                ${tx.json({ cohortKey: invitation.cohort_key, startingCredits: input.startingCredits })})
        on conflict (idempotency_key) do nothing`
    }
  })
  return created
}

/** The invitations an invite run may actually send to, in a stable order. */
export async function listSendableInvitations(input: { ids: string[]; programKey: string }) {
  const sql = getPostgres()
  const rows = await sql<InvitationRow[]>`
    select id, program_key, email, display_name, cohort_key, participation_status,
           starting_credits, invite_status, claimed_user_id, invited_by, import_key,
           sent_at, accepted_at, last_attempt_at, send_attempts, created_at, updated_at
      from public.lab_admin_invitations
     where program_key = ${input.programKey}
       and id = any(${input.ids})
       and invite_status in ('pending', 'sent')
     order by email`
  return rows.map(mapInvitation)
}

/**
 * Reserves one send. Identical in shape to `claimAdminContactEvent`: the unique
 * idempotency key means a retried request cannot send the same invitation
 * twice, and a null return says "already claimed, skip it".
 */
export async function claimInvitationSend(input: {
  invitationId: string
  actorId: string
  recipientEmail: string
  resend: boolean
  idempotencyKey: string
}) {
  const sql = getPostgres()
  const [row] = await sql<{ id: string }[]>`
    insert into public.lab_admin_invitation_events
      (id, invitation_id, actor_id, action, delivery_status, recipient_email, idempotency_key)
    values (${`invitation_event_${crypto.randomUUID()}`}, ${input.invitationId}, ${input.actorId},
            ${input.resend ? 'resent' : 'invited'}, 'prepared', ${input.recipientEmail},
            ${input.idempotencyKey})
    on conflict (idempotency_key) do nothing
    returning id`
  return row?.id || null
}

/**
 * Closes a send. A success moves the invitation to `sent`; a failure leaves it
 * `pending` so the operator can simply run the invite again, with the reason
 * recorded against the attempt.
 */
export async function finishInvitationSend(input: {
  eventId: string
  invitationId: string
  deliveryStatus: 'sent' | 'failed'
  providerMessageId?: string | null
  failureReason?: string | null
}) {
  const sql = getPostgres()
  await sql.begin(async (tx) => {
    await tx`
      update public.lab_admin_invitation_events
         set delivery_status = ${input.deliveryStatus},
             provider_message_id = ${input.providerMessageId || null},
             failure_reason = ${input.failureReason || null}
       where id = ${input.eventId} and delivery_status = 'prepared'`
    await tx`
      update public.lab_admin_invitations
         set invite_status = case when ${input.deliveryStatus} = 'sent' and invite_status = 'pending'
                                  then 'sent' else invite_status end,
             sent_at = case when ${input.deliveryStatus} = 'sent'
                            then coalesce(sent_at, now()) else sent_at end,
             last_attempt_at = now(),
             send_attempts = send_attempts + 1,
             updated_at = now()
       where id = ${input.invitationId}`
  })
}

export async function revokeAdminInvitations(input: {
  ids: string[]
  programKey: string
  actorId: string
  reason: string
  idempotencyKey: string
}) {
  const sql = getPostgres()
  const revoked: string[] = []
  await sql.begin(async (tx) => {
    for (const id of input.ids) {
      // An accepted invitation is history, not a pending action; revoking it
      // would contradict the membership that already exists.
      const [row] = await tx<{ id: string }[]>`
        update public.lab_admin_invitations
           set invite_status = 'revoked', updated_at = now()
         where id = ${id} and program_key = ${input.programKey}
           and invite_status in ('pending', 'sent', 'bounced')
         returning id`
      if (!row) continue
      revoked.push(row.id)
      await tx`
        insert into public.lab_admin_invitation_events
          (id, invitation_id, actor_id, action, reason, idempotency_key)
        values (${`invitation_event_${crypto.randomUUID()}`}, ${row.id}, ${input.actorId},
                'revoked', ${input.reason.slice(0, 240)}, ${`${input.idempotencyKey}:${row.id}`})
        on conflict (idempotency_key) do nothing`
    }
  })
  return revoked
}

/**
 * An invitee's own opt-out. There is no membership to mark `unsubscribed`
 * because there is no account, so the invitation is revoked instead — which
 * removes it from every sendable list. Takes no actor: the recipient did it.
 */
export async function unsubscribeInvitation(invitationId: string) {
  const sql = getPostgres()
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      update public.lab_admin_invitations
         set invite_status = 'revoked', updated_at = now()
       where id = ${invitationId} and invite_status in ('pending', 'sent', 'bounced')
       returning id`
    if (!row) return false
    await tx`
      insert into public.lab_admin_invitation_events
        (id, invitation_id, action, reason, idempotency_key)
      values (${`invitation_event_${crypto.randomUUID()}`}, ${row.id}, 'revoked',
              'Recipient unsubscribed', ${`unsubscribe:${row.id}`})
      on conflict (idempotency_key) do nothing`
    return true
  })
}

export type InvitationMismatch = {
  invitationId: string
  invitedEmail: string
  cohortKey: string | null
  startingCredits: number
  userId: string
  signedInEmail: string
  displayName: string | null
  firstSeenAt: string
  lastSeenAt: string
  /** True when the two addresses provably reach one inbox. */
  sameMailbox: boolean
}

/**
 * People who followed an invitation link, signed in, and were never claimed.
 *
 * The evidence is the funnel rather than a guess at the address: a visit is
 * stamped with the invitation it arrived through, and `attachIdentityToVisit`
 * back-fills the account once one exists. So an unclaimed invitation with
 * funnel rows carrying somebody's user id is proof that this specific person
 * clicked this specific invitation and still got nothing.
 *
 * `sameMailbox` separates the two cases, because they need different actions:
 *
 *   true  — a spelling difference the claim now resolves by itself. These
 *           heal on the person's next sign-in and need no operator at all.
 *   false — genuinely different mailboxes, most often somebody invited at a
 *           Yahoo or iCloud address who tapped "Continue with Google". No
 *           string comparison can prove those are one person, so an operator
 *           grants the credits by hand.
 */
export async function readInvitationMismatches(programKey = 'pilot') {
  const sql = getPostgres()
  try {
    const rows = await sql<Array<{
      id: string
      invited_email: string
      cohort_key: string | null
      starting_credits: number
      user_id: string
      signed_in_email: string
      display_name: string | null
      first_seen: Date | string
      last_seen: Date | string
    }>>`
      select invitation.id, invitation.email as invited_email, invitation.cohort_key,
             invitation.starting_credits, users.clerk_user_id as user_id,
             users.email as signed_in_email, users.display_name,
             min(event.occurred_at) as first_seen, max(event.occurred_at) as last_seen
        from public.lab_admin_invitations invitation
        join public.lab_funnel_events event on event.invitation_id = invitation.id
        join public.lab_users users on users.clerk_user_id = event.user_id
       where invitation.program_key = ${programKey}
         and invitation.invite_status in ('pending', 'sent')
         and users.deleted_at is null
       group by invitation.id, invitation.email, invitation.cohort_key,
                invitation.starting_credits, users.clerk_user_id, users.email, users.display_name
       order by max(event.occurred_at) desc
       limit 200`

    return {
      ready: true,
      mismatches: rows.map((row): InvitationMismatch => ({
        invitationId: row.id,
        invitedEmail: row.invited_email,
        cohortKey: row.cohort_key,
        startingCredits: Number(row.starting_credits || 0),
        userId: row.user_id,
        signedInEmail: row.signed_in_email,
        displayName: row.display_name,
        firstSeenAt: iso(row.first_seen)!,
        lastSeenAt: iso(row.last_seen)!,
        sameMailbox: isSameMailbox(row.invited_email, row.signed_in_email),
      })),
    }
  } catch (error) {
    // A missing funnel table (0028) must degrade to "nothing to report" rather
    // than break the console, exactly as a missing invitation table does.
    if (isMissingAdminInvitationTables(error) || isMissingFunnelTable(error)) {
      return { ready: false, mismatches: [] as InvitationMismatch[] }
    }
    throw error
  }
}

function isMissingFunnelTable(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown; table_name?: unknown }
  if (candidate.code !== '42P01') return false
  return `${String(candidate.table_name || '')} ${String(candidate.message || '')}`
    .includes('lab_funnel_events')
}

/** Records a hard bounce so the address stops being offered for sending. */
export async function markInvitationBounced(input: { invitationId: string; failureReason: string }) {
  const sql = getPostgres()
  await sql.begin(async (tx) => {
    await tx`
      update public.lab_admin_invitations
         set invite_status = 'bounced', updated_at = now()
       where id = ${input.invitationId} and invite_status in ('pending', 'sent')`
    await tx`
      insert into public.lab_admin_invitation_events
        (id, invitation_id, action, delivery_status, failure_reason, idempotency_key)
      values (${`invitation_event_${crypto.randomUUID()}`}, ${input.invitationId}, 'bounced',
              'failed', ${input.failureReason.slice(0, 240)},
              ${`bounce:${input.invitationId}:${crypto.randomUUID()}`})
      on conflict (idempotency_key) do nothing`
  })
}

export type ClaimedInvitation = {
  invitationId: string
  programKey: string
  cohortKey: string | null
  participationStatus: 'invited' | 'enrolled'
  startingCredits: number
}

/**
 * Turns an invitation into a membership at sign-in.
 *
 * The lookup and the two writes are one transaction so a membership can never
 * exist without the invitation being marked accepted, and vice versa. Credits
 * are deliberately left to the caller: `grantCredits` opens its own
 * transaction, and nesting it here would either deadlock or force the credit
 * ledger to trust a transaction it did not open.
 *
 * Returns null when there is nothing to claim, which is the overwhelmingly
 * common case — this runs on every sign-in.
 */
export async function claimInvitationForUser(input: {
  email: string
  userId: string
  displayName: string | null
}): Promise<ClaimedInvitation | null> {
  const email = input.email.trim().toLowerCase()
  if (!email) return null
  const sql = getPostgres()

  return sql.begin(async (tx) => {
    // The address is looked up across the domains that could route to the same
    // inbox rather than by exact string, because an identity provider often
    // returns a different spelling of it than the operator typed — Google
    // strips `+tags` and dots. Without this the invitation is never claimed,
    // the person gets no credits and no membership, and nothing anywhere
    // reports a failure. `resolveInvitationForEmail` still refuses anything it
    // cannot prove is one mailbox.
    const domains = candidateDomains(email)
    if (!domains.length) return null

    const candidates = await tx<InvitationRow[]>`
      select id, program_key, email, display_name, cohort_key, participation_status,
             starting_credits, invite_status, claimed_user_id, invited_by, import_key,
             sent_at, accepted_at, last_attempt_at, send_attempts, created_at, updated_at
        from public.lab_admin_invitations
       where invite_status in ('pending', 'sent')
         and split_part(email, '@', 2) = any(${domains})
       order by created_at
       for update skip locked`

    const resolved = resolveInvitationForEmail(email, candidates)
    if (!resolved.match) {
      if (resolved.reason === 'ambiguous') {
        // Two open invitations reach this inbox. Picking one would be arbitrary
        // and would silently strand the other, so an operator decides.
        logEvent('warn', 'admin.invitation_claim_ambiguous', {
          candidates: candidates.length,
          domain: domains[0],
        })
      }
      return null
    }
    const invitation = resolved.match

    // Recorded when the spelling differed, so the operator can see that a
    // `+tag` or dotted address was matched rather than wonder why the console
    // shows an address the person never typed.
    if (invitation.email !== email) {
      logEvent('info', 'admin.invitation_claim_normalized', {
        invitationId: invitation.id,
        invitedAs: invitation.email,
        signedInAs: email,
      })
    }

    await tx`
      update public.lab_admin_invitations
         set invite_status = 'accepted', claimed_user_id = ${input.userId},
             accepted_at = now(), updated_at = now()
       where id = ${invitation.id}`

    // The membership is created exactly as `pilot_onboard` would have created
    // it, so a claimed invitee is indistinguishable from a hand-enrolled one
    // everywhere downstream.
    await tx`
      insert into public.lab_admin_program_memberships
        (program_key, user_id, cohort_key, participation_status, feedback_status,
         invited_at, enrolled_at, created_by, updated_by, updated_at)
      values (${invitation.program_key}, ${input.userId}, ${invitation.cohort_key},
              ${invitation.participation_status}, 'not_requested',
              ${iso(invitation.created_at)},
              ${invitation.participation_status === 'enrolled' ? new Date().toISOString() : null},
              ${invitation.invited_by}, ${invitation.invited_by}, now())
      on conflict (program_key, user_id) do update set
        cohort_key = coalesce(public.lab_admin_program_memberships.cohort_key, ${invitation.cohort_key}),
        updated_at = now()`

    await tx`
      insert into public.lab_admin_invitation_events
        (id, invitation_id, action, recipient_email, idempotency_key, metadata)
      values (${`invitation_event_${crypto.randomUUID()}`}, ${invitation.id}, 'accepted',
              ${email}, ${`accepted:${invitation.id}`},
              ${tx.json({ userId: input.userId, displayName: input.displayName })})
      on conflict (idempotency_key) do nothing`

    return {
      invitationId: invitation.id,
      programKey: invitation.program_key,
      cohortKey: invitation.cohort_key,
      participationStatus: invitation.participation_status,
      startingCredits: Number(invitation.starting_credits || 0),
    }
  })
}
