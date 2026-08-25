import 'server-only'

import { getPostgres } from '@/lib/postgres'
import type {
  AdminContactEvent,
  AdminEmailStatus,
  AdminFeedbackStatus,
  AdminParticipationStatus,
  AdminProgramMembership,
} from '@/lib/admin/contracts'

type MembershipRow = {
  user_id: string
  program_key: string
  cohort_key: string | null
  participation_status: AdminParticipationStatus
  feedback_status: AdminFeedbackStatus
  email_status: AdminEmailStatus
  assigned_to: string | null
  next_follow_up_at: Date | string | null
  internal_note: string | null
  invited_at: Date | string | null
  enrolled_at: Date | string | null
  last_contacted_at: Date | string | null
  contact_count: string | number
  updated_at: Date | string
}

type ContactRow = {
  id: string
  program_key: string
  user_id: string
  actor_id: string | null
  channel: 'email' | 'manual'
  template_key: string
  subject: string
  delivery_status: AdminContactEvent['deliveryStatus']
  provider_message_id: string | null
  failure_reason: string | null
  created_at: Date | string
}

function iso(value: Date | string | null) {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function isMissingAdminProgramTables(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown; table_name?: unknown }
  if (candidate.code !== '42P01') return false
  const text = `${String(candidate.table_name || '')} ${String(candidate.message || '')}`
  return text.includes('lab_admin_program_memberships') || text.includes('lab_admin_contact_events')
}

export async function readAdminProgramMemberships() {
  const sql = getPostgres()
  try {
    const rows = await sql<MembershipRow[]>`
      select user_id, program_key, cohort_key, participation_status, feedback_status,
             email_status, assigned_to, next_follow_up_at, internal_note, invited_at,
             enrolled_at, last_contacted_at, contact_count, updated_at
        from public.lab_admin_program_memberships
       where program_key = 'pilot'
       order by updated_at desc
       limit 2000`
    return {
      ready: true,
      memberships: new Map(rows.map((row) => [row.user_id, mapMembership(row)])),
    }
  } catch (error) {
    if (isMissingAdminProgramTables(error)) return { ready: false, memberships: new Map<string, AdminProgramMembership>() }
    throw error
  }
}

export async function readAdminContactEvents(userId: string): Promise<AdminContactEvent[]> {
  const sql = getPostgres()
  try {
    const rows = await sql<ContactRow[]>`
      select id, program_key, user_id, actor_id, channel, template_key, subject,
             delivery_status, provider_message_id, failure_reason, created_at
        from public.lab_admin_contact_events
       where user_id = ${userId}
       order by created_at desc
       limit 100`
    return rows.map((row) => ({
      id: row.id,
      programKey: row.program_key,
      userId: row.user_id,
      actorId: row.actor_id,
      channel: row.channel,
      templateKey: row.template_key,
      subject: row.subject,
      deliveryStatus: row.delivery_status,
      providerMessageId: row.provider_message_id,
      failureReason: row.failure_reason,
      createdAt: iso(row.created_at)!,
    }))
  } catch (error) {
    if (isMissingAdminProgramTables(error)) return []
    throw error
  }
}

function mapMembership(row: MembershipRow): AdminProgramMembership {
  return {
    programKey: row.program_key,
    cohortKey: row.cohort_key,
    participationStatus: row.participation_status,
    feedbackStatus: row.feedback_status,
    emailStatus: row.email_status,
    assignedTo: row.assigned_to,
    nextFollowUpAt: iso(row.next_follow_up_at),
    internalNote: row.internal_note,
    invitedAt: iso(row.invited_at),
    enrolledAt: iso(row.enrolled_at),
    lastContactedAt: iso(row.last_contacted_at),
    contactCount: Number(row.contact_count || 0),
    updatedAt: iso(row.updated_at)!,
  }
}

export async function upsertAdminProgramMemberships(input: {
  userIds: string[]
  programKey: string
  cohortKey?: string | null
  participationStatus?: AdminParticipationStatus
  feedbackStatus?: AdminFeedbackStatus
  actorId: string
  reason: string
  idempotencyKey: string
}) {
  const sql = getPostgres()
  const updated: string[] = []
  await sql.begin(async (tx) => {
    for (const userId of input.userIds) {
      const [row] = await tx<{ user_id: string }[]>`
        insert into public.lab_admin_program_memberships
          (program_key, user_id, cohort_key, participation_status, feedback_status,
           invited_at, enrolled_at, created_by, updated_by, updated_at)
        values (${input.programKey}, ${userId}, ${input.cohortKey ?? null},
                ${input.participationStatus || 'enrolled'}, ${input.feedbackStatus || 'not_requested'},
                ${input.participationStatus === 'invited' ? new Date().toISOString() : null},
                ${input.participationStatus && input.participationStatus !== 'invited' ? new Date().toISOString() : null},
                ${input.actorId}, ${input.actorId}, now())
        on conflict (program_key, user_id) do update set
          cohort_key = coalesce(${input.cohortKey ?? null}, lab_admin_program_memberships.cohort_key),
          participation_status = coalesce(${input.participationStatus ?? null}, lab_admin_program_memberships.participation_status),
          feedback_status = coalesce(${input.feedbackStatus ?? null}, lab_admin_program_memberships.feedback_status),
          invited_at = case when ${input.participationStatus ?? null} = 'invited'
                            then coalesce(lab_admin_program_memberships.invited_at, now())
                            else lab_admin_program_memberships.invited_at end,
          enrolled_at = case when ${input.participationStatus ?? null} in ('enrolled', 'activated', 'returning', 'completed')
                             then coalesce(lab_admin_program_memberships.enrolled_at, now())
                             else lab_admin_program_memberships.enrolled_at end,
          updated_by = ${input.actorId}, updated_at = now()
        returning user_id`
      if (row) updated.push(row.user_id)
      await tx`
        insert into public.lab_admin_program_events
          (id, program_key, user_id, actor_id, action, reason, idempotency_key, metadata)
        values (${`program_${crypto.randomUUID()}`}, ${input.programKey}, ${userId}, ${input.actorId},
                'membership_updated', ${input.reason.slice(0, 240)},
                ${`${input.idempotencyKey}:${userId}`},
                ${tx.json({ cohortKey: input.cohortKey ?? null, participationStatus: input.participationStatus ?? null, feedbackStatus: input.feedbackStatus ?? null })})
        on conflict (idempotency_key) do nothing`
    }
  })
  return updated
}

