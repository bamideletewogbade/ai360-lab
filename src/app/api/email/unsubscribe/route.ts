import { setAdminEmailStatus } from '@/lib/admin/programs'
import { unsubscribeInvitation } from '@/lib/admin/invitations'
import { readUnsubscribeToken, type UnsubscribeSubject } from '@/lib/email/unsubscribe'
import { escapeHtml } from '@/lib/email/templates'
import { emailSettings } from '@/lib/email/config'
import { isPostgresConfigured } from '@/lib/postgres'
import { errorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The opt-out endpoint linked from every participant message.
 *
 * A GET only *offers* to unsubscribe; the change happens on POST. Mail clients
 * and security scanners routinely fetch every link in a message, and a GET that
 * acted would opt people out who never clicked anything. The exception is the
 * RFC 8058 one-click POST, which mail clients send directly — that is a real
 * request from the recipient's own client, so it is honoured immediately.
 *
 * The page never reveals whether a token matched anything. Confirming that an
 * address is in the pilot would make the link an oracle for anyone who got hold
 * of a forwarded email.
 */

function page(title: string, body: string, form?: string) {
  const { appUrl, brandName } = emailSettings()
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#f1efe8;padding:48px 16px;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#171918;"><main style="max-width:520px;margin:auto;background:#fff;border:1px solid #dedbd1;border-radius:16px;padding:32px;"><p style="margin:0 0 18px;font-weight:800;">${escapeHtml(brandName)}</p><h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;">${escapeHtml(title)}</h1><p style="margin:0;color:#515550;line-height:1.6;">${escapeHtml(body)}</p>${form || ''}<p style="margin:26px 0 0;font-size:13px;"><a href="${escapeHtml(appUrl)}" style="color:#777b75;">Return to ${escapeHtml(brandName)}</a></p></main></body></html>`
}

function html(markup: string, status = 200) {
  return new Response(markup, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  })
}

async function applyUnsubscribe(subject: UnsubscribeSubject) {
  if (subject.kind === 'member') {
    return setAdminEmailStatus({
      userId: subject.userId,
      programKey: subject.programKey,
      status: 'unsubscribed',
    })
  }
  return unsubscribeInvitation(subject.invitationId)
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  if (!readUnsubscribeToken(token)) {
    return html(page(
      'This link is no longer valid',
      'The unsubscribe link has expired or was not complete. Reply to any message from us and we will take you off the list.',
    ), 400)
  }
  const form = `<form method="post" style="margin:24px 0 0;"><input type="hidden" name="token" value="${escapeHtml(token || '')}"><button type="submit" style="padding:12px 18px;border:0;border-radius:9px;background:#171918;color:#fff;font-weight:700;font-size:15px;cursor:pointer;">Unsubscribe me</button></form>`
  return html(page(
    'Stop receiving pilot email?',
    'Confirm below and we will stop sending you messages about the AI360 pilot. This does not close your account or affect anything you have created.',
    form,
  ))
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/email/unsubscribe')
  try {
    const url = new URL(request.url)
    let token = url.searchParams.get('token')
    if (!token) {
      // Browser form posts arrive as form data; RFC 8058 one-click posts carry
      // the token in the query string of the header URL instead.
      const body = await request.formData().catch(() => null)
      const supplied = body?.get('token')
      token = typeof supplied === 'string' ? supplied : null
    }

    const subject = readUnsubscribeToken(token)
    if (!subject) {
      log.finish(400, { outcome: 'invalid_token' })
      return html(page(
        'This link is no longer valid',
        'The unsubscribe link has expired or was not complete. Reply to any message from us and we will take you off the list.',
      ), 400)
    }
    if (!isPostgresConfigured()) {
      log.finish(503, { outcome: 'not_configured' })
      return html(page(
        'We could not complete that just now',
        'Something on our side is unavailable. Please try again shortly, or reply to any message from us.',
      ), 503)
    }

    const applied = await applyUnsubscribe(subject)
    // Reported identically either way: a token that matched nothing must not be
    // distinguishable from one that did.
    log.finish(200, { outcome: 'success', kind: subject.kind, applied })
    return html(page(
      'You have been unsubscribed',
      'You will not receive further email about the AI360 pilot. If this was a mistake, reply to any earlier message and we will add you back.',
    ))
  } catch (error) {
    log.error('email.unsubscribe_failed', errorDetails(error))
    log.finish(500, { outcome: 'unsubscribe_failed' })
    return html(page(
      'We could not complete that just now',
      'Something went wrong on our side. Please try again shortly, or reply to any message from us.',
    ), 500)
  }
}
