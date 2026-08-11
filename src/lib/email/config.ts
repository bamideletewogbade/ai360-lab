/**
 * Configuration for the transactional email plane.
 *
 * Email is provider-isolated behind `provider.ts` and disabled by default. It
 * only sends once `EMAIL_ENABLED=true` and a provider key and a credential-free
 * `EMAIL_FROM` address are present, which mirrors how billing and the browser
 * pilot stay dark until their external service is verified. Clerk continues to
 * send its own authentication mail (verification, password reset, magic links);
 * this plane is only for application messages such as receipts and alerts.
 */

const FROM_PATTERN = /^(?:[^<>]{1,64}<)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}>?$/

export function emailProviderName() {
  return (process.env.EMAIL_PROVIDER || 'resend').trim().toLowerCase()
}

/** The flag alone. Present so callers can distinguish "off" from "misconfigured". */
export function emailEnabled() {
  return process.env.EMAIL_ENABLED === 'true'
}

/** True only when email may actually be sent: enabled, keyed and addressed. */
export function isEmailConfigured() {
  return (
    emailEnabled() &&
    Boolean(process.env.RESEND_API_KEY?.trim()) &&
    FROM_PATTERN.test((process.env.EMAIL_FROM || '').trim())
  )
}

export function emailSettings() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://lab.aithreesixty.tech').replace(/\/+$/, '')
  return {
    from: (process.env.EMAIL_FROM || 'AI360 Lab <lab@aithreesixty.tech>').trim(),
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || null,
    appUrl,
    brandName: 'AI360 Lab',
    supportUrl: `${appUrl}/feedback`,
  }
}

/** Staff addresses that receive urgent quality (S0/S1) alerts. */
export function qualityAlertRecipients() {
  return (process.env.AI360_QUALITY_ALERT_EMAILS || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => FROM_PATTERN.test(value))
    .slice(0, 20)
}

/** The balance at or below which a low-credit notice is offered, in credits. */
export function lowCreditThreshold() {
  const value = Number(process.env.AI360_LOW_CREDIT_THRESHOLD)
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 5
}