export async function removeAdminProgramMemberships(input: {
  userIds: string[]
  programKey: string
  actorId: string
  reason: string
  idempotencyKey: string
}) {
  const sql = getPostgres()
  const removed: string[] = []
  await sql.begin(async (tx) => {
    for (const userId of input.userIds) {
      const [row] = await tx<{ user_id: string }[]>`
        update public.lab_admin_program_memberships
           set participation_status = 'withdrawn', cohort_key = null,
               updated_by = ${input.actorId}, updated_at = now()
         where program_key = ${input.programKey} and user_id = ${userId}
         returning user_id`
      if (!row) continue
      removed.push(row.user_id)
      await tx`
        insert into public.lab_admin_program_events
          (id, program_key, user_id, actor_id, action, reason, idempotency_key)
        values (${`program_${crypto.randomUUID()}`}, ${input.programKey}, ${userId}, ${input.actorId},
                'membership_removed', ${input.reason.slice(0, 240)}, ${`${input.idempotencyKey}:${userId}`})
        on conflict (idempotency_key) do nothing`
    }
  })
  return removed
}

export async function listAdminEmailRecipients(input: { userIds: string[]; programKey: string }) {
  const sql = getPostgres()
  return sql<Array<{
    user_id: string
    email: string | null
    display_name: string | null
    email_status: AdminEmailStatus
    participation_status: AdminParticipationStatus
  }>>`
    select membership.user_id, users.email, users.display_name,
           membership.email_status, membership.participation_status
      from public.lab_admin_program_memberships membership
      join public.lab_users users on users.clerk_user_id = membership.user_id and users.deleted_at is null
     where membership.program_key = ${input.programKey}
       and membership.user_id = any(${input.userIds})
     order by lower(users.email), membership.user_id`
}

/**
 * Records a recipient's own decision about being contacted.
 *
 * Called from the unsubscribe route rather than the console, so it takes no
 * actor: nobody on the team performed it. Returns whether a membership was
 * actually matched, so the route can tell an already-handled link from a stale
 * one without leaking which addresses exist.
 */
export async function setAdminEmailStatus(input: {
  userId: string
  programKey: string
  status: AdminEmailStatus
}) {
  const sql = getPostgres()
  const [row] = await sql<{ user_id: string }[]>`
    update public.lab_admin_program_memberships
       set email_status = ${input.status}, updated_at = now()
     where program_key = ${input.programKey} and user_id = ${input.userId}
     returning user_id`
  return Boolean(row)
}

export async function claimAdminContactEvent(input: {
  userId: string
  programKey: string
  actorId: string
  templateKey: string
  subject: string
  recipientEmail: string | null
  idempotencyKey: string
}) {
  const sql = getPostgres()
  const [row] = await sql<{ id: string }[]>`
    insert into public.lab_admin_contact_events
      (id, program_key, user_id, actor_id, channel, template_key, subject,
       delivery_status, recipient_email, idempotency_key)
    values (${`contact_${crypto.randomUUID()}`}, ${input.programKey}, ${input.userId}, ${input.actorId},
            'email', ${input.templateKey}, ${input.subject.slice(0, 200)}, 'prepared',
            ${input.recipientEmail}, ${input.idempotencyKey})
    on conflict (idempotency_key) do nothing
    returning id`
  return row?.id || null
}

export async function finishAdminContactEvent(input: {
  id: string
  actorId: string
  deliveryStatus: 'sent' | 'failed'
  providerMessageId?: string | null
  failureReason?: string | null
}) {
  const sql = getPostgres()
  await sql.begin(async (tx) => {
    const [event] = await tx<{ program_key: string; user_id: string }[]>`
      update public.lab_admin_contact_events
         set delivery_status = ${input.deliveryStatus}, provider_message_id = ${input.providerMessageId || null},
             failure_reason = ${input.failureReason || null}
       where id = ${input.id} and delivery_status = 'prepared'
       returning program_key, user_id`
    if (event && input.deliveryStatus === 'sent') {
      await tx`
        update public.lab_admin_program_memberships
           set last_contacted_at = now(), contact_count = contact_count + 1,
               updated_at = now(), updated_by = ${input.actorId}
         where program_key = ${event.program_key} and user_id = ${event.user_id}`
    }
  })
}
