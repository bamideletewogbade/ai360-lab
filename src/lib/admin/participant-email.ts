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

type ParticipantCopy = {
  subject: string
  heading: string
  body: string
  cta: string
  /** A second paragraph, for the messages that need to set expectations. */
  detail?: string
  /** Numbered guidance. Rendered as a list, so it survives being skimmed. */
  steps?: readonly string[]
  /** The closing line under the button, when it needs to say more than "reply". */
  closing?: string
}

/**
 * An operator's edits to one send.
 *
 * Every field is optional and falls back to the written copy, so an operator
 * who changes one sentence does not have to retype the message around it. This
 * carries words only — never the layout, the link, the brand or the opt-out —
 * because those are the parts that make the message safe to send in bulk, and
 * an editor that can break them is a liability rather than a feature.
 *
 * Edits are per-send and are not persisted. The written copy stays the default
 * for the next batch, so one operator's wording for one cohort cannot silently
 * become the product's voice.
 */
export type ParticipantCopyOverride = Partial<{
  subject: string
  heading: string
  body: string
  cta: string
  detail: string
  steps: string[]
  closing: string
}>

/** Limits, so an edited message stays a message rather than a document. */
export const COPY_LIMITS = {
  subject: 160,
  heading: 160,
  body: 1_200,
  detail: 1_200,
  closing: 600,
  cta: 60,
  step: 300,
  steps: 8,
} as const

/**
 * Wording an operator is about to send that probably should not go out.
 *
 * Not a block — an operator may have a reason, and refusing to send is worse
 * than telling them what they wrote. It exists because the invitation copy was
 * deliberately stripped of credit amounts, plan prices and promises of more
 * credits on request, and an editable field is exactly how those come back.
 */
const LEAK_RULES: Array<{ pattern: RegExp; warning: string }> = [
  { pattern: /\b\d+\s*credits?\b/i, warning: 'Mentions a credit amount. The balance is already visible in the product.' },
  { pattern: /GH₵|GHS\s*\d|\$\s*\d/i, warning: 'Mentions a price. Invitations deliberately carry no pricing.' },
  { pattern: /\b(everyday|explorer|team)\s+plan\b/i, warning: 'Names an internal plan tier.' },
  { pattern: /\b(top[-\s]?up|we will add more|more credits)\b/i, warning: 'Promises more credits, which commits the programme to something it may not want to keep.' },
  { pattern: /\b(?:free(?!\s+credits?\b)|no cost|at no charge)\b/i, warning: 'Says the whole pilot is free. Mentioning the supplied testing credits is clearer and does not promise future pricing.' },
]

export function reviewParticipantCopy(copy: ParticipantCopyOverride): string[] {
  const haystack = [copy.subject, copy.heading, copy.body, copy.detail, copy.closing, copy.cta, ...(copy.steps ?? [])]
    .filter(Boolean)
    .join('\n')
  if (!haystack.trim()) return []
  return LEAK_RULES.filter((rule) => rule.pattern.test(haystack)).map((rule) => rule.warning)
}

/** The written copy for a template, so an editor can start from it. */
export function participantCopyFor(template: AdminParticipantEmailTemplate) {
  const copy = COPY[template]
  return {
    subject: copy.subject,
    heading: copy.heading,
    body: copy.body,
    cta: copy.cta,
    detail: copy.detail ?? '',
    steps: [...(copy.steps ?? [])],
    closing: copy.closing ?? '',
  }
}

/**
 * Merges an operator's edits over the written copy.
 *
 * A field that is present but blank is treated as a deliberate removal for the
 * optional parts, and ignored for the parts a message cannot be sent without —
 * a blank subject or button label is a mistake in an editor, not an intention.
 */
function applyCopyOverride(base: ParticipantCopy, override?: ParticipantCopyOverride | null): ParticipantCopy {
  if (!override) return base
  const required = (value: string | undefined, fallback: string, limit: number) => {
    const trimmed = (value ?? '').trim()
    return trimmed ? trimmed.slice(0, limit) : fallback
  }
  const optional = (value: string | undefined, fallback: string | undefined, limit: number) => (
    value === undefined ? fallback : (value.trim().slice(0, limit) || undefined)
  )
  return {
    subject: required(override.subject, base.subject, COPY_LIMITS.subject),
    heading: required(override.heading, base.heading, COPY_LIMITS.heading),
    body: required(override.body, base.body, COPY_LIMITS.body),
    cta: required(override.cta, base.cta, COPY_LIMITS.cta),
    detail: optional(override.detail, base.detail, COPY_LIMITS.detail),
    closing: optional(override.closing, base.closing, COPY_LIMITS.closing),
    steps: override.steps === undefined
      ? base.steps
      : override.steps
        .map((step) => step.trim().slice(0, COPY_LIMITS.step))
        .filter(Boolean)
        .slice(0, COPY_LIMITS.steps),
  }
}

