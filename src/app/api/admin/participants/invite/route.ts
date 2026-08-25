import { z } from 'zod'
import { getOptionalAuthContext } from '@/lib/auth'
import { canSendAdminEmail, isAdminOperator } from '@/lib/admin/access'
import {
  claimInvitationSend,
  finishInvitationSend,
  isMissingAdminInvitationTables,
  listSendableInvitations,
} from '@/lib/admin/invitations'
import { renderAdminParticipantEmail } from '@/lib/admin/participant-email'
import { createEmailProvider, EmailError } from '@/lib/email/provider'
import { emailSettings, isEmailConfigured } from '@/lib/email/config'
import {
  createUnsubscribeToken,
  unsubscribeHeaders,
  unsubscribeUrl,
} from '@/lib/email/unsubscribe'
import { generateInviteLink, isSupabaseAdminConfigured } from '@/lib/supabase/admin'
import { isPostgresConfigured } from '@/lib/postgres'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'

/**
 * Sends the branded invitation, carrying a single-use sign-up link.
 *
 * Supabase could mail the link itself, but its template is not ours and its
 * send would not appear in any ledger. Taking only the link and delivering it
 * through the participant template keeps the invitation indistinguishable from
 * every other message the module sends: same branding, same audit trail, same
 * opt-out.
 */

/**
 * Resend's default allowance is roughly two requests a second. Pacing under
 * that is cheaper than discovering the ceiling and retrying, and at pilot sizes
 * the whole run still finishes inside a single request.
 */
const SEND_INTERVAL_MS = 450
const RATE_LIMIT_BACKOFF_MS = 2_000
const MAX_PER_RUN = 50

const InviteRequest = z.object({
  mode: z.enum(['preview', 'send']),
  invitationIds: z.array(z.string().min(2).max(160).regex(/^[A-Za-z0-9._:-]+$/)).min(1).max(MAX_PER_RUN),
  programKey: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._:-]+$/).default('pilot'),
  operatorNote: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/).optional(),
})

