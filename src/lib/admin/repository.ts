import 'server-only'

import { getPostgres } from '@/lib/postgres'
import {
  adminBalanceHealth,
  adminRangeStart,
  adminUserStatus,
  type AdminAuditEvent,
  type AdminCreditLedgerEntry,
  type AdminDashboardPayload,
  type AdminErrorGroup,
  type AdminFeatureMetric,
  type AdminInsight,
  type AdminRange,
  type AdminSummary,
  type AdminUser,
  type AdminUserDetail,
} from '@/lib/admin/contracts'
import { listAdminCohorts } from '@/lib/admin/cohorts'
import { isMissingAdminAuditTable } from '@/lib/admin/audit'
import { buildAdminFinance } from '@/lib/admin/finance'

export const SUCCESSFUL_ADMIN_OUTCOMES = [
  'success', 'success_without_done_event', 'submitted', 'completed', 'quote', 'status',
]

type UserRow = {
  user_id: string
  workspace_key: string | null
  email: string | null
  display_name: string | null
  created_at: Date | string
  available_credits: string | number | null
  reserved_credits: string | number | null
  allowance_credits: string | number | null
  allowance_plan: string | null
  credits_spent: string | number | null
  requests: string | number | null
  successful_requests: string | number | null
  failed_requests: string | number | null
  provider_cost_usd: string | number | null
  active_days: string | number | null
  last_active_at: Date | string | null
  recent_error_at: Date | string | null
  quality_reports: string | number | null
  projects: string | number | null
  cohorts: string[] | null
  features: string[] | null
}

type FeatureRow = {
  feature: string
  requests: string | number
  successful_requests: string | number
  failed_requests: string | number
  affected_users: string | number
  average_latency_ms: string | number | null
  provider_cost_usd: string | number | null
}

type TechnicalErrorRow = {
  user_id: string | null
  email: string | null
  display_name: string | null
  feature: string
  route: string
  provider: string | null
  model: string | null
  code: string
  request_id: string | null
  occurrences: string | number
  first_seen_at: Date | string
  last_seen_at: Date | string
}

type QualityErrorRow = {
  id: string
  user_id: string | null
  email: string | null
  display_name: string | null
  feature: string
  category: string
  severity: AdminErrorGroup['severity']
  status: string
  request_id: string | null
  message: string | null
  created_at: Date | string
}

type LedgerRow = {
  id: string | number
  user_id: string | null
  email: string | null
  display_name: string | null
  entry_type: string
  credits_delta: string | number
  balance_after: string | number
  source_type: string
  source_id: string
  created_at: Date | string
}

type AuditRow = {
  id: string
  actor_id: string | null
  actor_email: string | null
  target_user_id: string | null
  target_email: string | null
  action: string
  credits_delta: string | number
  balance_before: string | number
  balance_after: string | number
  reason: string
  request_id: string
  created_at: Date | string
}

type FinanceMediaRow = {
  media_type: 'image' | 'video'
  settled_jobs: string | number
  charged_jobs: string | number
  charged_credits: string | number
  provider_charges: string | number
  provider_cost_usd: string | number
}

type FinancePaymentRow = {
  approved_payments: string | number
  cash_collected_ghs: string | number
}

type FinanceMediaLineRow = {
  id: string
  user_id: string | null
  email: string | null
  display_name: string | null
  media_type: 'image' | 'video'
  model: string | null
  status: string
  settled_credits: string | number | null
  provider_cost_usd: string | number | null
  occurred_at: Date | string
}

