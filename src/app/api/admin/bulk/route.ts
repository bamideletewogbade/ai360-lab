import { z } from 'zod'
import { getOptionalAuthContext } from '@/lib/auth'
import {
  canManageAdminCredits,
  canManageAdminPrograms,
  canSendAdminEmail,
  isAdminOperator,
} from '@/lib/admin/access'
import {
  listAdminEmailRecipients,
  claimAdminContactEvent,
  finishAdminContactEvent,
  isMissingAdminProgramTables,
  removeAdminProgramMemberships,
  upsertAdminProgramMemberships,
} from '@/lib/admin/programs'
import {
  renderAdminParticipantEmail,
} from '@/lib/admin/participant-email'
import type { AdminParticipantEmailTemplate } from '@/lib/admin/participant-email'
import { createEmailProvider } from '@/lib/email/provider'
import { emailSettings, isEmailConfigured } from '@/lib/email/config'
import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import { createWorkspaceAuthContext } from '@/lib/workspace'
import { grantCredits } from '@/lib/billing/credit-repository'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'

const userIds = z.array(z.string().min(2).max(160).regex(/^[A-Za-z0-9._:-]+$/)).min(1).max(200)
const programKey = z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._:-]+$/).default('pilot')
const idempotencyKey = z.string().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/)
const reason = z.string().trim().min(3).max(240)
const templateKey = z.enum([
  'pilot_invite', 'onboarding_reminder', 'error_help', 'low_credits',
  'credits_granted', 'feedback_request', 'completion',
])

const BulkAction = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('program_update'), userIds, programKey, idempotencyKey, reason,
    cohortKey: z.string().trim().min(2).max(120).nullable().optional(),
    participationStatus: z.enum(['invited', 'enrolled', 'activated', 'returning', 'completed', 'withdrawn']).optional(),
    feedbackStatus: z.enum(['not_requested', 'requested', 'received', 'reviewed']).optional(),
  }),
  z.object({ action: z.literal('program_remove'), userIds, programKey, idempotencyKey, reason }),
  z.object({
    action: z.literal('credit_grant'), userIds: userIds.refine((ids) => ids.length <= 100),
    credits: z.number().int().min(1).max(10_000), idempotencyKey, reason,
  }),
  z.object({
    action: z.enum(['email_preview', 'email_send']), userIds: userIds.refine((ids) => ids.length <= 50),
    programKey, templateKey, operatorNote: z.string().trim().max(500).optional(),
    idempotencyKey: idempotencyKey.optional(),
  }),
])

function unique(values: string[]) {
  return [...new Set(values)]
}

async function existingUsers(ids: string[]) {
  const sql = getPostgres()
  const rows = await sql<Array<{ clerk_user_id: string; email: string | null; display_name: string | null }>>`
    select clerk_user_id, email, display_name
      from public.lab_users
     where clerk_user_id = any(${ids}) and deleted_at is null`
  return rows
}