function wait(ms: number) {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/admin/participants/invite')
  try {
    const operator = await getOptionalAuthContext()
    if (!operator) return Response.json({ error: 'Sign in to send invitations.' }, { status: 401, headers: log.headers() })
    if (!isAdminOperator(operator)) return Response.json({ error: 'Approved operator access is required.' }, { status: 403, headers: log.headers() })
    if (!canSendAdminEmail(operator)) return Response.json({ error: 'Email-operator access is required.' }, { status: 403, headers: log.headers() })
    if (!isPostgresConfigured()) return Response.json({ error: 'Admin operations are not connected yet.' }, { status: 503, headers: log.headers() })

    const parsed = InviteRequest.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: 'Review the selected invitations.' }, { status: 400, headers: log.headers() })
    const body = parsed.data

    const invitations = await listSendableInvitations({
      ids: [...new Set(body.invitationIds)],
      programKey: body.programKey,
    })
    const unavailable = body.invitationIds.filter((id) => !invitations.some((item) => item.id === id))

    if (body.mode === 'preview') {
      const first = invitations[0]
      const sample = first
        ? renderAdminParticipantEmail({
          template: 'pilot_invite',
          displayName: first.displayName,
          email: first.email,
          operatorNote: body.operatorNote,
          // The real link is minted at send time; a preview must not burn one.
          actionUrl: `${emailSettings().appUrl}/auth/callback`,
          unsubscribeUrl: `${emailSettings().appUrl}/api/email/unsubscribe?token=preview`,
        })
        : null
      return Response.json({
        eligible: invitations.map((item) => ({ id: item.id, email: item.email, displayName: item.displayName, sendAttempts: item.sendAttempts })),
        unavailable,
        sample: sample ? { subject: sample.subject, text: sample.text } : null,
      }, { headers: log.headers({ 'Cache-Control': 'private, no-store' }) })
    }

    if (!isEmailConfigured()) return Response.json({ error: 'Participant email delivery is not configured.' }, { status: 503, headers: log.headers() })
    if (!isSupabaseAdminConfigured()) return Response.json({ error: 'Invitation links require the Supabase service role key.' }, { status: 503, headers: log.headers() })
    if (!body.idempotencyKey) return Response.json({ error: 'A delivery key is required.' }, { status: 400, headers: log.headers() })

    const provider = createEmailProvider()
    const settings = emailSettings()
    const results: Array<{ id: string; email: string; status: 'sent' | 'failed' | 'skipped'; reason?: string }> = []

    for (const [index, invitation] of invitations.entries()) {
      if (index > 0) await wait(SEND_INTERVAL_MS)

      // Claimed before the link is minted, so a retried request can never send
      // the same invitation twice even if the first attempt was slow.
      const eventId = await claimInvitationSend({
        invitationId: invitation.id,
        actorId: operator.userId,
        recipientEmail: invitation.email,
        resend: invitation.sendAttempts > 0,
        idempotencyKey: `${body.idempotencyKey}:${invitation.id}`,
      })
      if (!eventId) {
        results.push({ id: invitation.id, email: invitation.email, status: 'skipped', reason: 'already_claimed' })
        continue
      }

      const invite = await generateInviteLink({
        email: invitation.email,
        redirectTo: `${settings.appUrl}/auth/callback?next=/app`,
      })
      if (!invite) {
        // Supabase declines an address that already has an account. That is a
        // state change, not a delivery failure, so it is not worth retrying.
        await finishInvitationSend({
          eventId, invitationId: invitation.id, deliveryStatus: 'failed',
          failureReason: 'link_unavailable',
        })
        results.push({ id: invitation.id, email: invitation.email, status: 'failed', reason: 'link_unavailable' })
        continue
      }

      const token = createUnsubscribeToken({ kind: 'invitation', invitationId: invitation.id, programKey: invitation.programKey })
      const optOut = token ? unsubscribeUrl(token) : null
      const rendered = renderAdminParticipantEmail({
        template: 'pilot_invite',
        displayName: invitation.displayName,
        email: invitation.email,
        operatorNote: body.operatorNote,
        actionUrl: invite.link,
        unsubscribeUrl: optOut,
      })

      const send = () => provider.send({
        to: invitation.email,
        from: settings.from,
        replyTo: settings.replyTo,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        tags: { kind: 'pilot_invite', template: 'pilot_invite' },
        ...(optOut ? { headers: unsubscribeHeaders(optOut) } : {}),
      })

      let providerMessageId: string | null = null
      let failureReason: string | null = null
      try {
        providerMessageId = (await send()).id
      } catch (error) {
        // One retry, and only for the one failure that waiting actually fixes.
        if (error instanceof EmailError && error.code === 'rate_limited') {
          await wait(RATE_LIMIT_BACKOFF_MS)
          try {
            providerMessageId = (await send()).id
          } catch (retryError) {
            failureReason = retryError instanceof EmailError ? retryError.code : 'delivery_error'
          }
        } else {
          failureReason = error instanceof EmailError ? error.code : 'delivery_error'
        }
      }

      const status = providerMessageId ? 'sent' as const : 'failed' as const
      await finishInvitationSend({
        eventId, invitationId: invitation.id, deliveryStatus: status,
        providerMessageId, failureReason,
      })
      results.push({ id: invitation.id, email: invitation.email, status, ...(failureReason ? { reason: failureReason } : {}) })
    }

    const sent = results.filter((item) => item.status === 'sent').length
    const failed = results.filter((item) => item.status === 'failed').length
    const skipped = results.filter((item) => item.status === 'skipped').length
    log.finish(200, { outcome: 'success', sent, failed, skipped })
    return Response.json({ sent, failed, skipped, unavailable, results }, {
      headers: log.headers({ 'Cache-Control': 'private, no-store' }),
    })
  } catch (error) {
    log.error('admin.participant_invite_failed', errorDetails(error))
    if (isMissingAdminInvitationTables(error)) {
      log.finish(503, { outcome: 'invitation_migration_required' })
      return Response.json({ error: 'Participant invitations are unavailable until migration 0026 is applied.' }, { status: 503, headers: log.headers() })
    }
    log.finish(500, { outcome: 'invite_failed' })
    return Response.json({ error: 'The invitations could not be sent.' }, { status: 500, headers: log.headers() })
  }
}
