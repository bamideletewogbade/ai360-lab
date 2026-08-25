/**
 * The email provider seam.
 *
 * Every provider detail — the Resend endpoint, the request shape, the error
 * mapping — lives here, exactly as the ExpressPay adapter isolates its own
 * provider. Nothing above this file knows which service delivers the mail, so a
 * provider change never reaches the dispatch or template layers.
 */

export type EmailAddress = string

export type EmailMessage = {
  to: EmailAddress | EmailAddress[]
  from: string
  subject: string
  html: string
  text: string
  replyTo?: string | null
  /** Low-cardinality labels for provider-side filtering, e.g. kind + plan. */
  tags?: Record<string, string>
  /**
   * Raw RFC headers. Present for `List-Unsubscribe`, which has to reach the
   * recipient's mail client as a header rather than as body content.
   */
  headers?: Record<string, string>
}

export type EmailSendResult = {
  id: string
  provider: string
}

export class EmailError extends Error {
  readonly code: 'not_configured' | 'invalid_message' | 'rejected' | 'rate_limited' | 'unavailable' | 'bad_response'

  constructor(
    code: 'not_configured' | 'invalid_message' | 'rejected' | 'rate_limited' | 'unavailable' | 'bad_response',
    message: string,
  ) {
    super(message)
    this.name = 'EmailError'
    this.code = code
  }
}

export interface EmailProvider {
  readonly name: string
  send(message: EmailMessage): Promise<EmailSendResult>
}

const TAG_KEY = /^[A-Za-z0-9_-]{1,32}$/
const TAG_VALUE = /^[A-Za-z0-9_-]{1,64}$/

/** Resend accepts only ASCII-safe, bounded tag keys and values. */
function cleanTags(tags: Record<string, string> | undefined) {
  if (!tags) return undefined
  const entries = Object.entries(tags)
    .filter(([key, value]) => TAG_KEY.test(key) && TAG_VALUE.test(value))
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }))
  return entries.length ? entries : undefined
}

/**
 * Header injection is the risk here: a newline in a value would let a caller
 * append headers of its own, so anything carrying one is dropped rather than
 * trimmed into something that merely looks safe.
 */
function cleanHeaders(headers: Record<string, string> | undefined) {
  if (!headers) return undefined
  const entries = Object.entries(headers)
    .filter(([name, value]) => /^[A-Za-z0-9-]{1,64}$/.test(name) && !/[\r\n]/.test(value) && value.length <= 998)
    .slice(0, 10)
  return entries.length ? Object.fromEntries(entries) : undefined
}

function recipients(to: EmailAddress | EmailAddress[]) {
  const list = (Array.isArray(to) ? to : [to]).map((value) => value.trim()).filter(Boolean)
  if (!list.length) throw new EmailError('invalid_message', 'An email needs at least one recipient.')
  return list.slice(0, 50)
}

/**
 * Resend's REST transport. `fetcher` is injectable so the dispatch layer and
 * tests can drive it without a live key or network.
 */
export function createResendProvider(fetcher: typeof fetch = fetch): EmailProvider {
  return {
    name: 'resend',

    async send(message: EmailMessage): Promise<EmailSendResult> {
      const apiKey = process.env.RESEND_API_KEY?.trim()
      if (!apiKey) throw new EmailError('not_configured', 'The email provider key is not configured.')
      if (!message.subject.trim() || !message.html.trim()) {
        throw new EmailError('invalid_message', 'An email needs a subject and a body.')
      }

      let response: Response
      try {
        response = await fetcher('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: message.from,
            to: recipients(message.to),
            subject: message.subject.slice(0, 200),
            html: message.html,
            text: message.text,
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
            ...(cleanTags(message.tags) ? { tags: cleanTags(message.tags) } : {}),
            ...(cleanHeaders(message.headers) ? { headers: cleanHeaders(message.headers) } : {}),
          }),
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        })
      } catch {
        throw new EmailError('unavailable', 'The email provider could not be reached.')
      }

      if (response.status === 401 || response.status === 403) {
        throw new EmailError('not_configured', 'The email provider rejected the credentials.')
      }
      if (response.status === 422 || response.status === 400) {
        throw new EmailError('rejected', 'The email provider rejected the message.')
      }
      // Distinguished from a general outage because it is worth waiting out:
      // a bulk run pacing itself can retry this, but not a rejection.
      if (response.status === 429) {
        throw new EmailError('rate_limited', 'The email provider is rate limiting this sender.')
      }
      if (!response.ok) {
        throw new EmailError('unavailable', `The email provider returned HTTP ${response.status}.`)
      }

      let payload: { id?: unknown }
      try {
        payload = await response.json() as { id?: unknown }
      } catch {
        throw new EmailError('bad_response', 'The email provider returned an unreadable response.')
      }
      const id = typeof payload.id === 'string' ? payload.id : ''
      if (!id) throw new EmailError('bad_response', 'The email provider did not return a message ID.')

      return { id, provider: 'resend' }
    },
  }
}

/** Resolves the configured provider. Only Resend exists today. */
export function createEmailProvider(fetcher: typeof fetch = fetch): EmailProvider {
  return createResendProvider(fetcher)
}
