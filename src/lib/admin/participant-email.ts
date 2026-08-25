import 'server-only'

import { emailSettings } from '@/lib/email/config'
import { escapeHtml, type RenderedEmail } from '@/lib/email/templates'

export const ADMIN_PARTICIPANT_EMAIL_TEMPLATES = [
  { key: 'pilot_invite', label: 'Pilot invitation', purpose: 'Invite selected people and point them to AI360.' },
  { key: 'onboarding_reminder', label: 'Onboarding reminder', purpose: 'Help invited participants take their first useful action.' },
  { key: 'error_help', label: 'Error follow-up', purpose: 'Reach out after repeated failures and offer support.' },
  { key: 'low_credits', label: 'Low-credit check-in', purpose: 'Warn active participants before their work is interrupted.' },
  { key: 'credits_granted', label: 'Credits granted', purpose: 'Confirm that additional pilot credits are ready.' },
  { key: 'feedback_request', label: 'Feedback request', purpose: 'Ask participants to share a short pilot report.' },
  { key: 'completion', label: 'Pilot completion', purpose: 'Thank participants who have completed the program.' },
] as const

export type AdminParticipantEmailTemplate = (typeof ADMIN_PARTICIPANT_EMAIL_TEMPLATES)[number]['key']

const COPY: Record<AdminParticipantEmailTemplate, { subject: string; heading: string; body: string; cta: string }> = {
  pilot_invite: {
    subject: 'You’re invited to the AI360 pilot',
    heading: 'Your AI360 pilot access is ready',
    body: 'We’d love you to explore AI360, create something useful, and tell us what works or gets in your way.',
    cta: 'Start the pilot',
  },
  onboarding_reminder: {
    subject: 'A quick nudge to start with AI360',
    heading: 'Ready when you are',
    body: 'Your pilot access is active. Start with one real task so we can learn what helps you most.',
    cta: 'Open AI360',
  },
  error_help: {
    subject: 'Can we help with your recent AI360 experience?',
    heading: 'We noticed something got in the way',
    body: 'A recent task did not finish as expected. Reply to this email if you would like help—we’re using pilot feedback to improve the experience quickly.',
    cta: 'Try again',
  },
  low_credits: {
    subject: 'A note about your AI360 pilot credits',
    heading: 'Your pilot balance is running low',
    body: 'We don’t want your evaluation to stop mid-task. Reply if you still have work you want to test and our team will review your pilot allocation.',
    cta: 'Open AI360',
  },
  credits_granted: {
    subject: 'More AI360 pilot credits are ready',
    heading: 'Your credits have been added',
    body: 'Your pilot balance has been updated, so you can continue testing the workflows that matter to you.',
    cta: 'Continue creating',
  },
  feedback_request: {
    subject: 'How is the AI360 pilot going?',
    heading: 'Your experience will shape what we build next',
    body: 'Tell us what felt valuable, what was confusing, and what you would need before using AI360 regularly.',
    cta: 'Share feedback',
  },
  completion: {
    subject: 'Thank you for testing AI360',
    heading: 'Thank you for being part of the pilot',
    body: 'Your usage and feedback helped us see what is working and where AI360 needs to improve. We appreciate the time you gave us.',
    cta: 'Visit AI360',
  },
}

function firstName(name: string | null, email: string) {
  return escapeHtml((name || email.split('@')[0] || 'there').trim().split(/\s+/)[0].slice(0, 50))
}

export function renderAdminParticipantEmail(input: {
  template: AdminParticipantEmailTemplate
  displayName: string | null
  email: string
  operatorNote?: string | null
  /**
   * Overrides the call-to-action destination. An invitation points at a
   * single-use sign-up link rather than the app's front door, because the
   * recipient has no account to sign in to yet.
   */
  actionUrl?: string | null
  /** Omitted only when no signing secret is configured to mint one. */
  unsubscribeUrl?: string | null
}): RenderedEmail {
  const copy = COPY[input.template]
  const { appUrl, replyTo } = emailSettings()
  const target = input.actionUrl?.trim() || appUrl
  const name = firstName(input.displayName, input.email)
  const note = input.operatorNote?.trim().slice(0, 500) || ''
  const safeNote = escapeHtml(note)
  const noteHtml = safeNote ? `<div style="margin:20px 0;padding:14px 16px;border-left:3px solid #d8643b;background:#f6f1e8;color:#30322f;line-height:1.55;">${safeNote.replaceAll('\n', '<br>')}</div>` : ''
  const optOut = input.unsubscribeUrl?.trim() || ''
  const optOutHtml = optOut ? `<p style="margin:10px 0 0;color:#777b75;font-size:12px;line-height:1.5;">Would you rather not hear about the pilot? <a href="${escapeHtml(optOut)}" style="color:#777b75;">Unsubscribe</a>.</p>` : ''
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f1efe8;padding:28px 12px;font-family:Arial,sans-serif;color:#171918;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:auto;background:#fff;border:1px solid #dedbd1;border-radius:16px;"><tr><td style="padding:28px 32px 8px;font-size:18px;font-weight:800;">AI360</td></tr><tr><td style="padding:12px 32px 32px;"><p style="margin:0 0 14px;">Hi ${name},</p><h1 style="margin:0 0 14px;font-size:25px;line-height:1.2;">${copy.heading}</h1><p style="margin:0;color:#515550;line-height:1.65;">${copy.body}</p>${noteHtml}<a href="${escapeHtml(target)}" style="display:inline-block;margin-top:22px;padding:12px 18px;border-radius:9px;background:#171918;color:#fff;text-decoration:none;font-weight:700;">${copy.cta}</a><p style="margin:26px 0 0;color:#777b75;font-size:12px;line-height:1.5;">Questions? Reply to this email${replyTo ? ` and our team at ${escapeHtml(replyTo)} will help` : ''}.</p>${optOutHtml}</td></tr></table></body></html>`
  const text = `Hi ${input.displayName?.trim().split(/\s+/)[0] || input.email.split('@')[0]},\n\n${copy.heading}\n\n${copy.body}${note ? `\n\n${note}` : ''}\n\n${copy.cta}: ${target}\n\nQuestions? Reply to this email.${optOut ? `\n\nUnsubscribe: ${optOut}` : ''}`
  return { subject: copy.subject, html, text }
}
