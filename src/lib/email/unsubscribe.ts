import { createHmac, timingSafeEqual } from 'node:crypto'

import { emailSettings } from '@/lib/email/config'

/**
 * Signed unsubscribe links.
 *
 * Bulk participant mail needs a working opt-out in every message, and the
 * schema has modelled `email_status = 'unsubscribed'` since 0025 without
 * anything able to set it. A signed token avoids a second table: the link
 * carries who is opting out and proves it was issued by us, so nothing has to
 * be stored between sending the mail and someone clicking a year later.
 *
 * Two kinds exist because the two audiences are stored differently. A member
 * has a program membership whose `email_status` can be flipped; an invitee has
 * no account at all, so opting out revokes the invitation instead.
 */

/** Opt-out links must keep working long after the campaign that sent them. */
const MAX_TOKEN_AGE_MS = 400 * 24 * 60 * 60 * 1_000

export type UnsubscribeSubject =
  | { kind: 'member'; userId: string; programKey: string }
  | { kind: 'invitation'; invitationId: string; programKey: string }

/**
 * Prefers a dedicated secret, and falls back to the service-role key so that
 * an opt-out link is never silently dropped from a deployment that simply has
 * not set one more variable. An HMAC key is never revealed by its output, so
 * the fallback does not expose the key it borrows.
 */
function tokenSecret() {
  return (
    process.env.AI360_EMAIL_UNSUBSCRIBE_SECRET?.trim()
    || process.env.SUPABASE_SECRET_KEY?.trim()
    || ''
  )
}

export function isUnsubscribeConfigured() {
  return tokenSecret().length >= 16
}

function sign(payload: string) {
  return createHmac('sha256', tokenSecret()).update(payload).digest('base64url')
}

export function createUnsubscribeToken(subject: UnsubscribeSubject): string | null {
  if (!isUnsubscribeConfigured()) return null
  const body = subject.kind === 'member'
    ? { k: 'm', s: subject.userId, p: subject.programKey, t: Date.now() }
    : { k: 'i', s: subject.invitationId, p: subject.programKey, t: Date.now() }
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function readUnsubscribeToken(token: string | null | undefined): UnsubscribeSubject | null {
  if (!token || !isUnsubscribeConfigured()) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null

  const expected = createHmac('sha256', tokenSecret()).update(payload).digest()
  let supplied: Buffer
  try {
    supplied = Buffer.from(signature, 'base64url')
  } catch {
    return null
  }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      k?: unknown; s?: unknown; p?: unknown; t?: unknown
    }
    if (typeof parsed.s !== 'string' || typeof parsed.p !== 'string' || typeof parsed.t !== 'number') return null
    if (Date.now() - parsed.t > MAX_TOKEN_AGE_MS) return null
    if (parsed.k === 'm') return { kind: 'member', userId: parsed.s, programKey: parsed.p }
    if (parsed.k === 'i') return { kind: 'invitation', invitationId: parsed.s, programKey: parsed.p }
    return null
  } catch {
    return null
  }
}

export function unsubscribeUrl(token: string) {
  const { appUrl } = emailSettings()
  return `${appUrl}/api/email/unsubscribe?token=${encodeURIComponent(token)}`
}

/**
 * The RFC 8058 header pair. Mail clients that honour it show their own
 * one-click opt-out, which keeps complaints away from the spam button and out
 * of the sending domain's reputation.
 */
export function unsubscribeHeaders(url: string) {
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}
