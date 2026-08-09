'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import styles from './FeedbackStatus.module.css'

type Receipt = {
  id: string
  status: 'received' | 'evaluating' | 'human_review' | 'fix_planned' | 'verified' | 'closed'
  severity: string
  category: string
  summary: string | null
  created_at: string
  updated_at: string
}

const STATUS_COPY: Record<Receipt['status'], { step: number; label: string; detail: string }> = {
  received: { step: 1, label: 'Received', detail: 'Your report is safely in the quality queue.' },
  evaluating: { step: 2, label: 'Being checked', detail: 'The Quality Steward is gathering the useful technical details.' },
  human_review: { step: 3, label: 'With a person', detail: 'A quality reviewer needs to make the next decision.' },
  fix_planned: { step: 4, label: 'Improvement planned', detail: 'The team has accepted an improvement or fix.' },
  verified: { step: 5, label: 'Verified', detail: 'The change has been checked against the reported problem.' },
  closed: { step: 5, label: 'Closed', detail: 'The report has reached the end of its review.' },
}

export function FeedbackStatus({ reportId }: { reportId: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [message, setMessage] = useState('Loading your report...')

  useEffect(() => {
    const token = localStorage.getItem(`ai360-quality-receipt:${reportId}`)
    const query = token ? `?token=${encodeURIComponent(token)}` : ''
    fetch(`/api/feedback/${encodeURIComponent(reportId)}${query}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'This report could not be loaded.')
        setReceipt(data)
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'This report could not be loaded.'))
  }, [reportId])

  if (!receipt) {
    return <section className={styles.state}><p>{message}</p><Link href="/app">Return to the Lab</Link></section>
  }

  const current = STATUS_COPY[receipt.status]
  return (
    <section className={styles.card}>
      <p className={styles.eyebrow}>Quality report</p>
      <h1>{current.label}</h1>
      <p className={styles.intro}>{current.detail}</p>
      <div className={styles.reference}><span>Reference</span><strong>{receipt.id}</strong></div>
      <div className={styles.flow} aria-label={`Report progress: ${current.label}`}>
        {['Received', 'AI check', 'Human review', 'Improvement', 'Verified'].map((label, index) => (
          <div className={index + 1 <= current.step ? styles.complete : ''} key={label}>
            <span>{String(index + 1).padStart(2, '0')}</span><b>{label}</b>
          </div>
        ))}
      </div>
      {receipt.summary ? <div className={styles.update}><span>Latest update</span><p>{receipt.summary}</p></div> : null}
      <p className={styles.note}>Reports are checked before they become tests or product changes. One report never trains or changes the AI by itself.</p>
      <Link className={styles.return} href="/app">Return to the Lab</Link>
    </section>
  )
}

