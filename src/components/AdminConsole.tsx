'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrandMark } from '@/components/BrandMark'
import type {
  AdminAiBriefing,
  AdminCohortReport,
  AdminDashboardPayload,
  AdminImportPreview,
  AdminInvitation,
  AdminRange,
  AdminUser,
  AdminUserDetail,
} from '@/lib/admin/contracts'
import styles from './AdminConsole.module.css'

type AdminTab = 'overview' | 'users' | 'credits' | 'finance' | 'errors' | 'cohorts' | 'insights'
type BulkKind = 'program' | 'credits' | 'email'

/** Why an imported row was set aside, in words an operator can act on. */
const IMPORT_REASONS: Record<string, string> = {
  already_a_user: 'Already has an account — add them from “Add pilot users”',
  already_invited: 'Already invited',
  invalid_email: 'Not a usable email address',
  duplicate_in_file: 'Repeated in this list',
  missing_email: 'Row has no email address',
}

/**
 * Invitation states in the operator's words rather than the column's.
 *
 * Rows previously printed the raw database enum — `pending`, `revoked` — while
 * the filter above them called the same states something else entirely, so
 * filtering to "Withdrawn" produced a list where every row said `revoked`. One
 * vocabulary now, used by both. `invite_status` is written without runtime
 * validation, so an unknown value falls back to the generic formatter rather
 * than rendering blank.
 */
const INVITE_STATUS_LABELS: Record<string, string> = {
  pending: 'Not sent',
  // Not "no reply". Nobody replies to an invitation: the link signs the person
  // in and the claim grants their credits. The only thing `sent` says is that
  // the email left and they have not opened their account yet.
  sent: 'Invited, not signed up',
  accepted: 'Signed up',
  bounced: 'Email bounced',
  revoked: 'Cancelled',
}

const PARTICIPATION_STATUSES = ['invited', 'enrolled', 'activated', 'returning', 'completed', 'withdrawn'] as const
const FEEDBACK_STATUSES = ['not_requested', 'requested', 'received', 'reviewed'] as const
const EMAIL_TEMPLATES = [
  ['pilot_invite', 'Pilot invitation'], ['onboarding_reminder', 'Onboarding reminder'],
  ['error_help', 'Error follow-up'], ['low_credits', 'Low-credit check-in'],
  ['credits_granted', 'Credits granted'], ['feedback_request', 'Feedback request'],
  ['completion', 'Pilot completion'],
] as const

