/**
 * Email templates.
 *
 * Every function here is pure: it takes plain data and returns a subject and a
 * matched HTML and plain-text body. No provider, no environment, no I/O, so the
 * wording and markup can be unit-tested directly. All caller-supplied values are
 * HTML-escaped before they reach the markup, because an email body is untrusted
 * HTML the moment it contains a name a person chose for themselves.
 */

import { emailSettings } from '@/lib/email/config'
import { CREDIT_TOP_UPS, FREE_MONTHLY_CREDITS } from '@/lib/billing/catalog'

export type RenderedEmail = { subject: string; html: string; text: string }

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function firstName(name: string | null | undefined) {
  const cleaned = (name || '').trim().split(/\s+/)[0]
  return cleaned ? escapeHtml(cleaned.slice(0, 40)) : 'there'
}

function ghs(amountGhs: number) {
  const value = Number.isFinite(amountGhs) ? amountGhs : 0
  return `GH₵${value.toFixed(2)}`
}

/** Top-up sizes, read from the catalogue so email never quotes a stale figure. */
function topUpRange() {
  const sizes = CREDIT_TOP_UPS.map((topUp) => topUp.credits)
  return `${sizes[0]}–${sizes[sizes.length - 1]}`
}

/**
 * The one place the visual frame is defined. A single-column, inline-styled
 * layout is deliberate: email clients strip <style> blocks and external CSS, so
 * every rule has to live on the element.
 */
function layout(input: { heading: string; bodyHtml: string; cta?: { label: string; href: string } }): string {
  const { brandName, appUrl } = emailSettings()
  const cta = input.cta
    ? `<tr><td style="padding:8px 0 4px;">
         <a href="${escapeHtml(input.cta.href)}" style="display:inline-block;background:#101112;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;font-size:15px;">${escapeHtml(input.cta.label)}</a>
       </td></tr>`
    : ''
  return `<!doctype html>
<html lang="en">
<body style="margin:0;background:#f4f2ec;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#101112;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2ded4;border-radius:16px;">
    <tr><td style="padding:28px 32px 8px;">
      <a href="${escapeHtml(appUrl)}" style="text-decoration:none;color:#101112;font-weight:800;letter-spacing:0.02em;font-size:18px;">AI360</a>
    </td></tr>
    <tr><td style="padding:8px 32px 4px;">
      <h1 style="margin:0;font-size:21px;line-height:1.3;">${escapeHtml(input.heading)}</h1>
    </td></tr>
    <tr><td style="padding:8px 32px 20px;font-size:15px;line-height:1.6;color:#2b2d2f;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${input.bodyHtml}
        ${cta}
      </table>
    </td></tr>
    <tr><td style="padding:16px 32px 28px;border-top:1px solid #efece4;font-size:12px;line-height:1.6;color:#8a8d90;">
      ${escapeHtml(brandName)} · You are receiving this because you have an account with AI360.
    </td></tr>
  </table>
</body>
</html>`
}

function paragraph(text: string) {
  return `<tr><td style="padding:6px 0;">${text}</td></tr>`
}

// ---------------------------------------------------------------------------
// Account lifecycle
// ---------------------------------------------------------------------------

