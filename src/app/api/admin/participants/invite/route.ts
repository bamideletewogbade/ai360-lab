import { z } from 'zod'
import { getOptionalAuthContext } from '@/lib/auth'
import { canSendAdminEmail, isAdminOperator } from '@/lib/admin/access'
import {
  claimInvitationSend,
  finishInvitationSend,
  isMissingAdminInvitationTables,
  listSendableInvitations,
} from '@/lib/admin/invitations'
import {
  COPY_LIMITS,
  participantCopyFor,
  renderAdminParticipantEmail,
  reviewParticipantCopy,
} from '@/lib/admin/participant-email'
import { createEmailProvider, EmailError } from '@/lib/email/provider'
import { emailSettings, isEmailConfigured } from '@/lib/email/config'
import {
  createUnsubscribeToken,
  unsubscribeHeaders,
  unsubscribeUrl,
} from '@/lib/email/unsubscribe'
import { FUNNEL_INVITATION_PARAM } from '@/lib/funnel/contract'
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
/**
 * Invitations one request may send.
 *
 * Sized above a full pilot cohort on purpose: at 50 an operator with 63
 * participants pressed "Select all", got a bare 400 that named no limit, and
 * had no way to tell that the batch size was the problem. Sends are paced at
 * `SEND_INTERVAL_MS`, so a full run of this size takes roughly 35 seconds plus
 * provider latency — comfortably inside a request timeout, and the reason this
 * is not simply unbounded.
 */
const MAX_PER_RUN = 75

/**
 * Per-send wording edits.
 *
 * Words only. There is deliberately no field here for the destination link,
 * the layout, the sender or the opt-out — those are what make a bulk send safe,
 * and the editor exists to change the message, not the mechanics.
 */
const CopyOverride = z.object({
  subject: z.string().trim().max(COPY_LIMITS.subject).optional(),
  heading: z.string().trim().max(COPY_LIMITS.heading).optional(),
  body: z.string().trim().max(COPY_LIMITS.body).optional(),
  cta: z.string().trim().max(COPY_LIMITS.cta).optional(),
  detail: z.string().trim().max(COPY_LIMITS.detail).optional(),
  closing: z.string().trim().max(COPY_LIMITS.closing).optional(),
  steps: z.array(z.string().trim().max(COPY_LIMITS.step)).max(COPY_LIMITS.steps).optional(),
})