const NAV: Array<{ id: AdminTab; label: string; detail: string }> = [
  { id: 'overview', label: 'Overview', detail: 'Health and attention' },
  { id: 'users', label: 'Users', detail: 'Accounts and activity' },
  { id: 'credits', label: 'Credits', detail: 'Balances and ledger' },
  { id: 'finance', label: 'Finance', detail: 'Cost, price and margin' },
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

function ghs(value: number, digits = 2) {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency', currency: 'GHS', minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(value)
}

function percent(value: number | null) {
  return value === null ? '—' : `${value.toFixed(1)}%`
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

function csvCell(value: string | number | null | undefined) {
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

function exportUsers(users: AdminUser[], fileName = 'ai360-participants.csv') {
  const headers = ['email', 'display_name', 'user_id', 'program', 'cohort', 'participation_status', 'feedback_status', 'email_status', 'product_status', 'balance', 'credits_used', 'active_days', 'last_active', 'successful_requests', 'failed_requests', 'provider_cost_usd']
  const rows = users.map((user) => [
    user.email, user.displayName, user.id, user.participation?.programKey, user.participation?.cohortKey,
    user.participation?.participationStatus, user.participation?.feedbackStatus, user.participation?.emailStatus,
    user.status, user.availableCredits, user.creditsSpent, user.activeDays, user.lastActiveAt,
    user.successfulRequests, user.failedRequests, user.providerCostUsd.toFixed(6),
  ])
  const href = URL.createObjectURL(new Blob([[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
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
  // Program, cohort, participation, feedback and engagement remain as state
  // because the "who needs attention" buttons set them. They no longer have
  // dropdowns of their own: at pilot size the list fits on a screen, so
  // filtering was never the operator's problem and eight selects over sixty-odd
  // rows cost more attention than they returned.
  const [programFilter, setProgramFilter] = useState('all')
  const [feedbackStatus, setFeedbackStatus] = useState('all')
  const [engagement, setEngagement] = useState('all')
  /** The one thing the participation dropdown was genuinely for. */
  const [includeWithdrawn, setIncludeWithdrawn] = useState(false)
  /**
   * Which population is on screen. Invitations and people are disjoint sets —
   * no account yet versus an account — with different actions, and stacking
   * both tables put a filter bar between them that appeared to belong to the
   * one above it while actually driving the one below. They are also sequential
   * phases of a pilot rather than simultaneous concerns, so the operator sees
   * one at a time.
   */
  const [peopleView, setPeopleView] = useState<'people' | 'invitations'>('people')
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkKind, setBulkKind] = useState<BulkKind | null>(null)
  const [bulkWorking, setBulkWorking] = useState(false)
  const [exportWorking, setExportWorking] = useState(false)
  const [bulkReason, setBulkReason] = useState('')
  const [bulkCohort, setBulkCohort] = useState('pilot-main')
  const [bulkParticipation, setBulkParticipation] = useState('enrolled')
  const [bulkFeedback, setBulkFeedback] = useState('keep')
  const [bulkCredits, setBulkCredits] = useState('25')
  const [bulkTemplate, setBulkTemplate] = useState('onboarding_reminder')
  const [bulkNote, setBulkNote] = useState('')
  const [emailPreview, setEmailPreview] = useState<null | {
    eligible: Array<{ userId: string; email: string; displayName: string | null }>
    excluded: Array<{ userId: string; email: string | null; reason: string }>
    sample: { subject: string; text: string } | null
  }>(null)
  const [pilotAddOpen, setPilotAddOpen] = useState(false)
  const [pilotAddSearch, setPilotAddSearch] = useState('')
  const [pilotAddIds, setPilotAddIds] = useState<Set<string>>(new Set())
  const [pilotAddCohort, setPilotAddCohort] = useState('pilot-main')
  const [pilotAddStatus, setPilotAddStatus] = useState<'invited' | 'enrolled'>('enrolled')
  const [pilotAddCredits, setPilotAddCredits] = useState('25')
  const [pilotAddReason, setPilotAddReason] = useState('')
  const [pilotAddWorking, setPilotAddWorking] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteContent, setInviteContent] = useState('')
  const [inviteCohort, setInviteCohort] = useState('pilot-main')
  const [inviteStage, setInviteStage] = useState<'invited' | 'enrolled'>('enrolled')
  const [inviteCredits, setInviteCredits] = useState('25')
  const [inviteReason, setInviteReason] = useState('')
  const [inviteWorking, setInviteWorking] = useState(false)
  const [importPreview, setImportPreview] = useState<AdminImportPreview | null>(null)
  const [invitationRefresh, setInvitationRefresh] = useState<AdminInvitation[] | null>(null)
  const [invitationIds, setInvitationIds] = useState<Set<string>>(new Set())
  const [invitationFilter, setInvitationFilter] = useState('open')
  const [inviteSendWorking, setInviteSendWorking] = useState(false)
  const [inviteNotice, setInviteNotice] = useState('')

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

  // Invitations arrive with the dashboard for first paint, and an import or a
  // send replaces them from their own endpoint rather than re-reading the whole
  // console. Derived rather than mirrored into state, so the two sources cannot
  // drift and no effect has to copy one into the other.
  const invitations = useMemo(
    () => invitationRefresh ?? dashboard?.invitations ?? [],
    [dashboard, invitationRefresh],
  )

  const refreshInvitations = useCallback(async () => {
    const response = await fetch('/api/admin/participants?programKey=pilot', { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    if (response.ok) setInvitationRefresh((data.invitations || []) as AdminInvitation[])
  }, [])

  const visibleInvitations = useMemo(() => invitations.filter((item) => (
    invitationFilter === 'all'
      || (invitationFilter === 'open' && (item.inviteStatus === 'pending' || item.inviteStatus === 'sent'))
      || item.inviteStatus === invitationFilter
  )), [invitationFilter, invitations])

  /**
   * How many invitations sit in each state, so the counts live inside the
   * filter options. This is what replaces the old "N of M invitations" reading:
   * its denominator spanned every status and never fell, because nothing
   * deletes an invitation row — accept, revoke and bounce are all status
   * updates. It therefore looked worse the better the pilot went.
   */
  const invitationCounts = useMemo(() => {
    const counts = { open: 0, accepted: 0, bounced: 0, revoked: 0, all: invitations.length }
    for (const item of invitations) {
      if (item.inviteStatus === 'pending' || item.inviteStatus === 'sent') counts.open += 1
      else if (item.inviteStatus === 'accepted') counts.accepted += 1
      else if (item.inviteStatus === 'bounced') counts.bounced += 1
      else if (item.inviteStatus === 'revoked') counts.revoked += 1
    }
    return counts
  }, [invitations])

  // Scoped to what is on screen. Selecting rows, filtering to a different
  // state and pressing Send used to act on invitations the operator could no
  // longer see.
  const selectedInvitations = useMemo(
    () => visibleInvitations.filter((item) => invitationIds.has(item.id)),
    [invitationIds, visibleInvitations],
  )
  /** Only an unclaimed invitation can be mailed or withdrawn. */
  const actionableInvitations = useMemo(
    () => selectedInvitations.filter((item) => item.inviteStatus === 'pending' || item.inviteStatus === 'sent'),
    [selectedInvitations],
  )

  const closeInvite = useCallback(() => {
    if (inviteWorking) return
    setInviteOpen(false)
    setImportPreview(null)
    setInviteContent('')
  }, [inviteWorking])

  const importRequest = useCallback(async (mode: 'preview' | 'commit') => {
    const response = await fetch('/api/admin/participants/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        content: inviteContent,
        programKey: 'pilot',
        cohortKey: inviteCohort.trim() || null,
        participationStatus: inviteStage,
        credits: dashboard?.capabilities.manageCredits ? Math.max(0, Number(inviteCredits) || 0) : 0,
        reason: inviteReason.trim(),
        importKey: `import_${crypto.randomUUID()}`,
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'The participant list could not be imported.')
    return data
  }, [dashboard, inviteCohort, inviteContent, inviteCredits, inviteReason, inviteStage])

  const previewImport = useCallback(async () => {
    setInviteWorking(true)
    setError('')
    try {
      setImportPreview(await importRequest('preview') as AdminImportPreview)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The participant list could not be read.')
    } finally {
      setInviteWorking(false)
    }
  }, [importRequest])

  const commitImport = useCallback(async () => {
    setInviteWorking(true)
    setError('')
    try {
      const result = await importRequest('commit') as { created: number; unchanged: number }
      setInviteNotice(`${result.created} invitation${result.created === 1 ? '' : 's'} created${result.unchanged ? `, ${result.unchanged} already existed` : ''}. Select them below to send.`)
      // The notice says "select them below", so show the list it means.
      setPeopleView('invitations')
      setInviteOpen(false)
      setImportPreview(null)
      setInviteContent('')
      await refreshInvitations()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The invitations could not be created.')
    } finally {
      setInviteWorking(false)
    }
  }, [importRequest, refreshInvitations])

  const sendInvitations = useCallback(async () => {
    if (!actionableInvitations.length) return
    setInviteSendWorking(true)
    setError('')
    try {
      const response = await fetch('/api/admin/participants/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'send', programKey: 'pilot',
          invitationIds: actionableInvitations.map((item) => item.id),
          idempotencyKey: `invite_${crypto.randomUUID()}`,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The invitations could not be sent.')
      setInviteNotice(`${data.sent} sent${data.failed ? `, ${data.failed} failed` : ''}${data.skipped ? `, ${data.skipped} already handled` : ''}.`)
      setInvitationIds(new Set())
      await refreshInvitations()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The invitations could not be sent.')
    } finally {
      setInviteSendWorking(false)
    }
  }, [actionableInvitations, refreshInvitations])

  const revokeInvitations = useCallback(async () => {
    if (!actionableInvitations.length) return
    setInviteSendWorking(true)
    setError('')
    try {
      const response = await fetch('/api/admin/participants', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revoke', programKey: 'pilot',
          invitationIds: actionableInvitations.map((item) => item.id),
          reason: 'Withdrawn by operator from the participant console',
          idempotencyKey: `revoke_${crypto.randomUUID()}`,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The invitations could not be withdrawn.')
      setInviteNotice(`${data.revoked} invitation${data.revoked === 1 ? '' : 's'} withdrawn.`)
      setInvitationIds(new Set())
      await refreshInvitations()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The invitations could not be withdrawn.')
    } finally {
      setInviteSendWorking(false)
    }
  }, [actionableInvitations, refreshInvitations])

  const allCohorts = useMemo(() => dashboard?.cohorts.map((item) => item.cohort) || [], [dashboard])
  const managementSignals = useMemo(() => {
    if (!dashboard) return []
    const pilotUsers = dashboard.users.filter((user) => user.participation?.programKey === 'pilot'
      && user.participation.participationStatus !== 'withdrawn')
    const returning = pilotUsers.filter((user) => user.activeDays >= 2).length
    const delivered = pilotUsers.reduce((sum, user) => sum + user.successfulRequests, 0)
    const projects = pilotUsers.reduce((sum, user) => sum + user.projects, 0)
    const creditsUsed = pilotUsers.reduce((sum, user) => sum + user.creditsSpent, 0)
    const cohorts = new Set(pilotUsers.map((user) => user.participation?.cohortKey).filter(Boolean)).size
    return [
      { id: 'participation', title: 'Pilot participation', summary: `${pilotUsers.length} participants across ${cohorts || 1} cohort${cohorts === 1 ? '' : 's'}.`, tone: 'healthy', tab: 'users' as AdminTab },
      { id: 'delivery', title: 'Successful work delivered', summary: `${number(delivered)} successful AI requests completed for pilot participants.`, tone: 'healthy', tab: 'cohorts' as AdminTab },
      { id: 'returning', title: 'Repeat engagement', summary: `${returning} participant${returning === 1 ? '' : 's'} returned and used AI360 on multiple days.`, tone: 'opportunity', tab: 'cohorts' as AdminTab },
      { id: 'creation', title: 'Projects taking shape', summary: `${number(projects)} projects created and ${number(creditsUsed)} credits used during the pilot.`, tone: 'opportunity', tab: 'users' as AdminTab },
    ]
  }, [dashboard])
  const needle = query.trim().toLowerCase()

  const visibleUsers = useMemo(() => (dashboard?.users || []).filter((user) => {
    const queryMatches = !needle || user.email.toLowerCase().includes(needle)
      || user.displayName?.toLowerCase().includes(needle) || user.id.toLowerCase().includes(needle)
    return queryMatches
      // Somebody who left the pilot is hidden unless asked for, which is the
      // only filtering a sixty-person list genuinely needs.
      && (includeWithdrawn || user.participation?.participationStatus !== 'withdrawn')
      && (feature === 'all' || user.features.includes(feature))
      && (programFilter === 'all' || (programFilter === 'none' ? !user.participation : user.participation?.programKey === programFilter))
      && (feedbackStatus === 'all' || user.participation?.feedbackStatus === feedbackStatus)
      && (engagement === 'all'
        || (engagement === 'invited_not_activated' && Boolean(user.participation) && user.successfulRequests === 0)
        || (engagement === 'activated_not_returned' && user.successfulRequests > 0 && user.activeDays < 2)
        || (engagement === 'active_low_credits' && user.status === 'active' && user.balanceHealth !== 'healthy')
        || (engagement === 'blocked_by_errors' && user.failedRequests > 0)
        || (engagement === 'high_engagement' && (user.activeDays >= 3 || user.projects >= 2)))
  }), [dashboard, engagement, feature, feedbackStatus, includeWithdrawn, needle, programFilter])

  const selectedUsers = useMemo(() => (dashboard?.users || []).filter((user) => selectedIds.has(user.id)), [dashboard, selectedIds])
  const allVisibleSelected = visibleUsers.length > 0 && visibleUsers.every((user) => selectedIds.has(user.id))
  const pilotCandidates = useMemo(() => {
    const search = pilotAddSearch.trim().toLowerCase()
    return (dashboard?.users || []).filter((user) => !user.participation || user.participation.participationStatus === 'withdrawn')
      .filter((user) => !search || user.email.toLowerCase().includes(search)
        || user.displayName?.toLowerCase().includes(search) || user.id.toLowerCase().includes(search))
  }, [dashboard, pilotAddSearch])
  const allPilotCandidatesSelected = pilotCandidates.length > 0 && pilotCandidates.every((user) => pilotAddIds.has(user.id))

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
    setQuery('')
    setFeature('all'); setErrorSource('all'); setSeverity('all'); setLedgerType('all')
    setProgramFilter('all'); setFeedbackStatus('all'); setEngagement('all')
    setIncludeWithdrawn(false)
  }

  function applySavedView(view: string) {
    resetFilters()
    setProgramFilter('pilot')
    if (view === 'invited') setEngagement('invited_not_activated')
    if (view === 'no_return') setEngagement('activated_not_returned')
    if (view === 'low_credits') setEngagement('active_low_credits')
    if (view === 'blocked') setEngagement('blocked_by_errors')
    if (view === 'feedback') setFeedbackStatus('requested')
    if (view === 'high_engagement') setEngagement('high_engagement')
  }

  function toggleUser(userId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  function toggleVisibleUsers() {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) visibleUsers.forEach((user) => next.delete(user.id))
      else visibleUsers.forEach((user) => next.add(user.id))
      return next
    })
  }

  function closeBulk() {
    setBulkKind(null)
    setBulkReason('')
    setEmailPreview(null)
  }

  async function runBulkAction() {
    if (!bulkKind || bulkKind === 'email' || !selectedUsers.length || !bulkReason.trim()) return
    setBulkWorking(true)
    setError('')
    try {
      const payload = bulkKind === 'credits'
        ? { action: 'credit_grant', userIds: selectedUsers.map((user) => user.id), credits: Number(bulkCredits), reason: bulkReason.trim(), idempotencyKey: crypto.randomUUID() }
        : bulkParticipation === 'withdrawn'
          ? { action: 'program_remove', userIds: selectedUsers.map((user) => user.id), programKey: 'pilot', reason: bulkReason.trim(), idempotencyKey: crypto.randomUUID() }
          : { action: 'program_update', userIds: selectedUsers.map((user) => user.id), programKey: 'pilot', cohortKey: bulkCohort.trim() || null, participationStatus: bulkParticipation, feedbackStatus: bulkFeedback === 'keep' ? undefined : bulkFeedback, reason: bulkReason.trim(), idempotencyKey: crypto.randomUUID() }
      const response = await fetch('/api/admin/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The bulk action could not be completed.')
      closeBulk()
      setSelectedIds(new Set())
      await loadDashboard(range)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The bulk action could not be completed.')
    } finally {
      setBulkWorking(false)
    }
  }

  async function exportUsersExcel(users: Array<Pick<AdminUser, 'id'>>, fileName = 'ai360-participants') {
    if (!users.length) return
    setExportWorking(true)
    setError('')
    try {
      const safeFileName = fileName.replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 80) || 'ai360-participants'
      const response = await fetch('/api/admin/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: users.map((user) => user.id), fileName: safeFileName }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'The Excel report could not be created.')
      }
      const href = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = href
      link.download = `${safeFileName}.xlsx`
      link.click()
      URL.revokeObjectURL(href)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Excel report could not be created.')
    } finally {
      setExportWorking(false)
    }
  }

  async function addPilotUsers(event: React.FormEvent) {
    event.preventDefault()
    const credits = Number(pilotAddCredits)
    if (!pilotAddIds.size || !pilotAddCohort.trim() || !pilotAddReason.trim()
      || !Number.isInteger(credits) || credits < 0) return
    setPilotAddWorking(true)
    setError('')
    try {
      const response = await fetch('/api/admin/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pilot_onboard', userIds: [...pilotAddIds], programKey: 'pilot',
          cohortKey: pilotAddCohort.trim(), participationStatus: pilotAddStatus,
          credits: dashboard?.capabilities.manageCredits ? credits : 0,
          reason: pilotAddReason.trim(), idempotencyKey: crypto.randomUUID(),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The selected users could not be added to the pilot.')
      setPilotAddOpen(false)
      setPilotAddIds(new Set())
      setPilotAddSearch('')
      setPilotAddReason('')
      await loadDashboard(range)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The selected users could not be added to the pilot.')
    } finally {
      setPilotAddWorking(false)
    }
  }

  async function previewBulkEmail() {
    if (!selectedUsers.length) return
    setBulkWorking(true)
    setError('')
    try {
      const response = await fetch('/api/admin/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'email_preview', userIds: selectedUsers.map((user) => user.id), programKey: 'pilot', templateKey: bulkTemplate, operatorNote: bulkNote.trim() || undefined }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The recipient preview could not be prepared.')
      setEmailPreview(data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The recipient preview could not be prepared.')
    } finally {
      setBulkWorking(false)
    }
  }

  async function sendBulkEmail() {
    if (!emailPreview?.eligible.length) return
    setBulkWorking(true)
    setError('')
    try {
      const response = await fetch('/api/admin/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'email_send', userIds: selectedUsers.map((user) => user.id), programKey: 'pilot', templateKey: bulkTemplate, operatorNote: bulkNote.trim() || undefined, idempotencyKey: crypto.randomUUID() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'The participant emails could not be sent.')
      closeBulk()
      setSelectedIds(new Set())
      await loadDashboard(range)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The participant emails could not be sent.')
    } finally {
      setBulkWorking(false)
    }
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

  const filtersActive = Boolean(query
    || feature !== 'all' || errorSource !== 'all' || severity !== 'all' || ledgerType !== 'all'
    || programFilter !== 'all' || feedbackStatus !== 'all' || engagement !== 'all'
    || includeWithdrawn)

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/app" className={styles.brand} aria-label="AI360 control room">
          {/* `onDark` because this sidebar is #181a19 in both themes, so the
              theme-scoped inversion in globals.css never applies to it. */}
          <BrandMark tone="onDark" width={148} height={39} priority alt="" />
          <small>CONTROL ROOM</small>
        </Link>
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
            {/* "+ Give credits" used to sit here too, opening the credit form
                pre-loaded with `dashboard.users[0]` — an arbitrary person,
                already selected, in a form that moves money. The same action
                lives on the Credits tab and in the bulk bar, both of which
                start from a person the operator chose. */}
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
                <section className={styles.pageTitle}><div><span className={styles.eyebrow}>Live pilot picture</span><h1>How the pilot is progressing.</h1><p>Participation, useful work, repeat engagement, credits, and measured cost in one place.</p></div><div className={styles.healthScore}><span>Delivery rate</span><b>{dashboard.summary.requestSuccessRate}%</b><i><span style={{ width: `${dashboard.summary.requestSuccessRate}%` }} /></i></div></section>
                <section className={styles.metrics}>
                  <Metric label="Active users" value={number(dashboard.summary.activeUsers)} detail={`${dashboard.summary.atRiskUsers} at risk · ${dashboard.summary.users} total`} tone="green" />
                  <Metric label="Credits available" value={number(dashboard.summary.availableCredits)} detail={`${number(dashboard.summary.reservedCredits)} currently held`} />
                  <Metric label="Credits consumed" value={number(dashboard.summary.creditsSpent)} detail={`${number(dashboard.summary.requests)} requests in window`} />
                  <Metric label="Provider cost" value={usd(dashboard.summary.providerCostUsd)} detail="Measured, not estimated" />
                  <Metric label="Work delivered" value={number(dashboard.summary.successfulRequests)} detail={`${dashboard.summary.requestSuccessRate}% delivery rate`} tone="green" />
                </section>
                <section className={styles.overviewGrid}>
                  <article className={styles.attentionCard}>
                    <header><div><span className={styles.eyebrow}>Management snapshot</span><h2>Pilot progress signals</h2></div><button onClick={() => setTab('cohorts')}>Open cohorts →</button></header>
                    <div className={styles.insightList}>{managementSignals.map((insight) => <button key={insight.id} data-tone={insight.tone} onClick={() => setTab(insight.tab)}><i /><span><b>{insight.title}</b><small>{insight.summary}</small></span><em>→</em></button>)}</div>
                  </article>
                  <article className={styles.featureHealth}>
                    <header><span className={styles.eyebrow}>Workflow adoption</span><h2>Most-used AI360 workflows</h2></header>
                    <div>{dashboard.features.slice(0, 7).map((item) => <button key={item.feature} onClick={() => { setFeature(item.feature); setTab('users') }}><span><b>{label(item.feature)}</b><small>{item.successfulRequests} delivered · {usd(item.providerCostUsd)} measured cost</small></span><span><b>{item.requests}</b><i><span style={{ width: `${dashboard.summary.requests ? (item.requests / dashboard.summary.requests) * 100 : 0}%` }} /></i></span></button>)}</div>
                  </article>
                </section>
                <section className={styles.splitSection}>
                  <article className={styles.panel}>
                    <header><div><span className={styles.eyebrow}>Pilot momentum</span><h2>Most engaged participants</h2></div><button onClick={() => { setProgramFilter('pilot'); setTab('users') }}>All participants</button></header>
                    <div className={styles.compactUsers}>{[...dashboard.users].filter((user) => user.participation?.programKey === 'pilot').sort((a, b) => b.activeDays - a.activeDays || b.successfulRequests - a.successfulRequests).slice(0, 6).map((user) => <button key={user.id} onClick={() => void inspectUser(user)}><UserIdentity user={user} compact /><span><b>{user.successfulRequests} delivered</b><small>{user.activeDays} active days · {timeAgo(user.lastActiveAt)}</small></span></button>)}</div>
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
                {/* One count, and only while a filter is narrowing the list —
                    "63 of 63" competing with a second counter six lines below
                    told the operator nothing either time. */}
                <section className={styles.pageTitle}><div><span className={styles.eyebrow}>People</span><h1>Move the pilot forward.</h1><p>{filtersActive ? `Showing ${visibleUsers.length} of ${dashboard.users.length}.` : `${dashboard.users.length} ${dashboard.users.length === 1 ? 'person' : 'people'} in the pilot.`}</p></div><div className={styles.pageTitleActions}>{dashboard.capabilities.importParticipants ? <button className={styles.heroAction} onClick={() => { setImportPreview(null); setInviteOpen(true) }}>+ Invite by email list</button> : null}{dashboard.capabilities.managePrograms ? <button className={styles.heroAction} onClick={() => { setPilotAddIds(new Set()); setPilotAddOpen(true) }}>+ Add pilot users</button> : null}</div></section>

                {/* One population at a time. The two lists hold different people
                    and take different actions, and the filter bar can only
                    belong to one of them — which was unreadable when both were
                    stacked with the filter wedged between. */}
                <div className={styles.viewSwitch} role="tablist" aria-label="Which list to show">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={peopleView === 'people'}
                    data-active={peopleView === 'people' || undefined}
                    onClick={() => setPeopleView('people')}
                  >
                    People <span>{dashboard.users.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={peopleView === 'invitations'}
                    data-active={peopleView === 'invitations' || undefined}
                    onClick={() => setPeopleView('invitations')}
                  >
                    Invitations <span>{invitationCounts.open}</span>
                  </button>
                </div>

                {peopleView === 'invitations' && (invitations.length || inviteNotice) ? (
                  <section className={styles.accountPicker} aria-label="Invitations">
                    <header>
                      <span>
                        <label className={styles.inviteScope}>
                          <span className={styles.srOnly}>Show invitations</span>
                          <select value={invitationFilter} onChange={(event) => setInvitationFilter(event.target.value)}>
                            <option value="open">Awaiting sign-up ({invitationCounts.open})</option>
                            <option value="accepted">Signed up ({invitationCounts.accepted})</option>
                            <option value="bounced">Email bounced ({invitationCounts.bounced})</option>
                            <option value="revoked">Cancelled ({invitationCounts.revoked})</option>
                            <option value="all">All ({invitationCounts.all})</option>
                          </select>
                        </label>
                        {selectedInvitations.length ? <b>{selectedInvitations.length} selected</b> : null}
                        {/* Shown only when it differs, rather than restating the
                            selected count in a second and third place. */}
                        {selectedInvitations.length > actionableInvitations.length ? (
                          <small>{selectedInvitations.length - actionableInvitations.length} already handled — they will be skipped</small>
                        ) : null}
                      </span>
                      <span>
                        <button type="button" onClick={() => setInvitationIds((current) => {
                          const next = new Set(current)
                          const all = visibleInvitations.every((item) => next.has(item.id))
                          visibleInvitations.forEach((item) => { if (all) next.delete(item.id); else next.add(item.id) })
                          return next
                        })}>{visibleInvitations.length && visibleInvitations.every((item) => invitationIds.has(item.id)) ? 'Clear' : 'Select all'}</button>
                        {dashboard.capabilities.sendInvitations ? <button type="button" disabled={inviteSendWorking || !actionableInvitations.length} onClick={() => void sendInvitations()}>{inviteSendWorking ? 'Working…' : `Send${actionableInvitations.length ? ` ${actionableInvitations.length}` : ''}`}</button> : null}
                        {dashboard.capabilities.importParticipants ? <button type="button" disabled={inviteSendWorking || !actionableInvitations.length} onClick={() => void revokeInvitations()}>Cancel</button> : null}
                      </span>
                    </header>
                    {inviteNotice ? (
                      <p className={styles.inviteNotice}>
                        <span>{inviteNotice}</span>
                        {/* Nothing cleared this before, so "3 sent" stayed on
                            screen for the rest of the session and read as
                            current an hour later. */}
                        <button type="button" onClick={() => setInviteNotice('')} aria-label="Dismiss">×</button>
                      </p>
                    ) : null}
                    <div>
                      {visibleInvitations.slice(0, 100).map((invitation) => (
                        <label key={invitation.id} data-selected={invitationIds.has(invitation.id) || undefined}>
                          <input
                            type="checkbox"
                            checked={invitationIds.has(invitation.id)}
                            onChange={() => setInvitationIds((current) => {
                              const next = new Set(current)
                              if (next.has(invitation.id)) next.delete(invitation.id)
                              else next.add(invitation.id)
                              return next
                            })}
                          />
                          <UserIdentity user={{ displayName: invitation.displayName, email: invitation.email }} compact />
                          <span>
                            <b>{INVITE_STATUS_LABELS[invitation.inviteStatus] ?? label(invitation.inviteStatus)}</b>
                            {/* `sendAttempts` stays because a failed send leaves
                                the invitation `pending` while still counting the
                                attempt — so "never tried" and "tried three times
                                and keeps failing" both read as Not sent, and this
                                is the only thing telling them apart. The
                                timestamp comes from `lastAttemptAt`, since
                                `sentAt` freezes at the first success. */}
                            <small>{invitation.cohortKey || 'no cohort'} · {invitation.startingCredits} credits · {invitation.sendAttempts ? `${invitation.sendAttempts} send${invitation.sendAttempts === 1 ? '' : 's'} · ${timeAgo(invitation.lastAttemptAt)}` : 'not sent'}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    {!visibleInvitations.length ? <p>Nothing in this state. Try another from the list above.</p> : null}
                    {visibleInvitations.length > 100 ? <p>Showing the first 100 invitations.</p> : null}
                    {!dashboard.capabilities.sendInvitations ? <p>Sending is unavailable until the email provider and the Supabase service role key are both configured.</p> : null}
                  </section>
                ) : null}

                {peopleView === 'invitations' && !invitations.length && !inviteNotice ? (
                  <Empty title="Nobody invited yet" detail="Use “Invite by email list” above to bring participants in." />
                ) : null}

                {peopleView === 'people' ? <>
                {/* These were the "Signal" dropdown as well, which offered the
                    same five values one extra click away. Buttons win: they
                    reset the other filters first, so a contradictory stack
                    cannot be built by accident. */}
                <section className={styles.savedViews} aria-label="Who needs attention">
                  <span>Who needs attention</span>
                  <button onClick={() => applySavedView('invited')}>Signed up, never used it</button>
                  <button onClick={() => applySavedView('no_return')}>Tried it once, never came back</button>
                  <button onClick={() => applySavedView('low_credits')}>Running out of credits</button>
                  <button onClick={() => applySavedView('blocked')}>Hit errors</button>
                  <button onClick={() => applySavedView('feedback')}>Owe us feedback</button>
                  <button onClick={() => applySavedView('high_engagement')}>Most active</button>
                </section>
                <section className={styles.filterBar}>
                  <label className={styles.search}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" /></label>
                  <label className={styles.inlineCheck}>
                    <input type="checkbox" checked={includeWithdrawn} onChange={(event) => setIncludeWithdrawn(event.target.checked)} />
                    <span>Include people who left</span>
                  </label>
                  {filtersActive ? <button className={styles.clear} onClick={resetFilters}>Clear</button> : null}
                </section>
                {selectedUsers.length ? <section className={styles.bulkBar}>
                  <div><b>{selectedUsers.length} selected</b><span>{selectedUsers.filter((user) => user.participation?.programKey === 'pilot').length} in pilot · {selectedUsers.filter((user) => user.failedRequests > 0).length} with errors</span></div>
                  <div>
                    {dashboard.capabilities.managePrograms ? <button onClick={() => setBulkKind('program')}>Update pilot</button> : null}
                    {dashboard.capabilities.manageCredits ? <button onClick={() => setBulkKind('credits')}>Grant credits</button> : null}
                    {dashboard.capabilities.sendParticipantEmail ? <button onClick={() => { setEmailPreview(null); setBulkKind('email') }}>Send email</button> : null}
                    {/* One export, not two. CSV is instant and client-side, and
                        opens in Excel anyway; the server round-trip bought a
                        second button and a loading state for a 63-row table. */}
                    <button onClick={() => exportUsers(selectedUsers)}>Download</button>
                    <button className={styles.clearSelection} onClick={() => setSelectedIds(new Set())}>Clear</button>
                  </div>
                </section> : null}
                <section className={styles.tablePanel}>
                  {/* Errors are part of the activity story, not a separate
                      discipline, so Reliability folds into Activity. The row is
                      already the click target, so the trailing View button was
                      a column that duplicated it. */}
                  <table><thead><tr><th className={styles.checkCell}><input type="checkbox" aria-label="Select all visible users" checked={allVisibleSelected} onChange={toggleVisibleUsers} /></th><th>Person</th><th>Status</th><th>Activity</th><th>Credits</th><th>Last contact</th></tr></thead>
                    <tbody>{visibleUsers.map((user) => <tr key={user.id} onClick={() => void inspectUser(user)} data-selected={selectedIds.has(user.id) || undefined}>
                      <td className={styles.checkCell} onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${user.displayName || user.email}`} checked={selectedIds.has(user.id)} onChange={() => toggleUser(user.id)} /></td>
                      <td><UserIdentity user={user} /></td>
                      <td>{user.participation ? <><span className={styles.badge} data-tone={user.participation.participationStatus}>{label(user.participation.participationStatus)}</span><small>{user.participation.cohortKey || user.participation.programKey}</small></> : <><b>Not enrolled</b><small>No program state</small></>}</td>
                      <td>
                        <b>{user.activeDays} active day{user.activeDays === 1 ? '' : 's'} · {timeAgo(user.lastActiveAt)}</b>
                        <small className={user.failedRequests ? styles.danger : ''}>
                          {user.successfulRequests} delivered{user.failedRequests ? ` · ${user.failedRequests} failed` : ''}{user.qualityReports ? ` · ${user.qualityReports} reports` : ''}
                        </small>
                      </td>
                      <td><b>{number(user.availableCredits)} left</b><small>{user.creditsSpent} used · {user.balanceHealth}</small></td>
                      <td><b>{user.participation?.lastContactedAt ? timeAgo(user.participation.lastContactedAt) : 'Never'}</b><small>{user.participation?.feedbackStatus ? label(user.participation.feedbackStatus) : '—'}</small></td>
                    </tr>)}</tbody></table>
                  {!visibleUsers.length ? <Empty title="No users match these filters" detail="Clear one or more filters to widen the view." /> : null}
                </section>
                </> : null}
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

            {tab === 'finance' ? (
              <>
                <section className={styles.pageTitle}>
                  <div><span className={styles.eyebrow}>Financial control</span><h1>Know what every credit earns.</h1><p>Track collected cash, real provider spend, media charges, and the pricing logic that turns cost into credits.</p></div>
                  <div className={styles.resultCount}><b>{ghs(dashboard.finance.calculation.referenceCreditPriceGhs, 4)}</b><span>reference price per credit</span></div>
                </section>
                <section className={styles.metrics}>
                  <Metric label="Cash collected" value={ghs(dashboard.finance.cashCollectedGhs)} detail={`${number(dashboard.finance.approvedPayments)} approved payments`} tone="green" />
                  <Metric label="Landed provider cost" value={ghs(dashboard.finance.landedCostGhs)} detail={`${usd(dashboard.finance.providerCostUsd)} raw provider spend`} />
                  <Metric label="Credits charged" value={number(dashboard.finance.chargedCredits)} detail={`${ghs(dashboard.finance.referenceBilledGhs)} at reference rate`} />
                  <Metric label="Gross profit" value={ghs(dashboard.finance.grossProfitGhs)} detail="Reference billed value less landed AI cost" tone={dashboard.finance.grossProfitGhs >= 0 ? 'green' : 'red'} />
                  <Metric label="Gross margin" value={percent(dashboard.finance.grossMarginPercent)} detail={`Target AI cost ≤ ${dashboard.finance.calculation.targetProviderCostPercent}%`} tone={(dashboard.finance.grossMarginPercent || 0) >= 0 ? 'green' : 'red'} />
                </section>

                <section className={styles.financeNote}>
                  <b>Two honest views</b>
                  <p><strong>Cash collected</strong> is approved payments in this window. <strong>Reference billed value</strong> prices consumed credits at the {dashboard.finance.calculation.referencePlanName} rate. They differ when subscriptions are paid before usage, or when free, sponsored, refunded, or admin credits are consumed.</p>
                  <span>Cash-window margin {percent(dashboard.finance.cashGrossMarginPercent)} · {ghs(dashboard.finance.cashGrossProfitGhs)} contribution</span>
                </section>

                <section className={styles.financeGrid}>
                  <article className={styles.financePanel}>
                    <header><div><span className={styles.eyebrow}>Media unit economics</span><h2>Images and video, measured.</h2></div><span>{range === 'all' ? 'All time' : range}</span></header>
                    <div className={styles.mediaFinanceRows}>
                      {dashboard.finance.media.map((item) => (
                        <article key={item.mediaType} data-media={item.mediaType}>
                          <header><span>{item.mediaType === 'image' ? 'IMG' : 'VID'}</span><div><h3>{item.mediaType === 'image' ? 'Generated images' : 'Generated video'}</h3><p>{number(item.settledJobs)} settled jobs · {number(item.chargedJobs)} charged</p></div></header>
                          <dl>
                            <div><dt>Credits charged</dt><dd>{number(item.chargedCredits)}<small>{item.averageCreditsCharged.toFixed(1)} average per job</small></dd></div>
                            <div><dt>Provider cost</dt><dd>{usd(item.providerCostUsd)}<small>{number(item.providerCharges)} measured charges</small></dd></div>
                            <div><dt>Landed cost</dt><dd>{ghs(item.landedCostGhs)}<small>{ghs(item.averageLandedCostGhs)} average per provider charge</small></dd></div>
                            <div><dt>Reference billed</dt><dd>{ghs(item.referenceBilledGhs)}<small>Credits × reference rate</small></dd></div>
                            <div><dt>Gross profit</dt><dd className={item.grossProfitGhs >= 0 ? styles.positive : styles.danger}>{ghs(item.grossProfitGhs)}<small>{percent(item.grossMarginPercent)} gross margin</small></dd></div>
                          </dl>
                        </article>
                      ))}
                    </div>
                  </article>

                  <aside className={styles.unitEconomics}>
                    <header><span className={styles.eyebrow}>One credit</span><h2>The reference unit.</h2><p>The {dashboard.finance.calculation.referencePlanName} plan anchors the operating price.</p></header>
                    <div className={styles.unitEquation}>
                      <span><small>Sell</small><b>{ghs(dashboard.finance.calculation.referenceCreditPriceGhs, 4)}</b></span>
                      <i>−</i>
                      <span><small>AI cost budget</small><b>{ghs(dashboard.finance.calculation.costBudgetPerCreditGhs, 2)}</b></span>
                      <i>=</i>
                      <span><small>Gross profit</small><b>{ghs(dashboard.finance.calculation.unitGrossProfitGhs, 4)}</b></span>
                    </div>
                    <div className={styles.marginGauge}><span style={{ width: `${Math.max(0, Math.min(100, dashboard.finance.calculation.unitGrossMarginPercent))}%` }} /><b>{percent(dashboard.finance.calculation.unitGrossMarginPercent)} margin</b></div>
                    <p className={styles.unitSource}>{ghs(dashboard.finance.calculation.referencePlanPriceGhs, 0)} plan price ÷ {number(dashboard.finance.calculation.referencePlanCredits)} credits. Gross profit excludes payment fees, taxes, support, payroll, and other fixed costs.</p>
                  </aside>
                </section>

                <section className={styles.calculationGrid}>
                  <article className={styles.formulaPanel}>
                    <header><span className={styles.eyebrow}>Charging calculation</span><h2>How the engine gets to credits.</h2></header>
                    <ol>
                      <li><span>01</span><div><b>Start with the measured provider charge</b><p>The provider reports the actual USD cost after the work finishes.</p></div></li>
                      <li><span>02</span><div><b>Land the cost in Ghana cedis</b><p>USD cost × {(1 + dashboard.finance.calculation.providerFeePercent / 100).toFixed(3)} platform factor × {dashboard.finance.calculation.usdToGhs.toFixed(2)} FX rate × {(1 + dashboard.finance.calculation.fxBufferPercent / 100).toFixed(2)} FX buffer.</p></div></li>
                      <li><span>03</span><div><b>Convert cost to credits</b><p>Round up landed cost ÷ {ghs(dashboard.finance.calculation.costBudgetPerCreditGhs)} cost budget per credit.</p></div></li>
                      <li><span>04</span><div><b>Apply the safety rails</b><p>Successful images charge at least {dashboard.finance.calculation.imageFloorCredits} credits; video at least {dashboard.finance.calculation.videoFloorCredits}. A task never exceeds the amount the customer approved and failures charge zero.</p></div></li>
                    </ol>
                  </article>

                  <article className={styles.priceBook}>
                    <header><div><span className={styles.eyebrow}>Credit price book</span><h2>What one credit sells for.</h2></div><p>Plans and top-ups have different rates. The dashboard uses {dashboard.finance.calculation.referencePlanName} as its consistent comparison rate.</p></header>
                    <div>
                      {dashboard.finance.creditRates.map((rate) => (
                        <article key={rate.id}>
                          <span data-kind={rate.kind}>{rate.kind === 'top_up' ? 'Top-up' : rate.kind === 'free' ? 'Free' : 'Plan'}</span>
                          <div><b>{rate.name}</b><small>{ghs(rate.priceGhs, 0)} for {number(rate.credits)} credits</small></div>
                          <div><b>{rate.pricePerCreditGhs === null ? 'Free allowance' : `${ghs(rate.pricePerCreditGhs, 4)} / credit`}</b><small>{ghs(rate.fullUseCostGhs)} full-use AI cost</small></div>
                          <div><b>{percent(rate.grossMarginPercent)}</b><small>{rate.grossProfitGhs === null ? 'Cost centre' : `${ghs(rate.grossProfitGhs)} gross profit`}</small></div>
                        </article>
                      ))}
                    </div>
                  </article>
                </section>

                <section className={`${styles.tablePanel} ${styles.financeLedger}`}>
                  <header className={styles.panelHeader}><div><span className={styles.eyebrow}>Recent media economics</span><h2>Every settled image and video.</h2></div><span>{dashboard.finance.recentMedia.length} line items</span></header>
                  <table>
                    <thead><tr><th>Work</th><th>User</th><th>Charged</th><th>Provider cost</th><th>Landed cost</th><th>Reference billed</th><th>Gross profit</th><th>When</th></tr></thead>
                    <tbody>{dashboard.finance.recentMedia.map((item) => (
                      <tr key={item.id}>
                        <td><b>{item.mediaType === 'image' ? 'Image' : 'Video'} · {label(item.status)}</b><small>{item.model || 'Model unavailable'} · {item.id}</small></td>
                        <td><b>{item.displayName || item.email || 'Unknown account'}</b><small>{item.email || item.userId || '—'}</small></td>
                        <td><b>{number(item.chargedCredits)} credits</b><small>{item.chargedCredits > 0 ? 'Settled charge' : 'No customer charge'}</small></td>
                        <td><b>{usd(item.providerCostUsd)}</b><small>Measured</small></td>
                        <td><b>{ghs(item.landedCostGhs)}</b><small>Fee + FX included</small></td>
                        <td><b>{ghs(item.referenceBilledGhs)}</b><small>{ghs(dashboard.finance.calculation.referenceCreditPriceGhs, 4)} / credit</small></td>
                        <td><b className={item.grossProfitGhs >= 0 ? styles.positive : styles.danger}>{ghs(item.grossProfitGhs)}</b><small>{percent(item.grossMarginPercent)} margin</small></td>
                        <td><b>{date(item.occurredAt, true)}</b></td>
                      </tr>
                    ))}</tbody>
                  </table>
                  {!dashboard.finance.recentMedia.length ? <Empty title="No settled media in this window" detail="Try a wider date range to see image and video unit economics." /> : null}
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
                <section className={styles.pageTitle}><div><span className={styles.eyebrow}>Cohort intelligence</span><h1>From access to real value.</h1><p>Activation and repeat use now live beside the rest of customer operations.</p></div><div className={styles.cohortControls}><select value={cohortReport?.cohort || allCohorts[0] || ''} onChange={(event) => void loadCohort(event.target.value)}>{!allCohorts.length ? <option value="">No cohorts yet</option> : allCohorts.map((item) => <option key={item}>{item}</option>)}</select><button disabled={!cohortReport || exportWorking} onClick={() => cohortReport && void exportUsersExcel(cohortReport.users.map((user) => ({ id: user.userId })), `${cohortReport.cohort}-admin-report`)}>{exportWorking ? 'Creating…' : 'Export Excel'}</button><button disabled={!cohortReport} onClick={() => cohortReport && exportCohort(cohortReport)}>Export CSV</button></div></section>
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
      {selectedUser && !selectedUserLoading ? <div className={styles.drawerBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedUser(null) }}><aside className={styles.drawer} aria-label="User details"><header className={styles.drawerTop}><span>Participant operations</span><button onClick={() => setSelectedUser(null)}>×</button></header><div className={styles.userHero}><UserIdentity user={selectedUser.user} /><span className={styles.badge} data-tone={selectedUser.user.participation?.participationStatus || selectedUser.user.status}>{label(selectedUser.user.participation?.participationStatus || selectedUser.user.status)}</span><p>{selectedUser.user.participation ? `${selectedUser.user.participation.programKey} · ${selectedUser.user.participation.cohortKey || 'unassigned cohort'} · ${label(selectedUser.user.participation.feedbackStatus)} feedback` : 'Not enrolled in a program'}</p><div>{dashboard?.capabilities.manageCredits ? <><button onClick={() => { setCreditAction('grant'); setCreditTarget(selectedUser.user) }}>+ Grant credits</button><button onClick={() => { setCreditAction('refund'); setCreditTarget(selectedUser.user) }}>↩ Refund</button></> : null}<a href={`mailto:${selectedUser.user.email}`}>Contact</a></div></div><section className={styles.drawerMetrics}><div><span>Available</span><b>{selectedUser.user.availableCredits}</b><small>{selectedUser.user.reservedCredits} held</small></div><div><span>Reliability</span><b>{selectedUser.user.successfulRequests}</b><small>{selectedUser.user.failedRequests} failed</small></div><div><span>Contacts</span><b>{selectedUser.user.participation?.contactCount || 0}</b><small>{selectedUser.user.participation?.lastContactedAt ? timeAgo(selectedUser.user.participation.lastContactedAt) : 'Never contacted'}</small></div></section><section className={styles.timeline}><header><span className={styles.eyebrow}>Participant timeline</span><h2>Usage, credits, errors, and contact</h2></header>{[
        ...selectedUser.errors.map((item) => ({ id: item.id, at: item.lastSeenAt, tone: 'error', title: `${item.occurrences}× ${label(item.code)}`, detail: `${label(item.feature)} · ${item.route || item.source}` })),
        ...selectedUser.creditLedger.map((item) => ({ id: `credit-${item.id}`, at: item.createdAt, tone: 'credit', title: `${item.creditsDelta >= 0 ? '+' : ''}${item.creditsDelta} credits`, detail: `${label(item.entryType)} · balance ${item.balanceAfter}` })),
        ...selectedUser.auditEvents.map((item) => ({ id: `audit-${item.id}`, at: item.createdAt, tone: 'admin', title: label(item.action), detail: item.reason })),
        ...selectedUser.contactEvents.map((item) => ({ id: `contact-${item.id}`, at: item.createdAt, tone: 'contact', title: `${label(item.templateKey)} · ${label(item.deliveryStatus)}`, detail: item.subject })),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 30).map((event) => <article key={event.id} data-tone={event.tone}><i /><div><b>{event.title}</b><p>{event.detail}</p><small>{date(event.at, true)}</small></div></article>)}</section></aside></div> : null}

      {pilotAddOpen ? <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !pilotAddWorking) setPilotAddOpen(false) }}><form className={`${styles.creditModal} ${styles.addPilotModal}`} onSubmit={addPilotUsers}>
        <header><div><span className={styles.eyebrow}>Pilot access</span><h2>Add pilot users</h2><p>Choose existing AI360 accounts, assign their starting cohort, and optionally grant credits in the same action.</p></div><button type="button" onClick={() => setPilotAddOpen(false)}>×</button></header>
        <label><span>Find accounts</span><input autoFocus value={pilotAddSearch} onChange={(event) => setPilotAddSearch(event.target.value)} placeholder="Search name, email, or user ID" /></label>
        <div className={styles.accountPicker}>
          <header><span><b>{pilotAddIds.size} selected</b><small>{pilotCandidates.length} eligible accounts</small></span>{pilotCandidates.length ? <button type="button" onClick={() => setPilotAddIds((current) => { const next = new Set(current); if (allPilotCandidatesSelected) pilotCandidates.forEach((user) => next.delete(user.id)); else pilotCandidates.forEach((user) => next.add(user.id)); return next })}>{allPilotCandidatesSelected ? 'Clear matches' : 'Select matches'}</button> : null}</header>
          <div>{pilotCandidates.slice(0, 50).map((user) => <label key={user.id} data-selected={pilotAddIds.has(user.id) || undefined}><input type="checkbox" checked={pilotAddIds.has(user.id)} onChange={() => setPilotAddIds((current) => { const next = new Set(current); if (next.has(user.id)) next.delete(user.id); else next.add(user.id); return next })} /><UserIdentity user={user} compact /><span><b>{user.availableCredits} credits</b><small>{user.participation?.participationStatus === 'withdrawn' ? 'Previously withdrawn' : 'Not in pilot'}</small></span></label>)}</div>
          {!pilotCandidates.length ? <p>No eligible accounts match this search.</p> : null}
          {pilotCandidates.length > 50 ? <p>Showing the first 50 matches. Narrow the search to find a specific account.</p> : null}
        </div>
        <div className={styles.formGrid}>
          <label><span>Starting stage</span><select value={pilotAddStatus} onChange={(event) => setPilotAddStatus(event.target.value as 'invited' | 'enrolled')}><option value="enrolled">Enrolled</option><option value="invited">Invited</option></select></label>
          <label><span>Cohort</span><input maxLength={120} value={pilotAddCohort} onChange={(event) => setPilotAddCohort(event.target.value)} placeholder="pilot-main" /></label>
        </div>
        {dashboard?.capabilities.manageCredits ? <label><span>Starting credits per user <em>Enter 0 for none</em></span><input type="number" min="0" max="10000" step="1" value={pilotAddCredits} onChange={(event) => setPilotAddCredits(event.target.value)} /></label> : null}
        {dashboard?.capabilities.manageCredits && pilotAddIds.size ? <div className={styles.bulkImpact}><b>{number(Math.max(0, Number(pilotAddCredits) || 0) * pilotAddIds.size)} credits total</b><span>{Math.max(0, Number(pilotAddCredits) || 0)} × {pilotAddIds.size} selected accounts</span></div> : null}
        <label><span>Reason <em>Required for audit</em></span><textarea rows={3} maxLength={240} value={pilotAddReason} onChange={(event) => setPilotAddReason(event.target.value)} placeholder="Example: August creator pilot intake" /></label>
        <p className={styles.auditNote}>Each participant receives an individual program history entry. Any starting credits also receive an immutable credit-ledger and operator audit entry.</p>
        <footer><button type="button" onClick={() => setPilotAddOpen(false)}>Cancel</button><button type="submit" disabled={pilotAddWorking || !pilotAddIds.size || !pilotAddCohort.trim() || !pilotAddReason.trim()}>{pilotAddWorking ? 'Adding users…' : `Add ${pilotAddIds.size || ''} to pilot`}</button></footer>
      </form></div> : null}

      {inviteOpen ? <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) closeInvite() }}><section className={`${styles.creditModal} ${styles.addPilotModal}`}>
        <header><div><span className={styles.eyebrow}>Pilot recruitment</span><h2>{importPreview ? 'Confirm the list' : 'Invite by email list'}</h2><p>{importPreview ? 'Review who becomes an invitation and why the rest were set aside. Nothing has been written yet.' : 'Paste addresses or upload a CSV. People who have never signed up are invited; nothing is sent until you choose to send it.'}</p></div><button type="button" onClick={closeInvite}>×</button></header>

        {!importPreview ? <>
          <label><span>Email list <em>One per line, or a CSV with an Email column</em></span><textarea rows={8} value={inviteContent} onChange={(event) => setInviteContent(event.target.value)} placeholder={'ada@example.com\nLin Chen <lin@example.com>'} /></label>
          <label><span>Or upload a file <em>.csv or .txt</em></span><input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            setInviteContent(await file.text())
            // Cleared so choosing the same file twice still fires a change.
            event.target.value = ''
          }} /></label>
          <div className={styles.formGrid}>
            <label><span>Starting stage</span><select value={inviteStage} onChange={(event) => setInviteStage(event.target.value as 'invited' | 'enrolled')}><option value="enrolled">Enrolled</option><option value="invited">Invited</option></select></label>
            <label><span>Cohort</span><input maxLength={120} value={inviteCohort} onChange={(event) => setInviteCohort(event.target.value)} placeholder="pilot-main" /></label>
          </div>
          {dashboard?.capabilities.manageCredits ? <label><span>Starting credits per participant <em>Granted when they sign up</em></span><input type="number" min="0" max="10000" step="1" value={inviteCredits} onChange={(event) => setInviteCredits(event.target.value)} /></label> : null}
          <label><span>Reason <em>Required for audit</em></span><textarea rows={2} maxLength={240} value={inviteReason} onChange={(event) => setInviteReason(event.target.value)} placeholder="Example: August creator pilot intake" /></label>
          <div className={styles.emailSafety}><b>Before anything is written</b><p>AI360 will show you every address it accepted, every one it set aside, and why — invalid addresses, repeats, people already invited, and people who already have an account.</p></div>
          <footer><button type="button" onClick={closeInvite}>Cancel</button><button type="button" disabled={inviteWorking || !inviteContent.trim() || !inviteReason.trim()} onClick={() => void previewImport()}>{inviteWorking ? 'Reading…' : 'Review the list'}</button></footer>
        </> : <>
          <div className={styles.recipientCounts}><div><b>{importPreview.ready.length}</b><span>will be invited</span></div><div><b>{importPreview.skipped.length}</b><span>set aside</span></div></div>
          {importPreview.truncated ? <p className={styles.warningNote}>This list was longer than the {number(importPreview.ready.length + importPreview.skipped.length)} rows shown. Import these first, then bring the rest in a second batch.</p> : null}
          <div className={styles.recipientList}><header><b>New invitations</b><span>{importPreview.format === 'csv' ? 'Read as a CSV' : 'Read as an address list'}</span></header>{importPreview.ready.slice(0, 12).map((row) => <div key={row.email}><span>{row.displayName || row.email.split('@')[0]}</span><small>{row.email}{row.cohortKey ? ` · ${row.cohortKey}` : ''}</small></div>)}{importPreview.ready.length > 12 ? <p>+ {importPreview.ready.length - 12} more</p> : null}{!importPreview.ready.length ? <p>Nothing in this list would create a new invitation.</p> : null}</div>
          {importPreview.skipped.length ? <div className={styles.excludedList}><b>Set aside</b><span>{importPreview.skipped.slice(0, 8).map((row) => `line ${row.line}: ${row.email.slice(0, 40)} · ${IMPORT_REASONS[row.disposition] || label(row.disposition)}`).join('  |  ')}{importPreview.skipped.length > 8 ? `  |  + ${importPreview.skipped.length - 8} more` : ''}</span></div> : null}
          <p className={styles.auditNote}>Creating invitations sends nothing. You choose who to email, and when, from the invitation list.</p>
          <footer><button type="button" disabled={inviteWorking} onClick={() => setImportPreview(null)}>Back</button><button type="button" disabled={inviteWorking || !importPreview.ready.length} onClick={() => void commitImport()}>{inviteWorking ? 'Creating…' : `Create ${importPreview.ready.length} invitation${importPreview.ready.length === 1 ? '' : 's'}`}</button></footer>
        </>}
      </section></div> : null}

      {bulkKind && bulkKind !== 'email' ? <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !bulkWorking) closeBulk() }}><form className={`${styles.creditModal} ${styles.bulkModal}`} onSubmit={(event) => { event.preventDefault(); void runBulkAction() }}>
        <header><div><span className={styles.eyebrow}>Bulk action · {selectedUsers.length} people</span><h2>{bulkKind === 'credits' ? 'Grant pilot credits' : 'Update pilot participation'}</h2></div><button type="button" onClick={closeBulk}>×</button></header>
        <div className={styles.selectionPreview}><span>{selectedUsers.slice(0, 4).map((user) => user.displayName || user.email).join(', ')}{selectedUsers.length > 4 ? ` + ${selectedUsers.length - 4} more` : ''}</span><b>Exact selection: {selectedUsers.length}</b></div>
        {bulkKind === 'credits' ? <>
          <label><span>Credits per participant</span><input type="number" min="1" max="10000" step="1" value={bulkCredits} onChange={(event) => setBulkCredits(event.target.value)} /></label>
          <div className={styles.bulkImpact}><b>{number(Math.max(0, Number(bulkCredits) || 0) * selectedUsers.length)} credits total</b><span>{bulkCredits || 0} × {selectedUsers.length} selected accounts</span></div>
        </> : <>
          <label><span>Participation stage</span><select value={bulkParticipation} onChange={(event) => setBulkParticipation(event.target.value)}>{PARTICIPATION_STATUSES.map((item) => <option value={item} key={item}>{label(item)}</option>)}</select></label>
          {bulkParticipation !== 'withdrawn' ? <label><span>Cohort</span><input maxLength={120} value={bulkCohort} onChange={(event) => setBulkCohort(event.target.value)} placeholder="pilot-main" /></label> : <p className={styles.warningNote}>This marks each selected participant as withdrawn and removes their active cohort, while preserving their history.</p>}
          {bulkParticipation !== 'withdrawn' ? <label><span>Feedback stage</span><select value={bulkFeedback} onChange={(event) => setBulkFeedback(event.target.value)}><option value="keep">Keep current stage</option>{FEEDBACK_STATUSES.map((item) => <option value={item} key={item}>{label(item)}</option>)}</select></label> : null}
        </>}
        <label><span>Reason <em>Required for audit</em></span><textarea rows={3} maxLength={240} value={bulkReason} onChange={(event) => setBulkReason(event.target.value)} placeholder="Why is this action appropriate for this selection?" /></label>
        <p className={styles.auditNote}>{bulkKind === 'credits' ? 'Every participant gets an individual ledger entry and operator audit record.' : 'Every participant update gets an immutable program event with this reason.'}</p>
        <footer><button type="button" onClick={closeBulk}>Cancel</button><button type="submit" disabled={bulkWorking || !bulkReason.trim() || (bulkKind === 'credits' && !Number(bulkCredits))}>{bulkWorking ? 'Applying…' : `Confirm for ${selectedUsers.length}`}</button></footer>
      </form></div> : null}

      {bulkKind === 'email' ? <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !bulkWorking) closeBulk() }}><section className={`${styles.creditModal} ${styles.bulkModal}`}>
        <header><div><span className={styles.eyebrow}>Participant outreach · {selectedUsers.length} selected</span><h2>{emailPreview ? 'Confirm the recipients' : 'Prepare an email'}</h2></div><button type="button" onClick={closeBulk}>×</button></header>
        {!emailPreview ? <>
          <label><span>Template</span><select value={bulkTemplate} onChange={(event) => setBulkTemplate(event.target.value)}>{EMAIL_TEMPLATES.map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select></label>
          <label><span>Optional personal note <em>Same note for everyone</em></span><textarea rows={4} maxLength={500} value={bulkNote} onChange={(event) => setBulkNote(event.target.value)} placeholder="Add context from the pilot team. Names are personalized automatically." /></label>
          <div className={styles.emailSafety}><b>Before anything sends</b><p>AI360 will remove unsubscribed, suppressed, missing-email, and non-pilot accounts, then show you the exact recipients and final message.</p></div>
          <footer><button type="button" onClick={closeBulk}>Cancel</button><button type="button" disabled={bulkWorking} onClick={() => void previewBulkEmail()}>{bulkWorking ? 'Preparing…' : 'Review recipients'}</button></footer>
        </> : <>
          <div className={styles.recipientCounts}><div><b>{emailPreview.eligible.length}</b><span>will receive</span></div><div><b>{emailPreview.excluded.length}</b><span>excluded safely</span></div></div>
          <div className={styles.recipientList}><header><b>Exact recipients</b><span>{emailPreview.eligible.length} individual emails</span></header>{emailPreview.eligible.slice(0, 12).map((item) => <div key={item.userId}><span>{item.displayName || item.email.split('@')[0]}</span><small>{item.email}</small></div>)}{emailPreview.eligible.length > 12 ? <p>+ {emailPreview.eligible.length - 12} more recipients</p> : null}</div>
          {emailPreview.excluded.length ? <div className={styles.excludedList}><b>Excluded</b><span>{emailPreview.excluded.map((item) => `${item.email || item.userId} · ${label(item.reason)}`).slice(0, 6).join('  |  ')}</span></div> : null}
          {emailPreview.sample ? <div className={styles.messagePreview}><span>Message preview</span><b>{emailPreview.sample.subject}</b><pre>{emailPreview.sample.text}</pre></div> : null}
          <p className={styles.auditNote}>Each delivery is private, idempotent, and recorded in that participant’s contact history.</p>
          <footer><button type="button" disabled={bulkWorking} onClick={() => setEmailPreview(null)}>Back</button><button type="button" disabled={bulkWorking || !emailPreview.eligible.length} onClick={() => void sendBulkEmail()}>{bulkWorking ? 'Sending…' : `Send ${emailPreview.eligible.length} emails`}</button></footer>
        </>}
      </section></div> : null}

      {creditTarget ? <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget && !creditWorking) setCreditTarget(null) }}><form className={styles.creditModal} onSubmit={applyCredits}><header><div><span className={styles.eyebrow}>Privileged action</span><h2>{creditAction === 'refund' ? 'Refund credits' : 'Grant credits'}</h2></div><button type="button" onClick={() => setCreditTarget(null)}>×</button></header><label><span>User</span><select value={creditTarget.id} onChange={(event) => { const user = dashboard?.users.find((item) => item.id === event.target.value); if (user) setCreditTarget(user) }}>{dashboard?.users.map((user) => <option value={user.id} key={user.id}>{user.displayName || user.email} · {user.availableCredits} credits</option>)}</select></label><div className={styles.actionSwitch}><button type="button" data-active={creditAction === 'grant' || undefined} onClick={() => setCreditAction('grant')}>Grant</button><button type="button" data-active={creditAction === 'refund' || undefined} onClick={() => setCreditAction('refund')}>Refund failed work</button></div><label><span>Credits</span><input type="number" min="1" max="10000" step="1" value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} /></label><label><span>Reason <em>Required for audit</em></span><textarea rows={3} maxLength={240} value={creditReason} onChange={(event) => setCreditReason(event.target.value)} placeholder={creditAction === 'refund' ? 'Example: Refund for three failed video renders' : 'Example: Workshop participation credit'} /></label><div className={styles.balancePreview}><span><small>Current balance</small><b>{creditTarget.availableCredits}</b></span><i>→</i><span><small>Balance after</small><b>{creditTarget.availableCredits + Math.max(0, Number(creditAmount) || 0)}</b></span></div><p className={styles.auditNote}>This creates an immutable ledger entry and records you as the operator. It cannot silently overwrite an existing balance.</p><footer><button type="button" onClick={() => setCreditTarget(null)}>Cancel</button><button type="submit" disabled={creditWorking || !creditReason.trim() || !Number(creditAmount)}>{creditWorking ? 'Applying…' : `Confirm ${creditAction}`}</button></footer></form></div> : null}
    </main>
  )
}
