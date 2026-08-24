'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  PilotCohortListItem,
  PilotCohortReport,
  PilotTesterMetrics,
} from '@/lib/pilot/report-contract'
import styles from './CohortDashboard.module.css'

function number(value: number) {
  return new Intl.NumberFormat('en-GH').format(value)
}

function usd(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
}

function date(value: string | null) {
  if (!value) return 'Not active yet'
  return new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

function csvCell(value: string | number | null) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function testerStatus(tester: PilotTesterMetrics) {
  if (tester.deliveredRequests === 0) return { label: 'Not activated', tone: 'waiting' }
  if (tester.activeDays >= 2) return { label: 'Returning', tone: 'returning' }
  return { label: 'Activated', tone: 'active' }
}

function downloadReport(report: PilotCohortReport) {
  const headers = [
    'email', 'display_name', 'status', 'grant_date', 'active_days', 'last_active',
    'credits_granted', 'credits_spent', 'account_balance', 'requests', 'successful_requests',
    'delivered_requests', 'failed_requests', 'conversations', 'user_messages', 'projects', 'agent_runs',
    'images', 'videos', 'files', 'provider_cost_usd',
  ]
  const rows = report.testers.map((tester) => [
    tester.email,
    tester.displayName,
    testerStatus(tester).label,
    tester.grantAt,
    tester.activeDays,
    tester.lastActiveAt,
    tester.creditsGranted,
    tester.creditsSpent,
    tester.accountBalance,
    tester.requests,
    tester.successfulRequests,
    tester.deliveredRequests,
    tester.failedRequests,
    tester.conversations,
    tester.userMessages,
    tester.projects,
    tester.agentRuns,
    tester.images,
    tester.videos,
    tester.files,
    tester.providerCostUsd.toFixed(6),
  ])
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${report.cohort}-usage.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function CohortDashboard() {
  const [cohorts, setCohorts] = useState<PilotCohortListItem[]>([])
  const [selected, setSelected] = useState('')
  const [report, setReport] = useState<PilotCohortReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'waiting' | 'active' | 'returning'>('all')

  const loadReport = useCallback(async (cohort: string) => {
    if (!cohort) {
      setReport(null)
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/pilot/cohorts?cohort=${encodeURIComponent(cohort)}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The cohort report could not be loaded.')
      setReport(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The cohort report could not be loaded.')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    fetch('/api/pilot/cohorts', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Pilot cohorts could not be loaded.')
        if (!active) return
        const items = data.cohorts as PilotCohortListItem[]
        setCohorts(items)
        const first = items[0]?.cohort || ''
        setSelected(first)
        if (first) void loadReport(first)
        else setLoading(false)
      })
      .catch((cause) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : 'Pilot cohorts could not be loaded.')
        setLoading(false)
      })
    return () => { active = false }
  }, [loadReport])

  const visibleTesters = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (report?.testers || []).filter((tester) => {
      const testerTone = testerStatus(tester).tone
      const statusMatches = status === 'all' || status === testerTone
      const queryMatches = !needle
        || tester.email.toLowerCase().includes(needle)
        || tester.displayName?.toLowerCase().includes(needle)
      return statusMatches && queryMatches
    })
  }, [query, report, status])

  const creditUseRate = report?.summary.creditsGranted
    ? Math.round((report.summary.creditsSpent / report.summary.creditsGranted) * 100)
    : 0

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/app" className={styles.brand}><b>AI360</b><span>PILOT DESK</span></Link>
        <span className={styles.private}><i />Private operator view</span>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Cohort health</p>
          <h1>See who found value.</h1>
          <p>Follow activation, return use, credits and real provider cost without opening anyone’s conversations.</p>
        </div>
        <div className={styles.controls}>
          <label>
            <span>Cohort</span>
            <select value={selected} onChange={(event) => {
              const cohort = event.target.value
              setSelected(cohort)
              setQuery('')
              setStatus('all')
              void loadReport(cohort)
            }}>
              {!cohorts.length ? <option value="">No cohorts yet</option> : null}
              {cohorts.map((cohort) => <option key={cohort.cohort} value={cohort.cohort}>{cohort.cohort} · {cohort.testers} testers</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void loadReport(selected)} disabled={!selected || loading}>Refresh</button>
          <button type="button" className={styles.export} onClick={() => report && downloadReport(report)} disabled={!report}>Export CSV</button>
        </div>
      </section>

      {error ? <div className={styles.notice} role="alert"><b>Pilot desk notice</b><span>{error}</span></div> : null}
      {loading ? <div className={styles.loading}>Calculating cohort activity…</div> : null}
      {!loading && !error && !report ? <div className={styles.empty}><b>No sponsored cohort grants yet.</b><span>Grant the first tester batch and it will appear here automatically.</span></div> : null}

      {report ? (
        <>
          <section className={styles.metrics} aria-label="Cohort summary">
            <article><span>Testers</span><b>{number(report.summary.testers)}</b><small>{report.summary.activated} activated</small></article>
            <article><span>Activation</span><b>{report.summary.activationRate}%</b><small>Received useful AI output</small></article>
            <article><span>Returned</span><b>{report.summary.returnRate}%</b><small>{report.summary.returning} used AI360 on 2+ days</small></article>
            <article><span>Credits used</span><b>{number(report.summary.creditsSpent)}</b><small>{creditUseRate}% of cohort grants</small></article>
            <article><span>Provider cost</span><b>{usd(report.summary.providerCostUsd)}</b><small>Measured, not estimated</small></article>
          </section>

          <section className={styles.signalGrid}>
            <article className={styles.healthCard}>
              <header><div><p>Funnel</p><h2>From invite to repeat use</h2></div><span>Last refreshed {date(report.generatedAt)}</span></header>
              {[
                ['Granted access', report.summary.testers, 100],
                ['Activated', report.summary.activated, report.summary.activationRate],
                ['Active in last 7 days', report.summary.activeLast7Days, report.summary.testers ? Math.round((report.summary.activeLast7Days / report.summary.testers) * 100) : 0],
                ['Returned on another day', report.summary.returning, report.summary.returnRate],
              ].map(([label, count, percent]) => (
                <div className={styles.funnelRow} key={String(label)}>
                  <span>{label}</span><b>{count}</b><em>{percent}%</em>
                  <i><span style={{ width: `${percent}%` }} /></i>
                </div>
              ))}
            </article>

            <article className={styles.featureCard}>
              <header><p>Feature signal</p><h2>What the cohort is using</h2></header>
              {!report.features.length ? <span className={styles.noSignal}>No provider-backed work yet.</span> : report.features.slice(0, 6).map((feature) => (
                <div key={feature.feature}>
                  <span><b>{feature.feature.replaceAll('_', ' ')}</b><small>{feature.successfulRequests} delivered · {feature.failedRequests} failed</small></span>
                  <span><b>{number(feature.requests)}</b><small>{usd(feature.providerCostUsd)}</small></span>
                </div>
              ))}
            </article>
          </section>

          <section className={styles.testersSection}>
            <div className={styles.testersHead}>
              <div><p>Tester detail</p><h2>Who needs a nudge?</h2></div>
              <div className={styles.filters}>
                <label><span className="sr-only">Search testers</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search email or name" /></label>
                <div role="group" aria-label="Filter tester status">
                  {(['all', 'waiting', 'active', 'returning'] as const).map((item) => <button type="button" key={item} className={status === item ? styles.activeFilter : ''} onClick={() => setStatus(item)}>{item === 'all' ? 'All' : item === 'waiting' ? 'Not activated' : item === 'active' ? 'Activated' : 'Returning'}</button>)}
                </div>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Tester</th><th>Status</th><th>Activity</th><th>Work created</th><th>Credits</th><th>AI requests</th><th>Cost</th></tr></thead>
                <tbody>
                  {visibleTesters.map((tester) => {
                    const testerState = testerStatus(tester)
                    return (
                      <tr key={tester.email}>
                        <td data-label="Tester"><b>{tester.displayName || tester.email.split('@')[0]}</b><small>{tester.email}</small></td>
                        <td data-label="Status"><span className={styles.status} data-tone={testerState.tone}>{testerState.label}</span></td>
                        <td data-label="Activity"><b>{tester.activeDays} day{tester.activeDays === 1 ? '' : 's'}</b><small>{date(tester.lastActiveAt)}</small></td>
                        <td data-label="Work created"><b>{tester.conversations} chats · {tester.projects} projects</b><small>{tester.images} images · {tester.videos} videos · {tester.files} files</small></td>
                        <td data-label="Credits"><b>{tester.creditsSpent} of {tester.creditsGranted} used</b><small>{tester.accountBalance} current balance</small></td>
                        <td data-label="AI requests"><b>{tester.deliveredRequests} delivered</b><small>{tester.failedRequests} failed</small></td>
                        <td data-label="Cost"><b>{usd(tester.providerCostUsd)}</b><small>measured</small></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!visibleTesters.length ? <p className={styles.noResults}>No testers match this view.</p> : null}
            </div>
            <p className={styles.privacyNote}>{report.measurementNote} Current balance may include credits from outside this cohort.</p>
          </section>
        </>
      ) : null}
    </main>
  )
}
