/**
 * The dispatch seam between the application and the email provider.
 *
 * A caller names a message kind and its data; this module renders the template,
 * chooses the recipient, honours the feature flag and hands a finished message
 * to the isolated provider. It is the email equivalent of the credit gate: it
 * never throws into the caller's path, because a receipt or an alert failing to
 * send must never break the payment, sign-up or feedback that triggered it.
 */

import { errorDetails, logEvent } from '@/lib/observability'
import { emailSettings, isEmailConfigured, qualityAlertRecipients } from '@/lib/email/config'
import { createEmailProvider, EmailError, type EmailProvider } from '@/lib/email/provider'
import {
  allowanceRenewedEmail,
  feedbackReceiptEmail,
  lowCreditEmail,
  paymentReceiptEmail,
  qualityUrgentAlertEmail,
  welcomeEmail,
  type RenderedEmail,
} from '@/lib/email/templates'

export type EmailKind =
  | 'welcome'
  | 'payment_receipt'
  | 'credit_low_balance'
  | 'credit_allowance_renewed'
  | 'feedback_receipt'
  | 'quality_urgent_alert'

type EmailPayloads = {
  welcome: { name?: string | null }
  payment_receipt: { name?: string | null; planName: string; amountGhs: number; credits: number; orderId: string }
  credit_low_balance: { name?: string | null; available: number; planName: string }
  credit_allowance_renewed: { name?: string | null; credits: number; planName: string }
  feedback_receipt: { name?: string | null; reference: string; urgent: boolean }
  quality_urgent_alert: { reference: string; severity: string; category: string; summary: string }
}

const RENDERERS: { [K in EmailKind]: (data: EmailPayloads[K]) => RenderedEmail } = {
  welcome: welcomeEmail,
  payment_receipt: paymentReceiptEmail,
  credit_low_balance: lowCreditEmail,
  credit_allowance_renewed: allowanceRenewedEmail,
  feedback_receipt: feedbackReceiptEmail,
  quality_urgent_alert: qualityUrgentAlertEmail,
}

/** Low-cardinality provider tags. `kind` is always safe; extra tags are opt-in. */
function tagsFor<K extends EmailKind>(kind: K, data: EmailPayloads[K]): Record<string, string> {
  const tags: Record<string, string> = { kind }
  if (kind === 'payment_receipt') tags.plan = (data as EmailPayloads['payment_receipt']).planName.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'plan'
  return tags
}

export type EmailDeliveryResult =
  | { delivered: true; id: string }
  | { delivered: false; reason: 'disabled' | 'no_recipient' | 'rejected' | 'unavailable' | 'error' }

/**
 * Render and send one message. Resolves with a result rather than throwing.
 *
 * Staff alerts (`quality_urgent_alert`) go to the configured reviewer list;
 * every other kind goes to the `to` address the caller supplies. A kind that
 * needs a recipient but has none is a no-op, not a failure of the trigger.
 */
export async function deliverEmail<K extends EmailKind>(
  kind: K,
  input: { to?: string | null; data: EmailPayloads[K] },
  provider: EmailProvider = createEmailProvider(),
): Promise<EmailDeliveryResult> {
  if (!isEmailConfigured()) {
    logEvent('info', 'email.skipped', { kind, reason: 'disabled' })
    return { delivered: false, reason: 'disabled' }
  }

  const { from, replyTo } = emailSettings()
  const to = kind === 'quality_urgent_alert' ? qualityAlertRecipients() : (input.to ? [input.to.trim()] : [])
  if (!to.length) {
    logEvent('info', 'email.skipped', { kind, reason: 'no_recipient' })
    return { delivered: false, reason: 'no_recipient' }
  }

  const rendered = RENDERERS[kind](input.data)

  try {
    const result = await provider.send({
      to,
      from,
      replyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: tagsFor(kind, input.data),
    })
    logEvent('info', 'email.delivered', { kind, provider: result.provider, messageId: result.id, recipientCount: to.length })
    return { delivered: true, id: result.id }
  } catch (error) {
    const reason = error instanceof EmailError && (error.code === 'rejected' || error.code === 'unavailable')
      ? error.code
      : 'error'
    logEvent('error', 'email.delivery_failed', {
      kind,
      ...(error instanceof EmailError ? { emailCode: error.code } : {}),
      ...errorDetails(error),
    })
    return { delivered: false, reason }
  }
}

/**
 * Fire-and-forget delivery for a caller that must not wait on the provider —
 * a webhook or a payment callback that has already done its durable work. In a
 * request context prefer wrapping this in `after(...)` so it runs post-response.
 */
export function deliverEmailSafe<K extends EmailKind>(
  kind: K,
  input: { to?: string | null; data: EmailPayloads[K] },
): Promise<EmailDeliveryResult> {
  return deliverEmail(kind, input).catch(() => ({ delivered: false as const, reason: 'error' as const }))
}