function n(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function iso(value: Date | string | null) {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}

function severityForOccurrences(occurrences: number): AdminErrorGroup['severity'] {
  if (occurrences >= 20) return 's1'
  if (occurrences >= 5) return 's2'
  return 's3'
}

export function buildAdminInsights(input: {
  summary: AdminSummary
  users: AdminUser[]
  features: AdminFeatureMetric[]
  errors: AdminErrorGroup[]
}): AdminInsight[] {
  const insights: AdminInsight[] = []
  const { summary, users, features, errors } = input
  const worstFeature = [...features]
    .filter((feature) => feature.requests >= 3)
    .sort((a, b) => a.successRate - b.successRate || b.requests - a.requests)[0]
  const repeatedUserErrors = users
    .filter((user) => user.failedRequests >= 3)
    .sort((a, b) => b.failedRequests - a.failedRequests)
  const topError = [...errors].sort((a, b) => b.occurrences - a.occurrences)[0]

  if (summary.staleReservations > 0) {
    insights.push({
      id: 'stale-reservations', tone: 'critical', title: 'Credits are stuck in expired holds',
      summary: `${summary.staleReservations} reservation${summary.staleReservations === 1 ? ' is' : 's are'} past the recovery deadline.`,
      evidence: `${summary.heldReservations} total reservations are currently held.`,
      suggestedAction: 'Open Credits, filter to reservations, and let the normal recovery path release the stale holds.',
    })
  }
  if (worstFeature && worstFeature.successRate < 85) {
    insights.push({
      id: `feature-${worstFeature.feature}`, tone: worstFeature.successRate < 70 ? 'critical' : 'watch',
      title: `${worstFeature.feature.replaceAll('_', ' ')} is the weakest workflow`,
      summary: `${worstFeature.successRate}% success across ${worstFeature.requests} requests.`,
      evidence: `${worstFeature.failedRequests} failures affected ${worstFeature.affectedUsers} users and cost $${worstFeature.providerCostUsd.toFixed(2)}.`,
      suggestedAction: `Filter Errors to ${worstFeature.feature} and inspect the dominant provider, model, and error code.`,
    })
  }
  if (repeatedUserErrors.length > 0) {
    insights.push({
      id: 'blocked-users', tone: 'watch', title: 'Some users are repeatedly hitting failures',
      summary: `${repeatedUserErrors.length} user${repeatedUserErrors.length === 1 ? ' has' : 's have'} three or more failed requests in this period.`,
      evidence: `${repeatedUserErrors[0].displayName || repeatedUserErrors[0].email} has ${repeatedUserErrors[0].failedRequests} failures.`,
      suggestedAction: 'Open the user timeline, confirm whether work was delivered, then consider a support follow-up or credit refund.',
    })
  }
  if (summary.lowBalanceUsers > 0) {
    insights.push({
      id: 'low-balances', tone: 'opportunity', title: 'Low balances may interrupt otherwise healthy users',
      summary: `${summary.lowBalanceUsers} account${summary.lowBalanceUsers === 1 ? ' is' : 's are'} at 10 credits or fewer.`,
      evidence: `${summary.activeUsers} users were active in the last seven days.`,
      suggestedAction: 'Filter Users by low balance and prioritize active accounts before granting any discretionary credits.',
    })
  }
  if (topError && topError.occurrences >= 3 && !insights.some((item) => item.id === `feature-${topError.feature}`)) {
    insights.push({
      id: `error-${topError.id}`, tone: 'watch', title: `${topError.code} is repeating`,
      summary: `${topError.occurrences} occurrences were grouped for ${topError.feature}.`,
      evidence: `Last seen ${new Date(topError.lastSeenAt).toLocaleString('en-GH')}.`,
      suggestedAction: 'Inspect the affected user and request ID, then open the matching Sentry issue for stack-level evidence.',
    })
  }
  if (!insights.length) {
    insights.push({
      id: 'healthy', tone: 'healthy', title: 'No urgent operational pattern stands out',
      summary: `Request success is ${summary.requestSuccessRate}% with no repeated failure cluster above the alert threshold.`,
      evidence: `${summary.requests} requests and ${summary.failedRequests} failures are in the selected period.`,
      suggestedAction: 'Keep watching activation, provider cost, and low-balance users as more activity arrives.',
    })
  }
  return insights.slice(0, 5)
}

export async function readAdminDashboardData(range: AdminRange): Promise<Omit<AdminDashboardPayload, 'capabilities'>> {
  const sql = getPostgres()
  const since = adminRangeStart(range)?.toISOString() ?? null

  const usersPromise = sql<UserRow[]>`
    with personal_workspaces as (
      select workspace_key, subject_id
        from public.lab_workspaces
       where workspace_type = 'user' and deleted_at is null
    ), usage_metrics as (
      select owner_id,
             count(*)::int as requests,
             count(*) filter (where outcome = any(${SUCCESSFUL_ADMIN_OUTCOMES}))::int as successful_requests,
             count(*) filter (where not (outcome = any(${SUCCESSFUL_ADMIN_OUTCOMES})))::int as failed_requests,
             max(created_at) filter (where not (outcome = any(${SUCCESSFUL_ADMIN_OUTCOMES}))) as recent_error_at,
             array_agg(distinct feature order by feature) as features
        from public.lab_usage_events
       where (${since}::timestamptz is null or created_at >= ${since})
       group by owner_id
    ), cost_metrics as (
      select owner_id, coalesce(sum(cost_usd), 0)::numeric as provider_cost_usd
        from public.lab_cost_ledger
       where (${since}::timestamptz is null or occurred_at >= ${since})
       group by owner_id
    ), credit_metrics as (
      select owner_id, coalesce(sum(settled_credits), 0)::int as credits_spent
        from public.lab_credit_reservations
       where status = 'settled' and (${since}::timestamptz is null or created_at >= ${since})
       group by owner_id
    ), activity as (
      select owner_id,
             count(distinct occurred_at::date) filter (where ${since}::timestamptz is null or occurred_at >= ${since})::int as active_days,
             max(occurred_at) as last_active_at
        from (
          select owner_id, created_at as occurred_at from public.lab_usage_events
          union all select owner_id, created_at from public.lab_conversations
          union all select owner_id, created_at from public.lab_studio_projects
          union all select owner_id, created_at from public.lab_media_jobs
        ) events
       group by owner_id
    ), quality_metrics as (
      select reporter_id, count(*)::int as quality_reports
        from public.lab_quality_reports
       where status <> 'closed' and (${since}::timestamptz is null or created_at >= ${since})
       group by reporter_id
    ), project_metrics as (
      select owner_id, count(*)::int as projects
        from public.lab_studio_projects
       where (${since}::timestamptz is null or created_at >= ${since})
       group by owner_id
    ), cohort_metrics as (
      select workspace_key, array_agg(distinct source_id order by source_id) as cohorts
        from public.lab_credit_ledger
       where source_type = 'sponsored_seat' and entry_type = 'grant' and credits_delta > 0
       group by workspace_key
    )
    select users.clerk_user_id as user_id, workspace.workspace_key, users.email, users.display_name,
           users.created_at, account.available_credits, account.reserved_credits,
           account.allowance_credits, account.allowance_plan, credit.credits_spent,
           usage.requests, usage.successful_requests, usage.failed_requests, usage.recent_error_at,
           costs.provider_cost_usd, activity.active_days, activity.last_active_at,
           quality.quality_reports, projects.projects, cohorts.cohorts, usage.features
      from public.lab_users users
      left join personal_workspaces workspace on workspace.subject_id = users.clerk_user_id
      left join public.lab_credit_accounts account on account.workspace_key = workspace.workspace_key
      left join usage_metrics usage on usage.owner_id = users.clerk_user_id
      left join cost_metrics costs on costs.owner_id = users.clerk_user_id
      left join credit_metrics credit on credit.owner_id = users.clerk_user_id
      left join activity on activity.owner_id = users.clerk_user_id
      left join quality_metrics quality on quality.reporter_id = users.clerk_user_id
      left join project_metrics projects on projects.owner_id = users.clerk_user_id
      left join cohort_metrics cohorts on cohorts.workspace_key = workspace.workspace_key
     where users.deleted_at is null
     order by activity.last_active_at desc nulls last, lower(users.email) asc
     limit 1000`

  const featuresPromise = sql<FeatureRow[]>`
    with requests as (
      select feature, count(*)::int as requests,
             count(*) filter (where outcome = any(${SUCCESSFUL_ADMIN_OUTCOMES}))::int as successful_requests,
             count(*) filter (where not (outcome = any(${SUCCESSFUL_ADMIN_OUTCOMES})))::int as failed_requests,
             count(distinct owner_id)::int as affected_users,
             coalesce(avg(latency_ms), 0)::numeric as average_latency_ms
        from public.lab_usage_events
       where (${since}::timestamptz is null or created_at >= ${since})
       group by feature
    ), costs as (
      select feature, coalesce(sum(cost_usd), 0)::numeric as provider_cost_usd
        from public.lab_cost_ledger
       where (${since}::timestamptz is null or occurred_at >= ${since})
       group by feature
    )
    select coalesce(requests.feature, costs.feature) as feature,
           coalesce(requests.requests, 0)::int as requests,
           coalesce(requests.successful_requests, 0)::int as successful_requests,
           coalesce(requests.failed_requests, 0)::int as failed_requests,
           coalesce(requests.affected_users, 0)::int as affected_users,
           coalesce(requests.average_latency_ms, 0)::numeric as average_latency_ms,
           coalesce(costs.provider_cost_usd, 0)::numeric as provider_cost_usd
      from requests full outer join costs on costs.feature = requests.feature
     order by requests desc nulls last, provider_cost_usd desc, feature asc`

  const technicalErrorsPromise = sql<TechnicalErrorRow[]>`
    select event.owner_id as user_id, users.email, users.display_name, event.feature, event.route,
           event.provider, event.model, coalesce(event.metadata->>'errorCode', event.outcome) as code,
           max(event.request_id) as request_id, count(*)::int as occurrences,
           min(event.created_at) as first_seen_at, max(event.created_at) as last_seen_at
      from public.lab_usage_events event
      left join public.lab_users users on users.clerk_user_id = event.owner_id
     where not (event.outcome = any(${SUCCESSFUL_ADMIN_OUTCOMES}))
       and (${since}::timestamptz is null or event.created_at >= ${since})
     group by event.owner_id, users.email, users.display_name, event.feature, event.route,
              event.provider, event.model, coalesce(event.metadata->>'errorCode', event.outcome)
     order by max(event.created_at) desc
     limit 400`

  const qualityErrorsPromise = sql<QualityErrorRow[]>`
    select report.id, report.reporter_id as user_id, users.email, users.display_name,
           report.source_surface as feature, report.category, report.severity, report.status,
           report.request_id, report.ai_summary as message, report.created_at
      from public.lab_quality_reports report
      left join public.lab_users users on users.clerk_user_id = report.reporter_id
     where (${since}::timestamptz is null or report.created_at >= ${since})
     order by report.created_at desc
     limit 250`

  const ledgerPromise = sql<LedgerRow[]>`
    select ledger.id, users.clerk_user_id as user_id, users.email, users.display_name,
           ledger.entry_type, ledger.credits_delta, ledger.balance_after, ledger.source_type,
           ledger.source_id, ledger.created_at
      from public.lab_credit_ledger ledger
      left join public.lab_workspaces workspace on workspace.workspace_key = ledger.workspace_key
      left join public.lab_users users on users.clerk_user_id = case
        when workspace.workspace_type = 'user' then workspace.subject_id else workspace.created_by_user_id end
     where (${since}::timestamptz is null or ledger.created_at >= ${since})
     order by ledger.created_at desc
     limit 400`

  const auditPromise = (async () => {
    try {
      const rows = await sql<AuditRow[]>`
        select audit.id, audit.actor_id, actor.email as actor_email,
               target.clerk_user_id as target_user_id, target.email as target_email,
               audit.action, audit.credits_delta, audit.balance_before, audit.balance_after,
               audit.reason, audit.request_id, audit.created_at
          from public.lab_admin_audit_events audit
          left join public.lab_users actor on actor.clerk_user_id = audit.actor_id
          left join public.lab_workspaces workspace on workspace.workspace_key = audit.target_workspace_key
          left join public.lab_users target on target.clerk_user_id = case
            when workspace.workspace_type = 'user' then workspace.subject_id else workspace.created_by_user_id end
         where (${since}::timestamptz is null or audit.created_at >= ${since})
         order by audit.created_at desc
         limit 250`
      return { rows, ready: true }
    } catch (error) {
      if (isMissingAdminAuditTable(error)) return { rows: [] as AuditRow[], ready: false }
      throw error
    }
  })()

  const reservationPromise = sql<{ held: string | number; stale: string | number }[]>`
    select count(*) filter (where status = 'held')::int as held,
           count(*) filter (where status = 'held' and expires_at < now())::int as stale
      from public.lab_credit_reservations`

  const mediaFinancePromise = sql<FinanceMediaRow[]>`
    with media_kinds(media_type) as (
      values ('image'::text), ('video'::text)
    ), reservation_totals as (
      select reservation.feature as media_type,
             count(*)::int as settled_jobs,
             count(*) filter (where coalesce(reservation.settled_credits, 0) > 0)::int as charged_jobs,
             coalesce(sum(reservation.settled_credits), 0)::int as charged_credits
        from public.lab_credit_reservations reservation
       where reservation.status = 'settled'
         and reservation.feature in ('image', 'video')
         and (${since}::timestamptz is null or coalesce(reservation.settled_at, reservation.updated_at) >= ${since})
       group by reservation.feature
    ), cost_totals as (
      select case when cost.feature = 'video' then 'video' else 'image' end as media_type,
             count(*)::int as provider_charges,
             coalesce(sum(cost.cost_usd), 0)::numeric as provider_cost_usd
        from public.lab_cost_ledger cost
       where (cost.feature = 'video' or cost.feature = 'image' or cost.feature like 'image.%')
         and (${since}::timestamptz is null or cost.occurred_at >= ${since})
       group by case when cost.feature = 'video' then 'video' else 'image' end
    )
    select kinds.media_type,
           coalesce(reservations.settled_jobs, 0)::int as settled_jobs,
           coalesce(reservations.charged_jobs, 0)::int as charged_jobs,
           coalesce(reservations.charged_credits, 0)::int as charged_credits,
           coalesce(costs.provider_charges, 0)::int as provider_charges,
           coalesce(costs.provider_cost_usd, 0)::numeric as provider_cost_usd
      from media_kinds kinds
      left join reservation_totals reservations on reservations.media_type = kinds.media_type
      left join cost_totals costs on costs.media_type = kinds.media_type
     order by kinds.media_type`

  const financePaymentPromise = sql<FinancePaymentRow[]>`
    select count(*)::int as approved_payments,
           coalesce(sum(amount_minor), 0)::numeric / 100 as cash_collected_ghs
      from public.lab_payment_attempts
     where status = 'approved' and currency = 'GHS'
       and (${since}::timestamptz is null or updated_at >= ${since})`

  const recentMediaFinancePromise = sql<FinanceMediaLineRow[]>`
    select job.id, job.owner_id as user_id, users.email, users.display_name,
           job.media_type, job.model, job.status, reservation.settled_credits,
           case when job.media_type = 'video' then job.actual_cost_usd
                else usage.actual_cost_usd end as provider_cost_usd,
           coalesce(reservation.settled_at, job.completed_at, job.updated_at) as occurred_at
      from public.lab_media_jobs job
      join public.lab_credit_reservations reservation on reservation.id = job.reservation_id
      left join public.lab_users users on users.clerk_user_id = job.owner_id
      left join public.lab_usage_events usage
        on job.media_type = 'image' and usage.request_id = reservation.request_id
       and usage.route = '/api/studio/image'
     where reservation.status = 'settled'
       and (${since}::timestamptz is null or coalesce(reservation.settled_at, job.completed_at, job.updated_at) >= ${since})
     order by coalesce(reservation.settled_at, job.completed_at, job.updated_at) desc
     limit 80`

  const [
    userRows, featureRows, technicalRows, qualityRows, ledgerRows, auditResult,
    reservationRows, mediaFinanceRows, financePaymentRows, recentMediaFinanceRows, cohorts,
  ] = await Promise.all([
    usersPromise, featuresPromise, technicalErrorsPromise, qualityErrorsPromise,
    ledgerPromise, auditPromise, reservationPromise, mediaFinancePromise,
    financePaymentPromise, recentMediaFinancePromise, listAdminCohorts(),
  ])

  const users: AdminUser[] = userRows.map((row) => {
    const availableCredits = n(row.available_credits)
    const lastActiveAt = iso(row.last_active_at)
    return {
      id: row.user_id,
      workspaceKey: row.workspace_key || `user:${row.user_id}`,
      email: row.email || 'Account email unavailable',
      displayName: row.display_name,
      createdAt: iso(row.created_at)!,
      status: adminUserStatus(lastActiveAt),
      balanceHealth: adminBalanceHealth(availableCredits),
      availableCredits,
      reservedCredits: n(row.reserved_credits),
      allowanceCredits: n(row.allowance_credits),
      plan: row.allowance_plan || 'explorer',
      creditsSpent: n(row.credits_spent),
      requests: n(row.requests),
      successfulRequests: n(row.successful_requests),
      failedRequests: n(row.failed_requests),
      providerCostUsd: n(row.provider_cost_usd),
      activeDays: n(row.active_days),
      lastActiveAt,
      recentErrorAt: iso(row.recent_error_at),
      qualityReports: n(row.quality_reports),
      projects: n(row.projects),
      cohorts: row.cohorts || [],
      features: row.features || [],
    }
  })

  const features: AdminFeatureMetric[] = featureRows.map((row) => ({
    feature: row.feature,
    requests: n(row.requests),
    successfulRequests: n(row.successful_requests),
    failedRequests: n(row.failed_requests),
    successRate: percentage(n(row.successful_requests), n(row.requests)),
    affectedUsers: n(row.affected_users),
    averageLatencyMs: Math.round(n(row.average_latency_ms)),
    providerCostUsd: n(row.provider_cost_usd),
  }))

  const technicalErrors: AdminErrorGroup[] = technicalRows.map((row, index) => {
    const occurrences = n(row.occurrences)
    return {
      id: `technical:${row.user_id || 'system'}:${row.feature}:${row.code}:${index}`,
      source: 'technical', userId: row.user_id, email: row.email, displayName: row.display_name,
      feature: row.feature, route: row.route, provider: row.provider, model: row.model, code: row.code,
      message: `${row.feature.replaceAll('_', ' ')} ended with ${row.code.replaceAll('_', ' ')}.`,
      severity: severityForOccurrences(occurrences), status: 'open', requestId: row.request_id,
      occurrences, firstSeenAt: iso(row.first_seen_at)!, lastSeenAt: iso(row.last_seen_at)!,
    }
  })
  const qualityErrors: AdminErrorGroup[] = qualityRows.map((row) => ({
    id: `quality:${row.id}`, source: 'customer', userId: row.user_id, email: row.email,
    displayName: row.display_name, feature: row.feature, route: null, provider: null, model: null,
    code: row.category, message: row.message || row.category.replaceAll('_', ' '), severity: row.severity,
    status: row.status, requestId: row.request_id, occurrences: 1,
    firstSeenAt: iso(row.created_at)!, lastSeenAt: iso(row.created_at)!,
  }))
  const errors = [...technicalErrors, ...qualityErrors]
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())

  const creditLedger: AdminCreditLedgerEntry[] = ledgerRows.map((row) => ({
    id: String(row.id), userId: row.user_id, email: row.email, displayName: row.display_name,
    entryType: row.entry_type, creditsDelta: n(row.credits_delta), balanceAfter: n(row.balance_after),
    sourceType: row.source_type, sourceId: row.source_id, createdAt: iso(row.created_at)!,
  }))
  const auditEvents: AdminAuditEvent[] = auditResult.rows.map((row) => ({
    id: row.id, actorId: row.actor_id, actorEmail: row.actor_email, targetUserId: row.target_user_id,
    targetEmail: row.target_email, action: row.action, creditsDelta: n(row.credits_delta),
    balanceBefore: n(row.balance_before), balanceAfter: n(row.balance_after), reason: row.reason,
    requestId: row.request_id, createdAt: iso(row.created_at)!,
  }))

  const summary = users.reduce<AdminSummary>((total, user) => ({
    ...total,
    activeUsers: total.activeUsers + (user.status === 'active' ? 1 : 0),
    atRiskUsers: total.atRiskUsers + (user.status === 'at_risk' ? 1 : 0),
    dormantUsers: total.dormantUsers + (user.status === 'dormant' ? 1 : 0),
    availableCredits: total.availableCredits + user.availableCredits,
    reservedCredits: total.reservedCredits + user.reservedCredits,
    creditsSpent: total.creditsSpent + user.creditsSpent,
    requests: total.requests + user.requests,
    successfulRequests: total.successfulRequests + user.successfulRequests,
    failedRequests: total.failedRequests + user.failedRequests,
    providerCostUsd: total.providerCostUsd + user.providerCostUsd,
    lowBalanceUsers: total.lowBalanceUsers + (user.balanceHealth !== 'healthy' ? 1 : 0),
    openQualityReports: total.openQualityReports + user.qualityReports,
  }), {
    users: users.length, activeUsers: 0, atRiskUsers: 0, dormantUsers: 0,
    availableCredits: 0, reservedCredits: 0, creditsSpent: 0, requests: 0,
    successfulRequests: 0, failedRequests: 0, requestSuccessRate: 0,
    providerCostUsd: 0, lowBalanceUsers: 0, openQualityReports: 0,
    heldReservations: n(reservationRows[0]?.held), staleReservations: n(reservationRows[0]?.stale),
  })
  summary.requestSuccessRate = percentage(summary.successfulRequests, summary.requests)
  summary.providerCostUsd = Number(summary.providerCostUsd.toFixed(6))
  const finance = buildAdminFinance({
    cashCollectedGhs: n(financePaymentRows[0]?.cash_collected_ghs),
    approvedPayments: n(financePaymentRows[0]?.approved_payments),
    chargedCredits: summary.creditsSpent,
    providerCostUsd: summary.providerCostUsd,
    media: mediaFinanceRows.map((row) => ({
      mediaType: row.media_type,
      settledJobs: n(row.settled_jobs),
      chargedJobs: n(row.charged_jobs),
      chargedCredits: n(row.charged_credits),
      providerCharges: n(row.provider_charges),
      providerCostUsd: n(row.provider_cost_usd),
    })),
    recentMedia: recentMediaFinanceRows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      mediaType: row.media_type,
      model: row.model,
      status: row.status,
      chargedCredits: n(row.settled_credits),
      providerCostUsd: n(row.provider_cost_usd),
      occurredAt: iso(row.occurred_at)!,
    })),
  })

  return {
    generatedAt: new Date().toISOString(), range,
    infrastructure: { auditTrailReady: auditResult.ready },
    summary, users, features, finance, errors,
    creditLedger, auditEvents, cohorts,
    insights: buildAdminInsights({ summary, users, features, errors }),
  }
}

export async function readAdminUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const dashboard = await readAdminDashboardData('all')
  const user = dashboard.users.find((item) => item.id === userId)
  if (!user) return null
  return {
    user,
    creditLedger: dashboard.creditLedger.filter((entry) => entry.userId === userId).slice(0, 100),
    errors: dashboard.errors.filter((entry) => entry.userId === userId).slice(0, 100),
    auditEvents: dashboard.auditEvents.filter((entry) => entry.targetUserId === userId).slice(0, 100),
  }
}
