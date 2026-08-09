'use client'

import Link from 'next/link'
import { createPortal } from 'react-dom'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { QUALITY_CATEGORIES, QUALITY_CATEGORY_LABELS, type QualityCategory } from '@/lib/quality/contracts'
import styles from './QualityFeedback.module.css'

type FeedbackContext = {
  sourceSurface: 'quick' | 'research' | 'studio' | 'global' | 'other'
  conversationId?: string
  messageId?: string
  requestId?: string
  runId?: string
  responseText?: string
  conversationText?: string
}

type Props = {
  context: FeedbackContext
  variant?: 'response' | 'global'
}

type Receipt = { id: string; token: string; message: string }

export function QualityFeedback({ context, variant = 'response' }: Props) {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [serious, setSerious] = useState(false)
  const [category, setCategory] = useState<QualityCategory>('wrong_or_outdated')
  const [comment, setComment] = useState('')
  const [evidenceScope, setEvidenceScope] = useState<'none' | 'response' | 'conversation'>('none')
  const [immediateRisk, setImmediateRisk] = useState(false)
  const [contactAllowed, setContactAllowed] = useState(false)
  const [contactEmail, setContactEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [quickThanks, setQuickThanks] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  function beginReport(isSerious: boolean) {
    setSerious(isSerious)
    setCategory(isSerious ? 'unsafe_or_harmful' : 'wrong_or_outdated')
    setError('')
    setReceipt(null)
    setOpen(true)
  }

  async function sendFeedback(input: {
    reportKind: 'reaction' | 'quality' | 'safety' | 'product'
    sentiment: 'helpful' | 'needs_work' | 'serious'
    category: QualityCategory
    comment?: string
    evidenceScope?: 'none' | 'response' | 'conversation'
    immediateRisk?: boolean
    contactAllowed?: boolean
    contactEmail?: string
  }) {
    const scope = input.evidenceScope ?? 'none'
    const evidenceExcerpt = (scope === 'response'
      ? context.responseText
      : scope === 'conversation'
        ? context.conversationText
        : undefined)?.slice(0, 12_000)
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        ...context,
        evidenceScope: scope,
        evidenceExcerpt,
      }),
    })
    const data = await response.json().catch(() => ({})) as Partial<Receipt> & { error?: string }
    if (!response.ok || !data.id || !data.token || !data.message) {
      throw new Error(data.error || 'Your feedback could not be saved. Please try again.')
    }
    const nextReceipt = { id: data.id, token: data.token, message: data.message }
    localStorage.setItem(`ai360-quality-receipt:${data.id}`, data.token)
    return nextReceipt
  }

  async function markHelpful() {
    if (busy || quickThanks) return
    setBusy(true)
    setError('')
    try {
      await sendFeedback({ reportKind: 'reaction', sentiment: 'helpful', category: 'other' })
      setQuickThanks(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your feedback could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const nextReceipt = await sendFeedback({
        reportKind: serious ? 'safety' : category === 'feature_request' ? 'product' : 'quality',
        sentiment: serious ? 'serious' : 'needs_work',
        category,
        comment,
        evidenceScope,
        immediateRisk,
        contactAllowed,
        contactEmail,
      })
      setReceipt(nextReceipt)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your report could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {variant === 'response' ? (
        <div className={styles.responseActions} aria-label="Rate this answer">
          <span>Was this useful?</span>
          <button type="button" onClick={markHelpful} disabled={busy || quickThanks}>{quickThanks ? 'Thanks' : 'Helpful'}</button>
          <button type="button" onClick={() => beginReport(false)}>Needs work</button>
          <button type="button" className={styles.reportLink} onClick={() => beginReport(true)}>Report a problem</button>
          {error && !open ? <small role="alert">{error}</small> : null}
        </div>
      ) : typeof document !== 'undefined' ? createPortal((
        <button type="button" className={styles.globalButton} onClick={() => beginReport(true)}>
          <span>Report a problem</span><small>Tell us if something feels wrong</small>
        </button>
      ), document.body) : null}

      {open && typeof document !== 'undefined' ? createPortal((
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close report">Close</button>
            {receipt ? (
              <div className={styles.receipt}>
                <span>Report received</span>
                <h2 id={titleId}>Thank you for helping us improve.</h2>
                <p>{receipt.message}</p>
                <div><small>Your reference</small><strong>{receipt.id}</strong></div>
                <Link href={`/feedback/${encodeURIComponent(receipt.id)}`}>Check report status</Link>
              </div>
            ) : (
              <form onSubmit={submitReport}>
                <p className={styles.eyebrow}>{serious ? 'Report a serious problem' : 'Help us improve this answer'}</p>
                <h2 id={titleId}>{serious ? 'What went wrong?' : 'What should be better?'}</h2>
                <p className={styles.intro}>Choose the closest option. A short note helps us understand the problem.</p>

                <fieldset className={styles.categories}>
                  <legend>Choose one</legend>
                  {QUALITY_CATEGORIES.filter((item) => serious
                    ? ['unsafe_or_harmful', 'security_or_privacy', 'bias_or_disrespect', 'broken_action', 'other'].includes(item)
                    : item !== 'unsafe_or_harmful' && item !== 'security_or_privacy').map((item) => (
                    <label key={item} className={category === item ? styles.selected : ''}>
                      <input type="radio" name="category" value={item} checked={category === item} onChange={() => setCategory(item)} />
                      <span>{QUALITY_CATEGORY_LABELS[item]}</span>
                    </label>
                  ))}
                </fieldset>

                <label className={styles.textField}>
                  <span>Tell us what happened <small>Optional</small></span>
                  <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2_000} rows={4} placeholder="A few plain words are enough." />
                </label>

                {(context.responseText || context.conversationText) ? (
                  <fieldset className={styles.evidence}>
                    <legend>What may we include?</legend>
                    <p>Choose how much context our quality team can review.</p>
                    <label><input type="radio" name="evidence" checked={evidenceScope === 'none'} onChange={() => setEvidenceScope('none')} /><span><b>No message content</b><small>Send technical details only</small></span></label>
                    {context.responseText ? <label><input type="radio" name="evidence" checked={evidenceScope === 'response'} onChange={() => setEvidenceScope('response')} /><span><b>This answer</b><small>Include only the answer you reported</small></span></label> : null}
                    {context.conversationText ? <label><input type="radio" name="evidence" checked={evidenceScope === 'conversation'} onChange={() => setEvidenceScope('conversation')} /><span><b>Recent conversation</b><small>Include the latest messages for context</small></span></label> : null}
                  </fieldset>
                ) : null}

                {serious ? (
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={immediateRisk} onChange={(event) => setImmediateRisk(event.target.checked)} />
                    <span><b>Someone may be in immediate danger</b><small>This sends the report to the most urgent review queue.</small></span>
                  </label>
                ) : null}

                <label className={styles.checkRow}>
                  <input type="checkbox" checked={contactAllowed} onChange={(event) => setContactAllowed(event.target.checked)} />
                  <span><b>You may contact me about this report</b><small>We will not use your contact for marketing.</small></span>
                </label>
                {contactAllowed ? (
                  <label className={styles.textField}>
                    <span>Email</span>
                    <input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} required placeholder="you@example.com" />
                  </label>
                ) : null}

                {error ? <p className={styles.error} role="alert">{error}</p> : null}
                <div className={styles.submitRow}>
                  <p>Your report does not change the AI by itself. It is checked first.</p>
                  <button type="submit" disabled={busy}>{busy ? 'Sending...' : 'Send report'}</button>
                </div>
              </form>
            )}
          </section>
        </div>
      ), document.body) : null}
    </>
  )
}
