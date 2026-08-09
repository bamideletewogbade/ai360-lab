'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { QUALITY_CATEGORY_LABELS, type QualityCategory, type QualityStatus } from '@/lib/quality/contracts'
import styles from './QualityConsole.module.css'

type QualityCase = {
  id: string
  report_kind: string
  sentiment: string | null
  category: QualityCategory
  severity: 's0' | 's1' | 's2' | 's3' | 's4'
  status: QualityStatus
  source_surface: string
  comment: string | null
  evidence_scope: string
  immediate_risk: boolean
  contact_allowed: boolean
  contact_email: string | null
  ai_summary: string | null
  ai_confidence: string | number | null
  ai_recommended_action: string | null
  created_at: string
  action_count: string | number
  open_action_count: string | number
}

type Queue = {
  reports: QualityCase[]
  metrics: { total: string | number; urgent: string | number; awaiting_human: string | number; eval_candidates: string | number; verified: string | number }
}

const STATUS_LABELS: Record<QualityStatus, string> = {
  received: 'Received',
  evaluating: 'AI check',
  human_review: 'Human review',
  fix_planned: 'Fix planned',
  verified: 'Verified',
  closed: 'Closed',
}

export function QualityConsole() {
  const [queue, setQueue] = useState<Queue | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'urgent' | 'human' | 'evaluating'>('all')
  const [workingId, setWorkingId] = useState('')
  const [noteById, setNoteById] = useState<Record<string, string>>({})

  const loadQueue = useCallback(async () => {
    setError('')
    const response = await fetch('/api/quality/cases', { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'The quality queue could not be loaded.')
    setQueue(data)
  }, [])

  useEffect(() => {
    let active = true
    fetch('/api/quality/cases', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'The quality queue could not be loaded.')
        if (active) setQueue(data)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'The quality queue could not be loaded.')
      })
    return () => { active = false }
  }, [])

  const visible = useMemo(() => (queue?.reports ?? []).filter((report) => {
    if (filter === 'urgent') return report.severity === 's0' || report.severity === 's1'
    if (filter === 'human') return report.status === 'human_review'
    if (filter === 'evaluating') return report.status === 'evaluating'
    return true
  }), [filter, queue])

  async function updateCase(report: QualityCase, status: 'human_review' | 'fix_planned' | 'verified' | 'closed') {
    const note = noteById[report.id]?.trim()
    if (!note) {
      setError('Add a short customer-safe note before changing a case.')
      return
    }
    setWorkingId(report.id)
    setError('')
    try {
      const response = await fetch(`/api/quality/cases/${encodeURIComponent(report.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The review could not be saved.')
      setNoteById((current) => ({ ...current, [report.id]: '' }))
      await loadQueue()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The review could not be saved.')
    } finally {
      setWorkingId('')
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/app" className={styles.brand}><b>AI360</b><span>QUALITY DESK</span></Link>
        <div><span className={styles.liveDot} />Live quality loop</div>
      </header>

      <section className={styles.hero}>
        <div>
          <p>Customer quality</p>
          <h1>See the signal.<br />Make it better.</h1>
          <p className={styles.heroCopy}>Reports move through one visible path. Rules protect urgent cases, AI gathers evidence, and people make the important decisions.</p>
        </div>
        <div className={styles.flow} aria-label="Quality report workflow">
          {[
            ['01', 'Report', 'Customer explains what went wrong'],
            ['02', 'Check', 'Rules and AI gather the evidence'],
            ['03', 'Human', 'A person decides sensitive actions'],
            ['04', 'Test', 'Validated failures become benchmarks'],
            ['05', 'Verify', 'The fix must pass before release'],
          ].map(([number, title, detail], index) => (
            <div key={title}><span>{number}</span><p><b>{title}</b><small>{detail}</small></p>{index < 4 ? <i aria-hidden="true" /> : null}</div>
          ))}
        </div>
      </section>

      {queue ? (
        <section className={styles.metrics} aria-label="Last 30 days">
          <div><span>Reports</span><b>{Number(queue.metrics.total)}</b><small>Last 30 days</small></div>
          <div><span>Urgent</span><b>{Number(queue.metrics.urgent)}</b><small>S0 and S1</small></div>
          <div><span>Need a person</span><b>{Number(queue.metrics.awaiting_human)}</b><small>Human review queue</small></div>
          <div><span>Test candidates</span><b>{Number(queue.metrics.eval_candidates)}</b><small>Waiting for approval</small></div>
          <div><span>Verified</span><b>{Number(queue.metrics.verified)}</b><small>Improvement checked</small></div>
        </section>
      ) : null}

      <section className={styles.queueSection}>
        <div className={styles.queueHead}>
          <div><p>Review queue</p><h2>What needs attention now.</h2></div>
          <div className={styles.filters} role="group" aria-label="Filter quality cases">
            {(['all', 'urgent', 'human', 'evaluating'] as const).map((item) => (
              <button key={item} className={filter === item ? styles.active : ''} onClick={() => setFilter(item)}>{item === 'all' ? 'All' : item === 'human' ? 'Needs a person' : item === 'evaluating' ? 'AI check' : 'Urgent'}</button>
            ))}
          </div>
        </div>

        {error ? <div className={styles.error} role="alert"><b>Quality desk notice</b><p>{error}</p></div> : null}
        {!queue && !error ? <p className={styles.loading}>Opening the quality queue...</p> : null}
        {queue && !visible.length ? <p className={styles.empty}>Nothing is waiting in this view.</p> : null}

        <div className={styles.caseList}>
          {visible.map((report) => (
            <article className={styles.case} key={report.id} data-severity={report.severity}>
              <div className={styles.caseMeta}>
                <span className={styles.severity}>{report.severity.toUpperCase()}</span>
                <span>{STATUS_LABELS[report.status]}</span>
                <span>{report.source_surface}</span>
                <time dateTime={report.created_at}>{new Date(report.created_at).toLocaleString()}</time>
              </div>
              <div className={styles.caseBody}>
                <div>
                  <p className={styles.caseLabel}>{QUALITY_CATEGORY_LABELS[report.category]}</p>
                  <h3>{report.ai_summary || report.comment || 'Waiting for a clear summary.'}</h3>
                  {report.comment && report.ai_summary ? <p className={styles.customerWords}><b>Customer:</b> {report.comment}</p> : null}
                  <div className={styles.signals}>
                    <span>Evidence: {report.evidence_scope === 'none' ? 'technical details only' : report.evidence_scope}</span>
                    <span>{Number(report.open_action_count)} open action{Number(report.open_action_count) === 1 ? '' : 's'}</span>
                    {report.ai_confidence !== null ? <span>AI confidence: {Math.round(Number(report.ai_confidence) * 100)}%</span> : <span>AI check waiting</span>}
                  </div>
                  {report.ai_recommended_action ? <div className={styles.recommendation}><span>AI recommendation</span><p>{report.ai_recommended_action}</p></div> : null}
                  {report.contact_allowed && report.contact_email ? <a className={styles.contact} href={`mailto:${report.contact_email}?subject=AI360%20quality%20report%20${report.id}`}>Customer asked for follow-up</a> : null}
                </div>
                <div className={styles.reviewBox}>
                  <label><span>Customer-safe update</span><textarea rows={3} value={noteById[report.id] || ''} onChange={(event) => setNoteById((current) => ({ ...current, [report.id]: event.target.value }))} placeholder="Say what is happening in plain language." /></label>
                  <div>
                    <button disabled={workingId === report.id} onClick={() => updateCase(report, 'human_review')}>Keep in review</button>
                    <button disabled={workingId === report.id} onClick={() => updateCase(report, 'fix_planned')}>Plan a fix</button>
                    <button disabled={workingId === report.id} onClick={() => updateCase(report, 'verified')}>Mark verified</button>
                    <button disabled={workingId === report.id} onClick={() => updateCase(report, 'closed')}>Close</button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