const COPY: Record<AdminParticipantEmailTemplate, ParticipantCopy> = {
  /**
   * Warm, personal, and deliberately free of operating detail.
   *
   * Everything a participant needs is here; nothing they do not. Earlier drafts
   * named the credit allowance and the plan price it maps to, and promised more
   * credits on request — all of which are internal decisions, none of which
   * belong in a thank-you note. Stating them commits the programme to promises
   * it may not want to keep, and invites questions ("what happens when they run
   * out?") that the message cannot answer without more disclosure still.
   *
   * The balance is visible in the product. The message's job is to get somebody
   * from an inbox to a finished piece of work, and to make them want to say
   * what they thought.
   */
  pilot_invite: {
    subject: 'Your AI360 pilot access is ready',
    heading: 'Come and try AI360',
    /**
     * "Signed up for", not "came to" or "spent a Saturday with us".
     *
     * Attendance at the introduction sessions was never recorded against a
     * sign-in sheet, so every one of these people is a registrant and some may
     * never have made it on the day. Thanking somebody for a Saturday they did
     * not spend is the worst kind of personalisation error: it proves nobody
     * checked. This wording is warm and true for all of them.
     */
    body: 'You registered for one of our AI360 introduction sessions. We now have a working version, and I would like you to try it.',
    detail: 'We have added free credits to your account so you can test it properly. Use AI360 for one real task, then reply and tell me what worked, what was confusing, or what broke.',
    steps: [
      'Open your private link below. It will confirm your email and take you through a short account setup.',
      'Try one real task, such as research, a proposal, content, or a report.',
      'Reply to this email with your honest feedback. Short and direct is perfect.',
    ],
    closing: 'Thank you for helping us improve AI360 before launch.',
    cta: 'Start testing AI360',
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

/**
 * Words that are not the person's name, however they typed the field.
 *
 * A registration form asking for "Name" gets titles, and taking the first word
 * blindly greeted one real participant as "Hi The," — the fastest possible way
 * to tell somebody a message was generated rather than written.
 */
const NON_NAME_WORDS = new Set([
  'the', 'mr', 'mrs', 'ms', 'miss', 'mister', 'madam', 'madame',
  'dr', 'doctor', 'prof', 'professor', 'rev', 'reverend', 'pastor',
  'hon', 'honourable', 'honorable', 'sir', 'eng', 'engr', 'alhaji', 'hajia',
])

/**
 * The name to greet somebody by, from a field they filled in themselves.
 *
 * Three things are corrected, all of them observed in the real pilot list:
 * a leading title and a name typed in capitals ("Hi NURUDEEN," reads as
 * shouting at somebody you are thanking). If no name was captured, the neutral
 * "Hi there" is safer than pretending an email handle is somebody's name.
 *
 * Names are deliberately *not* fully re-cased. "McCarthy" and "Naa Aku" are
 * correct as written, and a tidy-up that mangles somebody's own spelling is a
 * worse failure than the one being fixed — so only an all-capitals word, which
 * carries no intended casing, is touched.
 */
function firstName(name: string | null) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  const meaningful = words.find((word) => !NON_NAME_WORDS.has(word.replace(/[.,]/g, '').toLowerCase()))

  let chosen = meaningful || words[0] || 'there'
  chosen = chosen.replace(/[.,]+$/, '').slice(0, 50)

  // Shouting only. A word already carrying mixed case is left exactly alone.
  if (chosen.length > 1 && chosen === chosen.toUpperCase() && /[A-Za-z]/.test(chosen)) {
    chosen = chosen[0] + chosen.slice(1).toLowerCase()
  }
  // An email handle arrives lowercase; a greeting should not.
  if (chosen !== 'there' && chosen[0] && chosen[0] === chosen[0].toLowerCase()) {
    chosen = chosen[0].toUpperCase() + chosen.slice(1)
  }

  return escapeHtml(chosen || 'there')
}

/** The same name, unescaped, for the plain-text half of the message. */
function plainFirstName(name: string | null) {
  return firstName(name)
    .replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"').replaceAll('&#39;', "'")
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
  /** An operator's per-send edits. Words only; see `ParticipantCopyOverride`. */
  copyOverride?: ParticipantCopyOverride | null
}): RenderedEmail {
  const copy = applyCopyOverride(COPY[input.template], input.copyOverride)
  const { appUrl, replyTo } = emailSettings()
  const target = input.actionUrl?.trim() || appUrl
  const name = firstName(input.displayName)
  const note = input.operatorNote?.trim().slice(0, 500) || ''
  const safeNote = escapeHtml(note)
  const noteHtml = safeNote ? `<div style="margin:20px 0;padding:14px 16px;border-left:3px solid #d8643b;background:#f6f1e8;color:#30322f;line-height:1.55;">${safeNote.replaceAll('\n', '<br>')}</div>` : ''
  const optOut = input.unsubscribeUrl?.trim() || ''
  const optOutHtml = optOut ? `<p style="margin:10px 0 0;color:#777b75;font-size:12px;line-height:1.5;">Would you rather not hear about the pilot? <a href="${escapeHtml(optOut)}" style="color:#777b75;">Unsubscribe</a>.</p>` : ''

  // Copy is written by us, never by a recipient, but it still goes through the
  // same escape as the operator's note — one template edit containing an
  // apostrophe-heavy sentence should never be able to break the markup.
  const detailHtml = copy.detail
    ? `<p style="margin:14px 0 0;color:#515550;line-height:1.65;">${escapeHtml(copy.detail)}</p>`
    : ''

  // A numbered list rather than a paragraph: this is the part somebody scans
  // rather than reads, and prose hides the fact that there are five steps.
  const stepsHtml = copy.steps?.length
    ? `<ol style="margin:20px 0 0;padding-left:20px;color:#30322f;line-height:1.6;">${copy.steps
        .map((step) => `<li style="margin:0 0 10px;">${escapeHtml(step)}</li>`)
        .join('')}</ol>`
    : ''

  const closingHtml = copy.closing
    ? `<p style="margin:22px 0 0;color:#515550;line-height:1.6;font-size:14px;">${escapeHtml(copy.closing)}</p>`
    : ''

  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f1efe8;padding:28px 12px;font-family:Arial,sans-serif;color:#171918;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:auto;background:#fff;border:1px solid #dedbd1;border-radius:16px;"><tr><td style="padding:28px 32px 8px;font-size:18px;font-weight:800;">AI360</td></tr><tr><td style="padding:12px 32px 32px;"><p style="margin:0 0 14px;">Hi ${name},</p><h1 style="margin:0 0 14px;font-size:25px;line-height:1.2;">${escapeHtml(copy.heading)}</h1><p style="margin:0;color:#515550;line-height:1.65;">${escapeHtml(copy.body)}</p>${detailHtml}${noteHtml}${stepsHtml}<a href="${escapeHtml(target)}" style="display:inline-block;margin-top:24px;padding:13px 20px;border-radius:9px;background:#171918;color:#fff;text-decoration:none;font-weight:700;">${escapeHtml(copy.cta)}</a>${closingHtml}<p style="margin:22px 0 0;color:#777b75;font-size:12px;line-height:1.5;">Questions, or something not working? Reply straight to this email${replyTo ? ` and our team at ${escapeHtml(replyTo)} will help` : ''}.</p>${optOutHtml}</td></tr></table></body></html>`

  // The plain-text half is not a courtesy. Some clients render it instead of
  // the HTML, and a message with no readable text alternative scores worse with
  // spam filters — which for a first bulk send to sixty-three inboxes matters.
  const textSteps = copy.steps?.length
    ? `\n\n${copy.steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')}`
    : ''
  const text = [
    // The same corrected name as the HTML half. This previously took the raw
    // first word, so the two halves of one message could greet somebody
    // differently — "Hi Fatima," in HTML and "Hi The," in plain text.
    `Hi ${plainFirstName(input.displayName)},`,
    copy.heading,
    copy.body,
    copy.detail || '',
    note,
  ].filter(Boolean).join('\n\n')
    + textSteps
    + `\n\n${copy.cta}: ${target}`
    + (copy.closing ? `\n\n${copy.closing}` : '')
    + '\n\nQuestions, or something not working? Reply straight to this email.'
    + (optOut ? `\n\nUnsubscribe: ${optOut}` : '')

  return { subject: copy.subject, html, text }
}