function emailPreview(recipients: Awaited<ReturnType<typeof listAdminEmailRecipients>>, selectedTemplate: AdminParticipantEmailTemplate, operatorNote?: string) {
  const eligible = recipients.filter((item) => item.email_status === 'contactable' && Boolean(item.email))
  const excluded = recipients.filter((item) => item.email_status !== 'contactable' || !item.email)
  const sample = eligible[0]
    ? renderAdminParticipantEmail({
        template: selectedTemplate,
        displayName: eligible[0].display_name,
        email: eligible[0].email!,
        operatorNote,
      })
    : null
  return {
    eligible: eligible.map((item) => ({ userId: item.user_id, email: item.email!, displayName: item.display_name })),
    excluded: excluded.map((item) => ({
      userId: item.user_id,
      email: item.email,
      reason: item.email_status !== 'contactable' ? item.email_status : 'missing_email',
    })),
    sample: sample ? { subject: sample.subject, text: sample.text } : null,
  }
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/admin/bulk')
  try {
    const operator = await getOptionalAuthContext()
    if (!operator) return Response.json({ error: 'Sign in to run admin actions.' }, { status: 401, headers: log.headers() })
    if (!isAdminOperator(operator)) return Response.json({ error: 'Approved operator access is required.' }, { status: 403, headers: log.headers() })
    if (!isPostgresConfigured()) return Response.json({ error: 'Admin operations are not connected yet.' }, { status: 503, headers: log.headers() })
    const parsed = BulkAction.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: 'Review the selected users and action details.' }, { status: 400, headers: log.headers() })
    const body = { ...parsed.data, userIds: unique(parsed.data.userIds) }

    if (body.action === 'program_update' || body.action === 'program_remove') {
      if (!canManageAdminPrograms(operator)) return Response.json({ error: 'Program-manager access is required.' }, { status: 403, headers: log.headers() })
      const found = await existingUsers(body.userIds)
      if (found.length !== body.userIds.length) return Response.json({ error: 'One or more selected users no longer exist.' }, { status: 409, headers: log.headers() })
      const changed = body.action === 'program_update'
        ? await upsertAdminProgramMemberships({
            userIds: body.userIds, programKey: body.programKey, cohortKey: body.cohortKey,
            participationStatus: body.participationStatus, feedbackStatus: body.feedbackStatus,
            actorId: operator.userId, reason: body.reason, idempotencyKey: body.idempotencyKey,
          })
        : await removeAdminProgramMemberships({
            userIds: body.userIds, programKey: body.programKey, actorId: operator.userId,
            reason: body.reason, idempotencyKey: body.idempotencyKey,
          })
      log.finish(200, { outcome: 'success', action: body.action, changed: changed.length })
      return Response.json({ changed: changed.length, userIds: changed }, { headers: log.headers({ 'Cache-Control': 'private, no-store' }) })
    }

    if (body.action === 'credit_grant') {
      if (!canManageAdminCredits(operator)) return Response.json({ error: 'Credit-manager access is required.' }, { status: 403, headers: log.headers() })
      const targets = await existingUsers(body.userIds)
      if (targets.length !== body.userIds.length) return Response.json({ error: 'One or more selected users no longer exist.' }, { status: 409, headers: log.headers() })
      const results = []
      for (const target of targets) {
        const result = await grantCredits({
          context: createWorkspaceAuthContext({ userId: target.clerk_user_id, email: target.email, displayName: target.display_name }),
          credits: body.credits, sourceType: 'adjustment', sourceId: 'admin-bulk-grant',
          idempotencyKey: `admin:${operator.userId}:${body.idempotencyKey}:${target.clerk_user_id}`,
          operatorAudit: { actorId: operator.userId, action: 'credit_grant', reason: body.reason, requestId: log.requestId },
        })
        results.push({ userId: target.clerk_user_id, applied: result.granted, reason: result.granted ? null : result.reason })
      }
      const applied = results.filter((item) => item.applied).length
      log.finish(200, { outcome: 'success', action: body.action, applied })
      return Response.json({ applied, results }, { headers: log.headers({ 'Cache-Control': 'private, no-store' }) })
    }

    if (!canSendAdminEmail(operator)) return Response.json({ error: 'Email-operator access is required.' }, { status: 403, headers: log.headers() })
    const recipients = await listAdminEmailRecipients({ userIds: body.userIds, programKey: body.programKey })
    const preview = emailPreview(recipients, body.templateKey, body.operatorNote)
    const notInProgram = body.userIds.filter((id) => !recipients.some((item) => item.user_id === id))
    preview.excluded.push(...notInProgram.map((userId) => ({ userId, email: null, reason: 'not_in_program' })))
    if (body.action === 'email_preview') {
      return Response.json(preview, { headers: log.headers({ 'Cache-Control': 'private, no-store' }) })
    }
    if (!isEmailConfigured()) return Response.json({ error: 'Participant email delivery is not configured.' }, { status: 503, headers: log.headers() })
    if (!body.idempotencyKey) return Response.json({ error: 'A delivery key is required.' }, { status: 400, headers: log.headers() })

    const provider = createEmailProvider()
    const settings = emailSettings()
    const delivery = []
    for (const recipient of preview.eligible) {
      const rendered = renderAdminParticipantEmail({
        template: body.templateKey, displayName: recipient.displayName,
        email: recipient.email, operatorNote: body.operatorNote,
      })
      const contactId = await claimAdminContactEvent({
        userId: recipient.userId, programKey: body.programKey, actorId: operator.userId,
        templateKey: body.templateKey, subject: rendered.subject, recipientEmail: recipient.email,
        idempotencyKey: `${body.idempotencyKey}:${recipient.userId}`,
      })
      if (!contactId) {
        delivery.push({ userId: recipient.userId, status: 'skipped' as const })
        continue
      }
      let status: 'sent' | 'failed' = 'failed'
      let providerMessageId: string | null = null
      let failureReason: string | null = null
      try {
        const sent = await provider.send({
          to: recipient.email, from: settings.from, replyTo: settings.replyTo,
          subject: rendered.subject, html: rendered.html, text: rendered.text,
          tags: { kind: 'pilot_outreach', template: body.templateKey },
        })
        status = 'sent'
        providerMessageId = sent.id
      } catch (error) {
        failureReason = error instanceof Error ? error.name : 'delivery_error'
      }
      await finishAdminContactEvent({
        id: contactId, actorId: operator.userId, deliveryStatus: status,
        providerMessageId, failureReason,
      })
      delivery.push({ userId: recipient.userId, status })
    }
    const sent = delivery.filter((item) => item.status === 'sent').length
    const failed = delivery.filter((item) => item.status === 'failed').length
    const skipped = delivery.filter((item) => item.status === 'skipped').length
    log.finish(200, { outcome: 'success', action: body.action, sent, failed, skipped })
    return Response.json({ sent, failed, skipped, excluded: preview.excluded, delivery }, { headers: log.headers({ 'Cache-Control': 'private, no-store' }) })
  } catch (error) {
    log.error('admin.bulk_failed', errorDetails(error))
    if (isMissingAdminProgramTables(error)) {
      log.finish(503, { outcome: 'program_migration_required' })
      return Response.json({ error: 'Program operations are temporarily unavailable until migration 0025 is applied.' }, { status: 503, headers: log.headers() })
    }
    log.finish(500, { outcome: 'bulk_failed' })
    return Response.json({ error: 'The bulk action could not be completed.' }, { status: 500, headers: log.headers() })
  }
}