export function welcomeEmail(data: { name?: string | null }): RenderedEmail {
  const { appUrl } = emailSettings()
  const name = firstName(data.name)
  const subject = 'Welcome to AI360'
  const html = layout({
    heading: `Welcome, ${name}.`,
    bodyHtml:
      paragraph('Your workspace is ready. Everything you create — conversations, projects and files — now stays with you across every device.') +
      paragraph(`You are on the free Explorer plan: <strong>${FREE_MONTHLY_CREDITS} free credits every month</strong>, no card. Enough to research something properly, review a document, or make your first image.`) +
      paragraph('Everyday chat is included and does not use credits at all.'),
    cta: { label: 'Open your workspace', href: `${appUrl}/app` },
  })
  const text = `Welcome, ${name}.

Your AI360 workspace is ready. Your conversations, projects and files now stay with you across every device.

You are on the free Explorer plan: ${FREE_MONTHLY_CREDITS} free credits every month, no card. Enough to research something properly, review a document, or make your first image. Everyday chat is included and does not use credits at all.

Open your workspace: ${appUrl}/app`
  return { subject, html, text }
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export function paymentReceiptEmail(data: {
  name?: string | null
  planName: string
  amountGhs: number
  credits: number
  orderId: string
}): RenderedEmail {
  const { appUrl } = emailSettings()
  const name = firstName(data.name)
  const plan = escapeHtml(data.planName.slice(0, 60))
  const subject = `Your AI360 ${data.planName.slice(0, 60)} payment is confirmed`
  const rows =
    paragraph(`Thanks, ${name}. Your payment is confirmed and your <strong>${plan}</strong> plan is active.`) +
    `<tr><td style="padding:12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2ded4;border-radius:12px;">
        <tr><td style="padding:12px 16px;color:#56595c;">Plan</td><td style="padding:12px 16px;text-align:right;font-weight:700;">${plan}</td></tr>
        <tr><td style="padding:12px 16px;color:#56595c;border-top:1px solid #efece4;">Amount</td><td style="padding:12px 16px;text-align:right;font-weight:700;border-top:1px solid #efece4;">${escapeHtml(ghs(data.amountGhs))}</td></tr>
        <tr><td style="padding:12px 16px;color:#56595c;border-top:1px solid #efece4;">Credits added</td><td style="padding:12px 16px;text-align:right;font-weight:700;border-top:1px solid #efece4;">${escapeHtml(String(Math.max(0, Math.floor(data.credits))))}</td></tr>
        <tr><td style="padding:12px 16px;color:#56595c;border-top:1px solid #efece4;">Access</td><td style="padding:12px 16px;text-align:right;font-weight:700;border-top:1px solid #efece4;">One month</td></tr>
        <tr><td style="padding:12px 16px;color:#56595c;border-top:1px solid #efece4;">Renewal</td><td style="padding:12px 16px;text-align:right;font-weight:700;border-top:1px solid #efece4;">Never automatic</td></tr>
        <tr><td style="padding:12px 16px;color:#56595c;border-top:1px solid #efece4;">Reference</td><td style="padding:12px 16px;text-align:right;font-family:monospace;font-size:13px;border-top:1px solid #efece4;">${escapeHtml(data.orderId.slice(0, 64))}</td></tr>
      </table>
    </td></tr>` +
    // The access period and the no-renewal promise are stated on the pricing
    // page and in the terms; a receipt that omits them is the one document the
    // customer keeps, missing the term that matters most to them.
    paragraph('This buys one month of access. Nothing renews automatically — you will only be charged again if you choose to pay again.') +
    paragraph('Keep this email as your receipt.')
  const html = layout({ heading: 'Payment confirmed', bodyHtml: rows, cta: { label: 'Go to your workspace', href: `${appUrl}/app` } })
  const text = `Payment confirmed

Thanks, ${name}. Your ${data.planName} plan is active.

Plan: ${data.planName}
Amount: ${ghs(data.amountGhs)}
Credits added: ${Math.max(0, Math.floor(data.credits))}
Access: One month
Renewal: Never automatic
Reference: ${data.orderId.slice(0, 64)}

This buys one month of access. Nothing renews automatically — you will only be charged again if you choose to pay again.

Keep this email as your receipt.
Workspace: ${appUrl}/app`
  return { subject, html, text }
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

export function lowCreditEmail(data: {
  name?: string | null
  available: number
  planName: string
}): RenderedEmail {
  const { appUrl } = emailSettings()
  const name = firstName(data.name)
  const available = Math.max(0, Math.floor(data.available))
  const subject = 'Your AI360 credits are running low'
  const html = layout({
    heading: 'Running low on credits',
    bodyHtml:
      paragraph(`Hi ${name}, you have <strong>${available} credit${available === 1 ? '' : 's'}</strong> left on your ${escapeHtml(data.planName.slice(0, 60))} plan.`) +
      paragraph(`Nothing stops working and there is no surprise bill. When you need more, a one-time top-up adds ${topUpRange()} credits and never expires, or a larger plan gives you more credits for your money each month.`) +
      paragraph('Everyday chat carries on as normal — it does not use credits.'),
    cta: { label: 'See pricing', href: `${appUrl}/pricing` },
  })
  const text = `Running low on credits

Hi ${name}, you have ${available} credit${available === 1 ? '' : 's'} left on your ${data.planName} plan.

Nothing stops working and there is no surprise bill. When you need more, a one-time top-up adds ${topUpRange()} credits and never expires, or a larger plan gives you more credits for your money each month. Everyday chat carries on as normal — it does not use credits.

Compare plans: ${appUrl}/pricing`
  return { subject, html, text }
}

export function allowanceRenewedEmail(data: {
  name?: string | null
  credits: number
  planName: string
}): RenderedEmail {
  const { appUrl } = emailSettings()
  const name = firstName(data.name)
  const credits = Math.max(0, Math.floor(data.credits))
  const subject = 'Your AI360 credits are ready'
  const html = layout({
    heading: 'Your credits are ready',
    bodyHtml:
      paragraph(`Hi ${name}, your ${escapeHtml(data.planName.slice(0, 60))} allowance now has <strong>${credits} credit${credits === 1 ? '' : 's'}</strong> ready for this month.`) +
      paragraph('Unused allowance from last month has expired; any credits you purchased stay with you.'),
    cta: { label: 'Start working', href: `${appUrl}/app` },
  })
  const text = `Your credits are ready

Hi ${name}, your ${data.planName} allowance now has ${credits} credit${credits === 1 ? '' : 's'} ready for this month.

Unused allowance from last month has expired; any credits you purchased stay with you.

Start working: ${appUrl}/app`
  return { subject, html, text }
}

// ---------------------------------------------------------------------------
// Quality loop
// ---------------------------------------------------------------------------

export function feedbackReceiptEmail(data: {
  name?: string | null
  reference: string
  urgent: boolean
}): RenderedEmail {
  const { appUrl } = emailSettings()
  const name = firstName(data.name)
  const subject = 'We received your AI360 feedback'
  const html = layout({
    heading: 'Thank you for your feedback',
    bodyHtml:
      paragraph(`Hi ${name}, we have received your report and logged it as reference <strong>${escapeHtml(data.reference.slice(0, 64))}</strong>.`) +
      paragraph(data.urgent
        ? 'Because of what you described, this has gone straight to our human review queue and a reviewer will look at it as a priority.'
        : 'A reviewer will look at it and use it to improve AI360. You do not need to do anything further.'),
    cta: { label: 'View your report', href: `${appUrl}/feedback/${encodeURIComponent(data.reference.slice(0, 64))}` },
  })
  const text = `Thank you for your feedback

Hi ${name}, we have received your report (reference ${data.reference.slice(0, 64)}).

${data.urgent
    ? 'Because of what you described, this has gone straight to our human review queue as a priority.'
    : 'A reviewer will look at it and use it to improve AI360.'}

View your report: ${appUrl}/feedback/${encodeURIComponent(data.reference.slice(0, 64))}`
  return { subject, html, text }
}

/** Sent to staff, not customers. Terse and scannable on a phone. */
export function qualityUrgentAlertEmail(data: {
  reference: string
  severity: string
  category: string
  summary: string
}): RenderedEmail {
  const { appUrl } = emailSettings()
  const severity = escapeHtml(data.severity.toUpperCase().slice(0, 8))
  const subject = `[${data.severity.toUpperCase().slice(0, 8)}] AI360 urgent review — ${data.category.slice(0, 40)}`
  const html = layout({
    heading: `Urgent review needed (${severity})`,
    bodyHtml:
      paragraph(`A ${severity} report needs a human reviewer.`) +
      paragraph(`<strong>Category:</strong> ${escapeHtml(data.category.slice(0, 60))}`) +
      paragraph(`<strong>Reference:</strong> ${escapeHtml(data.reference.slice(0, 64))}`) +
      paragraph(`<strong>Summary:</strong> ${escapeHtml(data.summary.slice(0, 400))}`),
    cta: { label: 'Open reviewer desk', href: `${appUrl}/quality` },
  })
  const text = `Urgent review needed (${severity})

Category: ${data.category.slice(0, 60)}
Reference: ${data.reference.slice(0, 64)}
Summary: ${data.summary.slice(0, 400)}

Reviewer desk: ${appUrl}/quality`
  return { subject, html, text }
}
