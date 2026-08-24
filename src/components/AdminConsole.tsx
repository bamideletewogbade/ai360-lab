'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AdminAiBriefing,
  AdminCohortReport,
  AdminDashboardPayload,
  AdminRange,
  AdminUser,
  AdminUserDetail,
} from '@/lib/admin/contracts'
import styles from './AdminConsole.module.css'

type AdminTab = 'overview' | 'users' | 'credits' | 'errors' | 'cohorts' | 'insights'

const NAV: Array<{ id: AdminTab; label: string; detail: string }> = [
  { id: 'overview', label: 'Overview', detail: 'Health and attention' },
  { id: 'users', label: 'Users', detail: 'Accounts and activity' },
  { id: 'credits', label: 'Credits', detail: 'Balances and ledger' },
  { id: 'errors', label: 'Errors', detail: 'Failures and reports' },
  { id: 'cohorts', label: 'Cohorts', detail: 'Activation and return' },
  { id: 'insights', label: 'AI Insights', detail: 'Evidence-backed briefing' },
]

function number(value: number) {
  return new Intl.NumberFormat('en-GH').format(value)
}

function usd(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
}

function date(value: string | null, includeTime = false) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat('en-GH', includeTime
    ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

function timeAgo(value: string | null) {
  if (!value) return 'Never active'
  const delta = Date.now() - new Date(value).getTime()
  const hours = Math.floor(delta / 3_600_000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d ago` : date(value)
}

function label(value: string) {
  return value.replaceAll('_', ' ').replaceAll('.', ' · ')
}

function csvCell(value: string | number | null) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function exportCohort(report: AdminCohortReport) {
  const headers = ['email', 'display_name', 'grant_date', 'active_days', 'last_active', 'credits_granted', 'credits_spent', 'balance', 'requests', 'successful_requests', 'failed_requests', 'projects', 'images', 'videos', 'files', 'provider_cost_usd']
  const rows = report.users.map((user) => [
    user.email, user.displayName, user.grantAt, user.activeDays, user.lastActiveAt,
    user.creditsGranted, user.creditsSpent, user.accountBalance, user.requests,
    user.successfulRequests, user.failedRequests, user.projects, user.images,
    user.videos, user.files, user.providerCostUsd.toFixed(6),
  ])
  const href = URL.createObjectURL(new Blob([[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = href
  link.download = `${report.cohort}-admin-report.csv`
  link.click()
  URL.revokeObjectURL(href)
}

function UserIdentity({ user, compact = false }: { user: Pick<AdminUser, 'displayName' | 'email'>; compact?: boolean }) {
  const initials = (user.displayName || user.email).split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
  return (
    <span className={styles.identity} data-compact={compact || undefined}>
      <span className={styles.avatar}>{initials}</span>
      <span><b>{user.displayName || user.email.split('@')[0]}</b><small>{user.email}</small></span>
    </span>
  )
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className={styles.empty}><span>0</span><b>{title}</b><p>{detail}</p></div>
}

function Metric({ label: title, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return <article className={styles.metric} data-tone={tone}><span>{title}</span><b>{value}</b><small>{detail}</small></article>
}

export function AdminConsole() {
  const [tab, setTab] = useState<AdminTab>('overview')
  const [range, setRange] = useState<AdminRange>('30d')
  const [dashboard, setDashboard] = useState<AdminDashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [userStatus, setUserStatus] = useState('all')
  const [balance, setBalance] = useState('all')
  const [plan, setPlan] = useState('all')
  const [cohort, setCohort] = useState('all')
  const [feature, setFeature] = useState('all')
  const [errorSource, setErrorSource] = useState('all')
  const [severity, setSeverity] = useState('all')
  const [ledgerType, setLedgerType] = useState('all')
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null)
  const [selectedUserLoading, setSelectedUserLoading] = useState(false)
  const [creditTarget, setCreditTarget] = useState<AdminUser | null>(null)
  const [creditAction, setCreditAction] = useState<'grant' | 'refund'>('grant')
  const [creditAmount, setCreditAmount] = useState('25')
  const [creditReason, setCreditReason] = useState('')
  const [creditWorking, setCreditWorking] = useState(false)
  const [cohortReport, setCohortReport] = useState<AdminCohortReport | null>(null)
  const [cohortLoading, setCohortLoading] = useState(false)
  const [aiBriefing, setAiBriefing] = useState<AdminAiBriefing | null>(null)
  const [aiWorking, setAiWorking] = useState(false)

  const fetchDashboard = useCallback(async (nextRange: AdminRange) => {
    const response = await fetch(`/api/admin/overview?range=${nextRange}`, { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'The admin console could not be loaded.')
    return data as AdminDashboardPayload
  }, [])

  const loadDashboard = useCallback(async (nextRange: AdminRange) => {
    try {
      setDashboard(await fetchDashboard(nextRange))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The admin console could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [fetchDashboard])

  useEffect(() => {
    let active = true
    fetchDashboard(range)
      .then((data) => { if (active) setDashboard(data) })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'The admin console could not be loaded.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [fetchDashboard, range])

  const allFeatures = useMemo(() => [...new Set(dashboard?.users.flatMap((user) => user.features) || [])].sort(), [dashboard])
  const allPlans = useMemo(() => [...new Set(dashboard?.users.map((user) => user.plan) || [])].sort(), [dashboard])
  const allCohorts = useMemo(() => dashboard?.cohorts.map((item) => item.cohort) || [], [dashboard])
  const needle = query.trim().toLowerCase()

  const visibleUsers = useMemo(() => (dashboard?.users || []).filter((user) => {
    const queryMatches = !needle || user.email.toLowerCase().includes(needle)
      || user.displayName?.toLowerCase().includes(needle) || user.id.toLowerCase().includes(needle)
    return queryMatches
      && (userStatus === 'all' || user.status === userStatus)
      && (balance === 'all' || user.balanceHealth === balance)
      && (plan === 'all' || user.plan === plan)
      && (cohort === 'all' || user.cohorts.includes(cohort))
      && (feature === 'all' || user.features.includes(feature))
  }), [balance, cohort, dashboard, feature, needle, plan, userStatus])

  const visibleErrors = useMemo(() => (dashboard?.errors || []).filter((item) => {
    const queryMatches = !needle || item.email?.toLowerCase().includes(needle)
      || item.displayName?.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle)
      || item.feature.toLowerCase().includes(needle) || item.route?.toLowerCase().includes(needle)
    return queryMatches && (errorSource === 'all' || item.source === errorSource)
      && (severity === 'all' || item.severity === severity)
      && (feature === 'all' || item.feature === feature)
  }), [dashboard, errorSource, feature, needle, severity])

  const visibleLedger = useMemo(() => (dashboard?.creditLedger || []).filter((item) => {
    const queryMatches = !needle || item.email?.toLowerCase().includes(needle)
      || item.displayName?.toLowerCase().includes(needle) || item.sourceId.toLowerCase().includes(needle)
    return queryMatches && (ledgerType === 'all' || item.entryType === ledgerType)
  }), [dashboard, ledgerType, needle])

  function resetFilters() {
    setQuery(''); setUserStatus('all'); setBalance('all'); setPlan('all'); setCohort('all')
    setFeature('all'); setErrorSource('all'); setSeverity('all'); setLedgerType('all')
  }

  async function inspectUser(user: AdminUser) {
    setSelectedUserLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The user record could not be loaded.')
      setSelectedUser(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The user record could not be loaded.')
    } finally {
      setSelectedUserLoading(false)
    }
  }

  async function applyCredits(event: React.FormEvent) {
    event.preventDefault()
    if (!creditTarget) return
    const credits = Number(creditAmount)
    if (!Number.isInteger(credits) || credits <= 0 || !creditReason.trim()) return
    setCreditWorking(true)
    setError('')
    try {
      const response = await fetch('/api/admin/credits', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: creditTarget.id, action: creditAction, credits,
          reason: creditReason.trim(), idempotencyKey: crypto.randomUUID(),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The credits could not be applied.')
      setCreditTarget(null)
      setCreditReason('')
      setSelectedUser(null)
      await loadDashboard(range)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The credits could not be applied.')
    } finally {
      setCreditWorking(false)
    }
  }

  async function loadCohort(next: string) {
    if (!next) return setCohortReport(null)
    setCohortLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/cohorts?cohort=${encodeURIComponent(next)}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The cohort could not be loaded.')
      setCohortReport(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The cohort could not be loaded.')
    } finally {
      setCohortLoading(false)
    }
  }

  async function runAiBriefing() {
    setAiWorking(true)
    setError('')
    try {
      const response = await fetch('/api/admin/insights', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ range }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'AI360 could not produce the briefing.')
      setAiBriefing(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI360 could not produce the briefing.')
    } finally {
      setAiWorking(false)
    }
  }

  const filtersActive = Boolean(query || userStatus !== 'all' || balance !== 'all' || plan !== 'all'
    || cohort !== 'all' || feature !== 'all' || errorSource !== 'all' || severity !== 'all' || ledgerType !== 'all')

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/app" className={styles.brand}><span>AI</span><b>AI360</b><small>CONTROL ROOM</small></Link>
        <nav aria-label="Admin sections">
          {NAV.map((item, index) => (
            <button key={item.id} type="button" data-active={tab === item.id || undefined} onClick={() => {
              setTab(item.id)
              if (item.id === 'cohorts' && !cohortReport && allCohorts[0]) void loadCohort(allCohorts[0])
            }}>
              <span>{String(index + 1).padStart(2, '0')}</span><span><b>{item.label}</b><small>{item.detail}</small></span>
            </button>
          ))}
        </nav>
        <div className={styles.privacy}><i /><span><b>Private operations</b><small>Metadata only. Customer content stays closed.</small></span></div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div><p>Admin / {NAV.find((item) => item.id === tab)?.label}</p><span>Last refreshed {dashboard ? timeAgo(dashboard.generatedAt) : '—'}</span></div>
          <div className={styles.topActions}>
            <label className={styles.range}><span>Window</span><select value={range} onChange={(event) => { setLoading(true); setError(''); setRange(event.target.value as AdminRange); setAiBriefing(null) }}>
              <option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="all">All time</option>
            </select></label>
            <button type="button" className={styles.refresh} onClick={() => { setLoading(true); setError(''); void loadDashboard(range) }} disabled={loading}>↻ <span>Refresh</span></button>
            {dashboard?.capabilities.manageCredits ? <button type="button" className={styles.primary} onClick={() => setCreditTarget(dashboard.users[0] || null)}>+ Give credits</button> : null}
          </div>
        </header>

        {error ? <div className={styles.notice} role="alert"><b>Control room notice</b><span>{error}</span><button onClick={() => setError('')}>×</button></div> : null}
        {loading && !dashboard ? <div className={styles.loading}><i /><b>Assembling the operating picture…</b><span>Credits, costs, outcomes, and customer signals</span></div> : null}

        {dashboard ? (
          <div className={styles.content}>
            {!dashboard.infrastructure.auditTrailReady ? (
              <section className={styles.systemNotice} role="status">
                <span>Read-only safety mode</span>
                <p>The dashboard is available, but privileged credit actions are paused until the admin audit migration is applied.</p>
              </section>
            ) : null}
            {tab === 'overview' ? (
              <>
                <section className={styles.pageTitle}><div><span className={styles.eyebrow}>Live operating picture</span><h1>What needs attention.</h1><p>Users, credit exposure, product reliability, and real provider cost in one place.</p></div><div className={styles.healthScore}><span>Request health</span><b>{dashboard.summary.requestSuccessRate}%</b><i><span style={{ width: `${dashboard.summary.requestSuccessRate}%` }} /></i></div></section>
                <section className={styles.metrics}>
                  <Metric label="Active users" value={number(dashboard.summary.activeUsers)} detail={`${dashboard.summary.atRiskUsers} at risk · ${dashboard.summary.users} total`} tone="green" />
                  <Metric label="Credits available" value={number(dashboard.summary.availableCredits)} detail={`${number(dashboard.summary.reservedCredits)} currently held`} />
                  <Metric label="Credits consumed" value={number(dashboard.summary.creditsSpent)} detail={`${number(dashboard.summary.requests)} requests in window`} />
                  <Metric label="Provider cost" value={usd(dashboard.summary.providerCostUsd)} detail="Measured, not estimated" />
                  <Metric label="Failures" value={number(dashboard.summary.failedRequests)} detail={`${dashboard.errors.length} grouped signals`} tone={dashboard.summary.failedRequests ? 'red' : 'green'} />
                </section>
                <section className={styles.overviewGrid}>
                  <article className={styles.attentionCard}>
                    <header><div><span className={styles.eyebrow}>Decision feed</span><h2>What AI360 sees</h2></div><button onClick={() => setTab('insights')}>Open insights →</button></header>
                    <div className={styles.insightList}>{dashboard.insights.slice(0, 4).map((insight) => <button key={insight.id} data-tone={insight.tone} onClick={() => setTab('insights')}><i /><span><b>{insight.title}</b><small>{insight.summary}</small></span><em>→</em></button>)}</div>
                  </article>
                  <article className={styles.featureHealth}>
                    <header><span className={styles.eyebrow}>Feature health</span><h2>Reliability by workflow</h2></header>
                    <div>{dashboard.features.slice(0, 7).map((item) => <button key={item.feature} onClick={() => { setFeature(item.feature); setTab('errors') }}><span><b>{label(item.feature)}</b><small>{item.requests} requests · {usd(item.providerCostUsd)}</small></span><span><b>{item.successRate}%</b><i><span style={{ width: `${item.successRate}%` }} /></i></span></button>)}</div>
                  </article>
                </section>
                <section className={styles.splitSection}>
                  <article className={styles.panel}>
                    <header><div><span className={styles.eyebrow}>Customer risk</span><h2>Users who may be blocked</h2></div><button onClick={() => setTab('users')}>All users</button></header>
                    <div className={styles.compactUsers}>{dashboard.users.filter((user) => user.failedRequests > 0 || user.balanceHealth !== 'healthy').slice(0, 6).map((user) => <button key={user.id} onClick={() => void inspectUser(user)}><UserIdentity user={user} compact /><span><b>{user.failedRequests ? `${user.failedRequests} failures` : `${user.availableCredits} credits left`}</b><small>{timeAgo(user.lastActiveAt)}</small></span></button>)}</div>
                  </article>
                  <article className={styles.panel}>
                    <header><div><span className={styles.eyebrow}>Credit exposure</span><h2>Balance distribution</h2></div><button onClick={() => setTab('credits')}>Open ledger</button></header>
                    <div className={styles.balanceBars}>{[
                      ['Healthy', dashboard.users.filter((user) => user.balanceHealth === 'healthy').length, 'healthy'],
                      ['Low', dashboard.users.filter((user) => user.balanceHealth === 'low').length, 'low'],
                      ['Empty', dashboard.users.filter((user) => user.balanceHealth === 'empty').length, 'empty'],
                    ].map(([name, count, tone]) => <div key={name}><span><b>{name}</b><small>{count} users</small></span><i><span data-tone={tone} style={{ width: `${dashboard.summary.users ? (Number(count) / dashboard.summary.users) * 100 : 0}%` }} /></i></div>)}</div>
                  </article>
                </section>
              </>
            ) : null}

            {tab === 'users' ? (
              <>
                <section className={styles.pageTitle}><div><span className={styles.eyebrow}>Customer operations</span><h1>Know every account.</h1><p>Find who is active, blocked, low on credits, or quietly drifting away.</p></div><div className={styles.resultCount}><b>{visibleUsers.length}</b><span>of {dashboard.users.length} users</span></div></section>
                <section className={styles.filterBar}>
                  <label className={styles.search}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, or user ID" /></label>
                  <label><span>Status</span><select value={userStatus} onChange={(event) => setUserStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="at_risk">At risk</option><option value="dormant">Dormant</option></select></label>
                  <label><span>Balance</span><select value={balance} onChange={(event) => setBalance(event.target.value)}><option value="all">Any balance</option><option value="healthy">Healthy</option><option value="low">Low</option><option value="empty">Empty</option></select></label>
                  <label><span>Plan</span><select value={plan} onChange={(event) => setPlan(event.target.value)}><option value="all">All plans</option>{allPlans.map((item) => <option value={item} key={item}>{label(item)}</option>)}</select></label>
                  <label><span>Cohort</span><select value={cohort} onChange={(event) => setCohort(event.target.value)}><option value="all">All cohorts</option>{allCohorts.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label><span>Feature</span><select value={feature} onChange={(event) => setFeature(event.target.value)}><option value="all">All features</option>{allFeatures.map((item) => <option value={item} key={item}>{label(item)}</option>)}</select></label>
                  {filtersActive ? <button className={styles.clear} onClick={resetFilters}>Clear filters</button> : null}
                </section>
                <section className={styles.tablePanel}>
                  <table><thead><tr><th>User</th><th>Status</th><th>Credit position</th><th>Activity</th><th>Reliability</th><th>Provider cost</th><th /></tr></thead>
                    <tbody>{visibleUsers.map((user) => <tr key={user.id} onClick={() => void inspectUser(user)}>
                      <td><UserIdentity user={user} /></td>
                      <td><span className={styles.badge} data-tone={user.status}>{label(user.status)}</span><small>{user.plan}</small></td>
                      <td><b>{number(user.availableCredits)} available</b><small>{user.reservedCredits} held · {user.creditsSpent} used</small></td>
                      <td><b>{user.activeDays} active day{user.activeDays === 1 ? '' : 's'}</b><small>{timeAgo(user.lastActiveAt)}</small></td>
                      <td><b>{user.successfulRequests} delivered</b><small className={user.failedRequests ? styles.danger : ''}>{user.failedRequests} failed · {user.qualityReports} reports</small></td>
                      <td><b>{usd(user.providerCostUsd)}</b><small>{user.projects} projects</small></td>
                      <td><button className={styles.rowAction}>View →</button></td>
                    </tr>)}</tbody></table>
                  {!visibleUsers.length ? <Empty title="No users match these filters" detail="Clear one or more filters to widen the view." /> : null}
                </section>
              </>
            ) : null}

            {tab === 'credits' ? (
              <>
                <section className={styles.pageTitle}><div><span className={styles.eyebrow}>Credit operations</span><h1>Every credit accounted for.</h1><p>Monitor balances and holds, issue deliberate adjustments, and preserve a complete audit trail.</p></div>{dashboard.capabilities.manageCredits ? <button className={styles.heroAction} onClick={() => setCreditTarget(dashboard.users[0] || null)}>+ New credit action</button> : null}</section>
                <section className={styles.metrics}>
                  <Metric label="Available" value={number(dashboard.summary.availableCredits)} detail="Across all current accounts" />
                  <Metric label="Reserved" value={number(dashboard.summary.reservedCredits)} detail={`${dashboard.summary.heldReservations} held reservations`} />
                  <Metric label="Consumed" value={number(dashboard.summary.creditsSpent)} detail={`During ${range === 'all' ? 'all time' : range}`} />
                  <Metric label="Low balance" value={number(dashboard.summary.lowBalanceUsers)} detail="10 credits or fewer" tone={dashboard.summary.lowBalanceUsers ? 'red' : 'green'} />
                  <Metric label="Stale holds" value={number(dashboard.summary.staleReservations)} detail="Past automatic expiry" tone={dashboard.summary.staleReservations ? 'red' : 'green'} />
                </section>
                <section className={styles.filterBar}>
                  <label className={styles.search}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user or source" /></label>
                  <label><span>Entry type</span><select value={ledgerType} onChange={(event) => setLedgerType(event.target.value)}><option value="all">All movements</option>{[...new Set(dashboard.creditLedger.map((item) => item.entryType))].map((item) => <option key={item}>{item}</option>)}</select></label>
                  {filtersActive ? <button className={styles.clear} onClick={resetFilters}>Clear filters</button> : null}
                </section>
                <section className={styles.creditLayout}>
                  <article className={styles.tablePanel}><header className={styles.panelHeader}><div><span className={styles.eyebrow}>Financial source of truth</span><h2>Credit ledger</h2></div><span>{visibleLedger.length} entries</span></header>
                    <table><thead><tr><th>User</th><th>Movement</th><th>Balance after</th><th>Source</th><th>When</th></tr></thead><tbody>{visibleLedger.map((entry) => <tr key={entry.id}><td><b>{entry.displayName || entry.email || 'System account'}</b><small>{entry.email}</small></td><td><b className={entry.creditsDelta >= 0 ? styles.positive : styles.danger}>{entry.creditsDelta >= 0 ? '+' : ''}{entry.creditsDelta}</b><small>{label(entry.entryType)}</small></td><td><b>{entry.balanceAfter}</b></td><td><b>{label(entry.sourceType)}</b><small>{entry.sourceId}</small></td><td><b>{date(entry.createdAt, true)}</b></td></tr>)}</tbody></table>
                    {!visibleLedger.length ? <Empty title="No ledger entries match" detail="Try a different date window or clear the filters." /> : null}</article>
                  <aside className={styles.auditPanel}><header><span className={styles.eyebrow}>Operator history</span><h2>Admin audit</h2><p>Every privileged balance action, with its reason and before/after state.</p></header>{dashboard.auditEvents.length ? <div>{dashboard.auditEvents.slice(0, 20).map((event) => <article key={event.id}><span data-action={event.action}>{event.action === 'credit_refund' ? '↩' : '+'}</span><div><b>{event.action === 'credit_refund' ? 'Refunded' : 'Granted'} {event.creditsDelta} credits</b><small>{event.targetEmail || 'Unknown account'} · {timeAgo(event.createdAt)}</small><p>{event.reason}</p><em>{event.balanceBefore} → {event.balanceAfter}</em></div></article>)}</div> : <Empty title="No admin actions yet" detail="Grants and refunds will appear here automatically." />}</aside>
                </section>
              </>
            ) : null}

            {tab === 'errors' ? (
              <>
                <section className={styles.pageTitle}><div><span className={styles.eyebrow}>Reliability center</span><h1>Follow the failure to the user.</h1><p>Technical outcomes and customer reports are correlated without opening private conversations.</p></div><div className={styles.resultCount}><b>{visibleErrors.reduce((sum, item) => sum + item.occurrences, 0)}</b><span>occurrences shown</span></div></section>
                <section className={styles.filterBar}>
                  <label className={styles.search}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user, route, or error code" /></label>
                  <label><span>Source</span><select value={errorSource} onChange={(event) => setErrorSource(event.target.value)}><option value="all">All sources</option><option value="technical">Technical</option><option value="customer">Customer reports</option></select></label>
                  <label><span>Severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">All severities</option>{['s0', 's1', 's2', 's3', 's4'].map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label><span>Feature</span><select value={feature} onChange={(event) => setFeature(event.target.value)}><option value="all">All features</option>{[...new Set(dashboard.errors.map((item) => item.feature))].sort().map((item) => <option value={item} key={item}>{label(item)}</option>)}</select></label>
                  {filtersActive ? <button className={styles.clear} onClick={resetFilters}>Clear filters</button> : null}
                </section>
                <section className={styles.errorLayout}>
                  <div className={styles.errorFeed}>{visibleErrors.map((item) => <article key={item.id} data-severity={item.severity}>
                    <div className={styles.errorRail}><span>{item.severity.toUpperCase()}</span><i /></div>
                    <div className={styles.errorBody}><header><div><span className={styles.sourceBadge}>{item.source === 'customer' ? 'Customer report' : 'Technical failure'}</span><span>{label(item.feature)}</span><span>{item.occurrences} occurrence{item.occurrences === 1 ? '' : 's'}</span></div><time>{timeAgo(item.lastSeenAt)}</time></header><h3>{label(item.code)}</h3><p>{item.message}</p><div className={styles.errorMeta}><span><b>User</b>{item.displayName || item.email || 'System / anonymous'}</span><span><b>Route</b>{item.route || item.feature}</span><span><b>Provider</b>{item.provider || 'Not recorded'}</span><span><b>Model</b>{item.model || 'Not recorded'}</span></div><footer>{item.requestId ? <code>{item.requestId}</code> : <span>No request ID</span>}{item.userId ? <button onClick={() => { const user = dashboard.users.find((candidate) => candidate.id === item.userId); if (user) void inspectUser(user) }}>Open user →</button> : null}</footer></div>
                  </article>)}</div>
                  <aside className={styles.errorSummary}><span className={styles.eyebrow}>Pattern summary</span><h2>Failure concentration</h2>{dashboard.features.filter((item) => item.failedRequests).sort((a, b) => b.failedRequests - a.failedRequests).slice(0, 8).map((item) => <button key={item.feature} onClick={() => setFeature(item.feature)}><span><b>{label(item.feature)}</b><small>{item.affectedUsers} users</small></span><span><b>{item.failedRequests}</b><small>failures</small></span></button>)}</aside>
                </section>
                {!visibleErrors.length ? <Empty title="No errors match this view" detail="That is either very good news or a sign to widen the filters." /> : null}
              </>
            ) : null}

            {tab === 'cohorts' ? (
              <>
                <section className={styles.pageTitle}><div><span className={styles.eyebrow}>Cohort intelligence</span><h1>From access to real value.</h1><p>Activation and repeat use now live beside the rest of customer operations.</p></div><div className={styles.cohortControls}><select value={cohortReport?.cohort || allCohorts[0] || ''} onChange={(event) => void loadCohort(event.target.value)}>{!allCohorts.length ? <option value="">No cohorts yet</option> : allCohorts.map((item) => <option key={item}>{item}</option>)}</select><button disabled={!cohortReport} onClick={() => cohortReport && exportCohort(cohortReport)}>Export CSV</button></div></section>
                {cohortLoading ? <div className={styles.inlineLoading}>Calculating cohort activity…</div> : null}
                {!cohortLoading && !cohortReport ? <Empty title="No sponsored cohorts yet" detail="Cohort grants will appear here automatically." /> : null}
                {cohortReport ? <>
                  <section className={styles.metrics}>
                    <Metric label="Users" value={number(cohortReport.summary.users)} detail={`${cohortReport.summary.activated} activated`} />
                    <Metric label="Activation" value={`${cohortReport.summary.activationRate}%`} detail="Received useful AI output" tone="green" />
                    <Metric label="Returned" value={`${cohortReport.summary.returnRate}%`} detail={`${cohortReport.summary.returning} used AI360 on 2+ days`} />
                    <Metric label="Credits used" value={number(cohortReport.summary.creditsSpent)} detail={`${number(cohortReport.summary.creditsGranted)} granted`} />
                    <Metric label="Provider cost" value={usd(cohortReport.summary.providerCostUsd)} detail="Measured, not estimated" />
                  </section>
                  <section className={styles.cohortGrid}><article className={styles.funnel}><header><span className={styles.eyebrow}>Journey</span><h2>Access to repeat use</h2></header>{[
                    ['Granted access', cohortReport.summary.users, 100], ['Activated', cohortReport.summary.activated, cohortReport.summary.activationRate],
                    ['Active last 7 days', cohortReport.summary.activeLast7Days, cohortReport.summary.users ? Math.round((cohortReport.summary.activeLast7Days / cohortReport.summary.users) * 100) : 0],
                    ['Returned another day', cohortReport.summary.returning, cohortReport.summary.returnRate],
                  ].map(([name, count, percent]) => <div key={String(name)}><span><b>{name}</b><small>{count} users</small></span><i><span style={{ width: `${percent}%` }} /></i><em>{percent}%</em></div>)}</article><article className={styles.featureHealth}><header><span className={styles.eyebrow}>Feature signal</span><h2>What created value</h2></header><div>{cohortReport.features.slice(0, 7).map((item) => <div className={styles.cohortFeature} key={item.feature}><span><b>{label(item.feature)}</b><small>{item.successfulRequests} delivered · {item.failedRequests} failed</small></span><span><b>{item.requests}</b><small>{usd(item.providerCostUsd)}</small></span></div>)}</div></article></section>
                  <section className={styles.tablePanel}><header className={styles.panelHeader}><div><span className={styles.eyebrow}>Cohort users</span><h2>Who found value</h2></div><span>{cohortReport.users.length} accounts</span></header><table><thead><tr><th>User</th><th>Activation</th><th>Work created</th><th>Credits</th><th>Reliability</th><th>Cost</th></tr></thead><tbody>{cohortReport.users.map((user) => <tr key={user.userId}><td><b>{user.displayName || user.email.split('@')[0]}</b><small>{user.email}</small></td><td><b>{user.activeDays} active days</b><small>{timeAgo(user.lastActiveAt)}</small></td><td><b>{user.projects} projects · {user.conversations} chats</b><small>{user.images} images · {user.videos} videos · {user.files} files</small></td><td><b>{user.creditsSpent} of {user.creditsGranted}</b><small>{user.accountBalance} current balance</small></td><td><b>{user.deliveredRequests} delivered</b><small className={user.failedRequests ? styles.danger : ''}>{user.failedRequests} failed</small></td><td><b>{usd(user.providerCostUsd)}</b></td></tr>)}</tbody></table><p className={styles.footnote}>{cohortReport.measurementNote}</p></section>
                </> : null}
              </>
            ) : null}

            {tab === 'insights' ? (
              <>
                <section className={styles.pageTitle}><div><span className={styles.eyebrow}>Decision intelligence</span><h1>Evidence before instinct.</h1><p>AI receives aggregate operational metadata only. It can recommend an action, but it cannot change credits or customer accounts.</p></div><button className={styles.heroAction} disabled={aiWorking || !dashboard.capabilities.runAiInsights} onClick={() => void runAiBriefing()}>{aiWorking ? 'Analysing…' : aiBriefing ? 'Refresh AI briefing' : 'Generate AI briefing'}</button></section>
                {aiBriefing ? <section className={styles.aiBriefing}><header><span><i />AI briefing · {range}</span><small>{date(aiBriefing.generatedAt, true)} · {aiBriefing.model}</small></header><h2>{aiBriefing.headline}</h2><p>{aiBriefing.summary}</p><div>{aiBriefing.priorities.map((priority, index) => <article key={`${priority.title}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{priority.title}</h3><p><b>Evidence</b>{priority.evidence}</p><p><b>Next move</b>{priority.action}</p></div></article>)}</div></section> : <section className={styles.aiEmpty}><div><span>AI</span><i /></div><h2>Ask AI360 to read the operating picture.</h2><p>It will analyze success rates, repeated failures, affected users, credit exposure, cohort signals, and measured cost. No prompts or generated content are included.</p>{!dashboard.capabilities.runAiInsights ? <small>Configure OpenRouter to enable live AI briefings. The evidence engine below remains available.</small> : null}</section>}
                <section className={styles.evidenceInsights}><header><div><span className={styles.eyebrow}>Always-on evidence engine</span><h2>Signals you can verify now</h2></div><span>{dashboard.insights.length} findings</span></header><div>{dashboard.insights.map((insight, index) => <article key={insight.id} data-tone={insight.tone}><span>{String(index + 1).padStart(2, '0')}</span><div><header><b>{insight.title}</b><em>{insight.tone}</em></header><p>{insight.summary}</p><dl><div><dt>Evidence</dt><dd>{insight.evidence}</dd></div><div><dt>Suggested action</dt><dd>{insight.suggestedAction}</dd></div></dl></div></article>)}</div></section>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      {selectedUserLoading ? <div className={styles.drawerBackdrop}><aside className={styles.drawer}><div className={styles.drawerLoading}>Opening user timeline…</div></aside></div> : null}
      {selectedUser && !selectedUserLoading ? <div className={styles.drawerBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedUser(null) }}><aside className={styles.drawer} aria-label="User details"><header className={styles.drawerTop}><span>User operations</span><button onClick={() => setSelectedUser(null)}>×</button></header><div className={styles.userHero}><UserIdentity user={selectedUser.user} /><span className={styles.badge} data-tone={selectedUser.user.status}>{label(selectedUser.user.status)}</span><p>{selectedUser.user.id}</p><div>{dashboard?.capabilities.manageCredits ? <><button onClick={() => { setCreditAction('grant'); setCreditTarget(selectedUser.user) }}>+ Grant credits</button><button onClick={() => { setCreditAction('refund'); setCreditTarget(selectedUser.user) }}>↩ Refund</button></> : null}<a href={`mailto:${selectedUser.user.email}`}>Contact</a></div></div><section className={styles.drawerMetrics}><div><span>Available</span><b>{selectedUser.user.availableCredits}</b><small>{selectedUser.user.reservedCredits} held</small></div><div><span>Reliability</span><b>{selectedUser.user.successfulRequests}</b><small>{selectedUser.user.failedRequests} failed</small></div><div><span>Cost</span><b>{usd(selectedUser.user.providerCostUsd)}</b><small>{range}</small></div></section><section className={styles.timeline}><header><span className={styles.eyebrow}>Account timeline</span><h2>Recent operational history</h2></header>{[
        ...selectedUser.errors.map((item) => ({ id: item.id, at: item.lastSeenAt, tone: 'error', title: `${item.occurrences}× ${label(item.code)}`, detail: `${label(item.feature)} · ${item.route || item.source}` })),
        ...selectedUser.creditLedger.map((item) => ({ id: `credit-${item.id}`, at: item.createdAt, tone: 'credit', title: `${item.creditsDelta >= 0 ? '+' : ''}${item.creditsDelta} credits`, detail: `${label(item.entryType)} · balance ${item.balanceAfter}` })),
        ...selectedUser.auditEvents.map((item) => ({ id: `audit-${item.id}`, at: item.createdAt, tone: 'admin', title: label(item.action), detail: item.reason })),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 30).map((event) => <article key={event.id} data-tone={event.tone}><i /><div><b>{event.title}</b><p>{event.detail}</p><small>{date(event.at, true)}</small></div></article>)}</section></aside></div> : null}

      {creditTarget ? <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !creditWorking) setCreditTarget(null) }}><form className={styles.creditModal} onSubmit={applyCredits}><header><div><span className={styles.eyebrow}>Privileged action</span><h2>{creditAction === 'refund' ? 'Refund credits' : 'Grant credits'}</h2></div><button type="button" onClick={() => setCreditTarget(null)}>×</button></header><label><span>User</span><select value={creditTarget.id} onChange={(event) => { const user = dashboard?.users.find((item) => item.id === event.target.value); if (user) setCreditTarget(user) }}>{dashboard?.users.map((user) => <option value={user.id} key={user.id}>{user.displayName || user.email} · {user.availableCredits} credits</option>)}</select></label><div className={styles.actionSwitch}><button type="button" data-active={creditAction === 'grant' || undefined} onClick={() => setCreditAction('grant')}>Grant</button><button type="button" data-active={creditAction === 'refund' || undefined} onClick={() => setCreditAction('refund')}>Refund failed work</button></div><label><span>Credits</span><input type="number" min="1" max="10000" step="1" value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} /></label><label><span>Reason <em>Required for audit</em></span><textarea rows={3} maxLength={240} value={creditReason} onChange={(event) => setCreditReason(event.target.value)} placeholder={creditAction === 'refund' ? 'Example: Refund for three failed video renders' : 'Example: Workshop participation credit'} /></label><div className={styles.balancePreview}><span><small>Current balance</small><b>{creditTarget.availableCredits}</b></span><i>→</i><span><small>Balance after</small><b>{creditTarget.availableCredits + Math.max(0, Number(creditAmount) || 0)}</b></span></div><p className={styles.auditNote}>This creates an immutable ledger entry and records you as the operator. It cannot silently overwrite an existing balance.</p><footer><button type="button" onClick={() => setCreditTarget(null)}>Cancel</button><button type="submit" disabled={creditWorking || !creditReason.trim() || !Number(creditAmount)}>{creditWorking ? 'Applying…' : `Confirm ${creditAction}`}</button></footer></form></div> : null}
    </main>
  )
}
