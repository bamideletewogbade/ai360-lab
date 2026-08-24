import 'server-only'

import { getPostgres } from '@/lib/postgres'
import {
  summarizeAdminCohort,
  type AdminCohortListItem,
  type AdminCohortReport,
  type AdminCohortUserMetrics,
  type AdminFeatureMetric,
} from '@/lib/admin/contracts'

const SUCCESSFUL_OUTCOMES = [
  'success', 'success_without_done_event', 'submitted', 'completed', 'quote', 'status',
]
const DELIVERED_OUTCOMES = ['success', 'success_without_done_event', 'completed']

type CohortRow = {
  cohort: string
  users: string | number
  credits_granted: string | number
  first_grant_at: Date | string
  latest_grant_at: Date | string
}

type UserRow = {
  user_id: string
  email: string | null
  display_name: string | null
  grant_at: Date | string
  credits_granted: string | number
  credits_spent: string | number
  account_balance: string | number | null
  active_days: string | number
  first_active_at: Date | string | null
  last_active_at: Date | string | null
  conversations: string | number
  messages: string | number
  user_messages: string | number
  projects: string | number
  agent_runs: string | number
  media_jobs: string | number
  images: string | number
  videos: string | number
  files: string | number
  requests: string | number
  delivered_requests: string | number
  successful_requests: string | number
  failed_requests: string | number
  provider_cost_usd: string | number | null
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

function iso(value: Date | string | null) {
  if (value === null) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function n(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}

export function normalizeAdminCohort(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(normalized)) {
    throw new Error('Cohort must use 2 to 80 lowercase letters, numbers, dots, dashes, or underscores.')
  }
  return normalized
}

export async function listAdminCohorts(): Promise<AdminCohortListItem[]> {
  const sql = getPostgres()
  const rows = await sql<CohortRow[]>`
    select source_id as cohort, count(distinct workspace_key)::int as users,
           coalesce(sum(credits_delta), 0)::int as credits_granted,
           min(created_at) as first_grant_at, max(created_at) as latest_grant_at
      from public.lab_credit_ledger
     where source_type = 'sponsored_seat' and entry_type = 'grant' and credits_delta > 0
     group by source_id
     order by max(created_at) desc, source_id desc`
  return rows.map((row) => ({
    cohort: row.cohort, users: n(row.users), creditsGranted: n(row.credits_granted),
    firstGrantAt: iso(row.first_grant_at)!, latestGrantAt: iso(row.latest_grant_at)!,
  }))
}

export async function readAdminCohortReport(cohort: string): Promise<AdminCohortReport> {
  const sql = getPostgres()
  const rows = await sql<UserRow[]>`
    with cohort_members as (
      select workspace_key, min(created_at) as grant_at, sum(credits_delta)::int as credits_granted
        from public.lab_credit_ledger
       where source_type = 'sponsored_seat' and source_id = ${cohort}
         and entry_type = 'grant' and credits_delta > 0
       group by workspace_key
    )
    select user_account.clerk_user_id as user_id, user_account.email, user_account.display_name,
           member.grant_at, member.credits_granted,
           coalesce(credit_use.credits_spent, 0)::int as credits_spent,
           coalesce(account.available_credits, 0)::int as account_balance,
           coalesce(activity.active_days, 0)::int as active_days,
           activity.first_active_at, activity.last_active_at,
           coalesce(conversation_use.conversations, 0)::int as conversations,
           coalesce(message_use.messages, 0)::int as messages,
           coalesce(message_use.user_messages, 0)::int as user_messages,
           coalesce(project_use.projects, 0)::int as projects,
           coalesce(agent_use.agent_runs, 0)::int as agent_runs,
           coalesce(media_use.media_jobs, 0)::int as media_jobs,
           coalesce(media_use.images, 0)::int as images,
           coalesce(media_use.videos, 0)::int as videos,
           coalesce(file_use.files, 0)::int as files,
           coalesce(request_use.requests, 0)::int as requests,
           coalesce(request_use.delivered_requests, 0)::int as delivered_requests,
           coalesce(request_use.successful_requests, 0)::int as successful_requests,
           coalesce(request_use.failed_requests, 0)::int as failed_requests,
           coalesce(cost_use.provider_cost_usd, 0)::numeric as provider_cost_usd
      from cohort_members member
      join public.lab_workspaces workspace on workspace.workspace_key = member.workspace_key
      left join public.lab_users user_account on user_account.clerk_user_id = case
        when workspace.workspace_type = 'user' then workspace.subject_id else workspace.created_by_user_id end
      left join public.lab_credit_accounts account on account.workspace_key = member.workspace_key
      left join lateral (
        select coalesce(sum(reservation.settled_credits), 0)::int as credits_spent
          from public.lab_credit_reservations reservation
         where reservation.workspace_key = member.workspace_key and reservation.status = 'settled'
           and reservation.created_at >= member.grant_at
      ) credit_use on true
      left join lateral (
        select count(*)::int as conversations from public.lab_conversations conversation
         where conversation.workspace_key = member.workspace_key and conversation.created_at >= member.grant_at
      ) conversation_use on true
      left join lateral (
        select count(*)::int as messages,
               count(*) filter (where message.role = 'user')::int as user_messages
          from public.lab_messages message
         where message.workspace_key = member.workspace_key and message.created_at >= member.grant_at
      ) message_use on true
      left join lateral (
        select count(*)::int as projects from public.lab_studio_projects project
         where project.workspace_key = member.workspace_key and project.created_at >= member.grant_at
      ) project_use on true
      left join lateral (
        select count(*)::int as agent_runs from public.lab_agent_runs agent_run
         where agent_run.workspace_key = member.workspace_key and agent_run.created_at >= member.grant_at
      ) agent_use on true
      left join lateral (
        select count(*)::int as media_jobs,
               count(*) filter (where media_job.media_type = 'image')::int as images,
               count(*) filter (where media_job.media_type = 'video')::int as videos
          from public.lab_media_jobs media_job
         where media_job.workspace_key = member.workspace_key and media_job.created_at >= member.grant_at
      ) media_use on true
      left join lateral (
        select count(*)::int as files from public.lab_assets asset
         where asset.workspace_key = member.workspace_key and asset.created_at >= member.grant_at
           and asset.status <> 'deleted'
      ) file_use on true
      left join lateral (
        select count(*)::int as requests,
               count(*) filter (where usage_event.outcome = any(${DELIVERED_OUTCOMES}))::int as delivered_requests,
               count(*) filter (where usage_event.outcome = any(${SUCCESSFUL_OUTCOMES}))::int as successful_requests,
               count(*) filter (where not (usage_event.outcome = any(${SUCCESSFUL_OUTCOMES})))::int as failed_requests
          from public.lab_usage_events usage_event
         where usage_event.workspace_key = member.workspace_key and usage_event.created_at >= member.grant_at
      ) request_use on true
      left join lateral (
        select coalesce(sum(cost.cost_usd), 0)::numeric as provider_cost_usd
          from public.lab_cost_ledger cost
         where cost.workspace_key = member.workspace_key and cost.occurred_at >= member.grant_at
      ) cost_use on true
      left join lateral (
        select count(distinct event.occurred_at::date)::int as active_days,
               min(event.occurred_at) as first_active_at, max(event.occurred_at) as last_active_at
          from (
            select created_at as occurred_at from public.lab_usage_events
             where workspace_key = member.workspace_key and created_at >= member.grant_at
            union all select created_at from public.lab_conversations
             where workspace_key = member.workspace_key and created_at >= member.grant_at
            union all select created_at from public.lab_studio_projects
             where workspace_key = member.workspace_key and created_at >= member.grant_at
            union all select created_at from public.lab_media_jobs
             where workspace_key = member.workspace_key and created_at >= member.grant_at
          ) event
      ) activity on true
     order by activity.last_active_at desc nulls last, lower(user_account.email) asc`

  const users: AdminCohortUserMetrics[] = rows.map((row) => ({
    userId: row.user_id, email: row.email || 'Account email unavailable', displayName: row.display_name,
    grantAt: iso(row.grant_at)!, creditsGranted: n(row.credits_granted), creditsSpent: n(row.credits_spent),
    accountBalance: n(row.account_balance), activeDays: n(row.active_days),
    firstActiveAt: iso(row.first_active_at), lastActiveAt: iso(row.last_active_at),
    conversations: n(row.conversations), messages: n(row.messages), userMessages: n(row.user_messages),
    projects: n(row.projects), agentRuns: n(row.agent_runs), mediaJobs: n(row.media_jobs),
    images: n(row.images), videos: n(row.videos), files: n(row.files), requests: n(row.requests),
    deliveredRequests: n(row.delivered_requests), successfulRequests: n(row.successful_requests),
    failedRequests: n(row.failed_requests), providerCostUsd: n(row.provider_cost_usd),
  }))

  const featureRows = await sql<FeatureRow[]>`
    with cohort_members as (
      select workspace_key, min(created_at) as grant_at from public.lab_credit_ledger
       where source_type = 'sponsored_seat' and source_id = ${cohort}
         and entry_type = 'grant' and credits_delta > 0 group by workspace_key
    ), requests as (
      select usage_event.feature, count(*)::int as requests,
             count(*) filter (where usage_event.outcome = any(${SUCCESSFUL_OUTCOMES}))::int as successful_requests,
             count(*) filter (where not (usage_event.outcome = any(${SUCCESSFUL_OUTCOMES})))::int as failed_requests,
             count(distinct usage_event.owner_id)::int as affected_users,
             coalesce(avg(usage_event.latency_ms), 0)::numeric as average_latency_ms
        from cohort_members member join public.lab_usage_events usage_event
          on usage_event.workspace_key = member.workspace_key and usage_event.created_at >= member.grant_at
       group by usage_event.feature
    ), costs as (
      select cost.feature, coalesce(sum(cost.cost_usd), 0)::numeric as provider_cost_usd
        from cohort_members member join public.lab_cost_ledger cost
          on cost.workspace_key = member.workspace_key and cost.occurred_at >= member.grant_at
       group by cost.feature
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

  const features: AdminFeatureMetric[] = featureRows.map((row) => ({
    feature: row.feature, requests: n(row.requests), successfulRequests: n(row.successful_requests),
    failedRequests: n(row.failed_requests), successRate: percentage(n(row.successful_requests), n(row.requests)),
    affectedUsers: n(row.affected_users), averageLatencyMs: Math.round(n(row.average_latency_ms)),
    providerCostUsd: n(row.provider_cost_usd),
  }))

  return {
    cohort, generatedAt: new Date().toISOString(),
    measurementNote: 'Counts begin at each user’s first cohort grant. Conversation and file contents are never selected.',
    summary: summarizeAdminCohort(users), features, users,
  }
}