const InviteRequest = z.object({
  mode: z.enum(['preview', 'send']),
  invitationIds: z.array(z.string().min(2).max(160).regex(/^[A-Za-z0-9._:-]+$/)).min(1).max(MAX_PER_RUN),
  programKey: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._:-]+$/).default('pilot'),
  operatorNote: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/).optional(),
  copy: CopyOverride.optional(),
  /**
   * Which recipient the preview should be rendered as. The greeting and the
   * name correction differ per person, so previewing a fixed recipient hides
   * exactly the fault most worth catching before a bulk send.
   */
  previewInvitationId: z.string().min(2).max(160).regex(/^[A-Za-z0-9._:-]+$/).optional(),
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

    const payload = await request.json().catch(() => null)

    // Checked before the schema so an oversized batch says how many it may
    // take. Zod's failure is indistinguishable from a malformed id, and
    // "Review the selected invitations" sent an operator hunting through a
    // valid list for a fault that was not in it.
    const requested = Array.isArray((payload as { invitationIds?: unknown })?.invitationIds)
      ? ((payload as { invitationIds: unknown[] }).invitationIds).length
      : 0
    if (requested > MAX_PER_RUN) {
      return Response.json({
        error: `Send at most ${MAX_PER_RUN} invitations at a time. ${requested} are selected — send them in batches.`,
        status: 'batch_too_large',
        limit: MAX_PER_RUN,
        selected: requested,
      }, { status: 400, headers: log.headers() })
    }

    const parsed = InviteRequest.safeParse(payload)
    if (!parsed.success) return Response.json({ error: 'Review the selected invitations.' }, { status: 400, headers: log.headers() })
    const body = parsed.data

    const invitations = await listSendableInvitations({
      ids: [...new Set(body.invitationIds)],
      programKey: body.programKey,
    })
    const unavailable = body.invitationIds.filter((id) => !invitations.some((item) => item.id === id))

    if (body.mode === 'preview') {
      // Render as whoever the operator is looking at, not always the first row.
      const subject = invitations.find((item) => item.id === body.previewInvitationId) ?? invitations[0]
      const sample = subject
        ? renderAdminParticipantEmail({
          template: 'pilot_invite',
          displayName: subject.displayName,
          email: subject.email,
          operatorNote: body.operatorNote,
          // The real link is minted at send time; a preview must not burn one.
          actionUrl: `${emailSettings().appUrl}/auth/callback`,
          unsubscribeUrl: `${emailSettings().appUrl}/api/email/unsubscribe?token=preview`,
          copyOverride: body.copy,
        })
        : null
      return Response.json({
        eligible: invitations.map((item) => ({ id: item.id, email: item.email, displayName: item.displayName, sendAttempts: item.sendAttempts })),
        unavailable,
        // The written copy, so the editor can start from it and reset to it.
        defaults: participantCopyFor('pilot_invite'),
        // Advisory only. An operator may have a reason; they should just know.
        warnings: reviewParticipantCopy(body.copy ?? {}),
        sample: sample
          ? {
            subject: sample.subject,
            text: sample.text,
            // The HTML is what almost every recipient will actually see, so a
            // preview that showed only the plain-text half was previewing the
            // fallback rather than the message.
            html: sample.html,
            renderedFor: { id: subject.id, email: subject.email, displayName: subject.displayName },
          }
          : null,
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

      // The invitation id rides along to the workspace so the funnel can say
      // which invited person a visit belonged to. `safeInternalPath` keeps the
      // query string, and the tracker strips it from the address bar on
      // arrival so it is never carried into a shared link or a screenshot. It
      // is an analytics tag only: claiming an invitation is done by verified
      // email address, so the id grants nothing to whoever holds it.
      const landing = `/app?${FUNNEL_INVITATION_PARAM}=${encodeURIComponent(invitation.id)}`
      const callback = `${settings.appUrl}/auth/callback`
      const invite = await generateInviteLink({
        email: invitation.email,
        redirectTo: `${callback}?next=${encodeURIComponent(landing)}`,
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

      /**
       * Point the button at our own callback carrying the hashed token, rather
       * than at Supabase's `/verify` endpoint.
       *
       * `/verify` finishes by putting the session in the URL *fragment*. A
       * server route cannot read a fragment, and the `@supabase/ssr` browser
       * client is looking for a PKCE `code` that a server-minted link never
       * has — so the recipient arrived at the app signed out, the callback set
       * `auth_error=callback_failed`, and `claimInvitationOnSignIn` never ran.
       * Their credits and membership waited for a sign-in that had, from the
       * app's point of view, not happened.
       *
       * Verifying the token in our own callback produces a real server session,
       * which is the only path on which the claim can fire. Supabase's link is
       * kept as a fallback for the case where no hashed token comes back.
       */
      const actionUrl = invite.hashedToken
        ? `${callback}?token_hash=${encodeURIComponent(invite.hashedToken)}&type=invite&next=${encodeURIComponent(landing)}`
        : invite.link
      if (!invite.hashedToken) {
        // Still worth sending — Supabase's own link at least reaches the site —
        // but it is worth knowing that this recipient took the weaker path.
        log.info('admin.invitation_link_fallback', { invitationId: invitation.id })
      }

      const token = createUnsubscribeToken({ kind: 'invitation', invitationId: invitation.id, programKey: invitation.programKey })
      const optOut = token ? unsubscribeUrl(token) : null
      const rendered = renderAdminParticipantEmail({
        template: 'pilot_invite',
        displayName: invitation.displayName,
        email: invitation.email,
        operatorNote: body.operatorNote,
        actionUrl,
        unsubscribeUrl: optOut,
        // The same edits the operator previewed. Applied per recipient, so the
        // greeting and the correction still come from their own record.
        copyOverride: body.copy,
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
    // Which fields an operator rewrote, and whether the wording review objected.
    // Recorded because "what exactly did we send to those sixty-three people"
    // is unanswerable afterwards otherwise — the copy is not stored per send.
    const editedFields = Object.entries(body.copy ?? {})
      .filter(([, value]) => value !== undefined)
      .map(([field]) => field)
    log.finish(200, {
      outcome: 'success',
      sent,
      failed,
      skipped,
      ...(editedFields.length
        ? { copyEdited: editedFields, copyWarnings: reviewParticipantCopy(body.copy ?? {}) }
        : {}),
    })
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
