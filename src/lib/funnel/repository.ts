import 'server-only'

import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import { errorDetails, logEvent } from '@/lib/observability'
import {
  summarizeFunnel,
  biggestDropOff,
  type FunnelEventInput,
  type FunnelStage,
  type FunnelStageCount,
  type FunnelStep,
} from '@/lib/funnel/contract'

/**
 * Durable side of the pre-activation funnel.
 *
 * Writes are deliberately forgiving: a lost funnel row is a small hole in a
 * report, while a funnel write that throws would break a landing page or an
 * auth callback. Nothing here may ever prevent somebody using the product.
 */

export async function recordFunnelStep(input: FunnelEventInput & {
  userId?: string | null
  workspaceKey?: string | null
}) {
  if (!isPostgresConfigured()) return { recorded: false as const, reason: 'database_not_configured' as const }
  const sql = getPostgres()

  // `do nothing` on conflict is the whole idempotency story: one row per
  // visitor per step, so a refresh or a double-fired effect cannot inflate the
  // funnel. The first arrival is the one that counts.
  await sql`
    insert into public.lab_funnel_events
      (visitor_key, step, invitation_id, user_id, workspace_key, surface, referrer_host)
    values (${input.visitorKey}, ${input.step}, ${input.invitationId},
            ${input.userId ?? null}, ${input.workspaceKey ?? null},
            ${input.surface}, ${input.referrerHost})
    on conflict (visitor_key, step) do nothing`
  return { recorded: true as const }
}

export async function recordFunnelStepSafe(input: FunnelEventInput & {
  userId?: string | null
  workspaceKey?: string | null
}) {
  try {
    return await recordFunnelStep(input)
  } catch (error) {
    logEvent('warn', 'funnel.record_failed', { step: input.step, ...errorDetails(error) })
    return { recorded: false as const, reason: 'write_failed' as const }
  }
}

/**
 * Attaches a signed-in identity to every earlier step of the same visit.
 *
 * The landing and sign-up rows were written before anybody knew who the person
 * was. Back-filling them at sign-in is what turns an anonymous drop-off curve
 * into a named one — which, for a cohort of sixty-three, means the operator can
 * phone the people who stalled instead of guessing why they did.
 *
 * Only rows that have no identity yet are touched, so one browser used by two
 * people cannot rewrite the first person's history.
 */
export async function attachIdentityToVisit(input: {
  visitorKey: string
  userId: string
  workspaceKey: string | null
}) {
  if (!isPostgresConfigured()) return { updated: 0 }
  const sql = getPostgres()
  const rows = await sql<{ id: string }[]>`
    update public.lab_funnel_events
       set user_id = ${input.userId},
           workspace_key = coalesce(${input.workspaceKey}, workspace_key)
     where visitor_key = ${input.visitorKey} and user_id is null
    returning id`
  return { updated: rows.length }
}

export type FunnelReport = {
  generatedAt: string
  since: string | null
  cohort: string | null
  stages: FunnelStageCount[]
  biggestDropOff: FunnelStageCount | null
  medianTimeToFirstValueMinutes: number | null
  /** Named people who reached a step and went no further. The follow-up list. */
  stalled: Array<{
    invitationId: string | null
    email: string | null
    displayName: string | null
    lastStep: FunnelStep
    surface: string | null
    occurredAt: string
  }>
  measurementNote: string
}

const STALLED_LIMIT = 100

/**
 * The funnel, joining what this table records to what already existed.
 *
 * Pre-activation counts come from `lab_funnel_events`; everything from the
 * first prompt onward is counted out of `lab_usage_events` and
 * `lab_credit_ledger`, which have been recording it all along. Reading rather
 * than duplicating keeps one number with one source.
 */
export async function readFunnelReport(input: {
  since?: string | null
  cohort?: string | null
} = {}): Promise<FunnelReport> {
  const sql = getPostgres()
  const since = input.since ?? null
  const cohort = input.cohort ?? null

  const [counts] = await sql<Array<Record<string, string | number>>>`
    with scoped_invitations as (
      select id from public.lab_admin_invitations
       where ${cohort}::text is null or cohort_key = ${cohort}
    ),
    -- A visit is in scope when it came through an in-scope invitation, or when
    -- no cohort filter was asked for at all.
    scoped_events as (
      select * from public.lab_funnel_events event
       where (${since}::timestamptz is null or event.occurred_at >= ${since})
         and (${cohort}::text is null
              or event.invitation_id in (select id from scoped_invitations))
    ),
    -- Workspaces belonging to people the funnel actually saw, so post-activation
    -- counts describe the same population as the pre-activation ones.
    scoped_workspaces as (
      select distinct workspace_key from scoped_events where workspace_key is not null
    )
    select
      (select count(distinct visitor_key) from scoped_events where step = 'invite_clicked')::int as invite_clicked,
      (select count(distinct visitor_key) from scoped_events where step = 'landing_viewed')::int as landing_viewed,
      (select count(distinct visitor_key) from scoped_events where step = 'signup_started')::int as signup_started,
      (select count(distinct visitor_key) from scoped_events where step = 'signup_completed')::int as signup_completed,
      (select count(distinct visitor_key) from scoped_events where step = 'workspace_entered')::int as workspace_entered,
      (select count(distinct usage.workspace_key)::int
         from public.lab_usage_events usage
        where usage.workspace_key in (select workspace_key from scoped_workspaces)) as first_prompt,
      (select count(distinct usage.workspace_key)::int
         from public.lab_usage_events usage
        where usage.workspace_key in (select workspace_key from scoped_workspaces)
          and usage.outcome in ('success', 'success_without_done_event', 'completed')) as first_outcome,
      (select count(distinct usage.workspace_key)::int
         from public.lab_usage_events usage
        where usage.workspace_key in (select workspace_key from scoped_workspaces)
          and usage.feature = 'export') as first_export,
      (select count(*)::int from (
          select usage.workspace_key
            from public.lab_usage_events usage
           where usage.workspace_key in (select workspace_key from scoped_workspaces)
           group by usage.workspace_key
          having count(distinct usage.created_at::date) > 1
       ) repeat_visitors) as returned`

  const stages = summarizeFunnel({
    invite_clicked: Number(counts?.invite_clicked ?? 0),
    landing_viewed: Number(counts?.landing_viewed ?? 0),
    signup_started: Number(counts?.signup_started ?? 0),
    signup_completed: Number(counts?.signup_completed ?? 0),
    workspace_entered: Number(counts?.workspace_entered ?? 0),
    first_prompt: Number(counts?.first_prompt ?? 0),
    first_outcome: Number(counts?.first_outcome ?? 0),
    first_export: Number(counts?.first_export ?? 0),
    returned: Number(counts?.returned ?? 0),
  } as Partial<Record<FunnelStage, number>>)

  // Median rather than mean: one person who left the tab open overnight would
  // drag an average into meaninglessness.
  const [ttfv] = await sql<{ minutes: string | null }[]>`
    with arrivals as (
      select visitor_key, workspace_key, min(occurred_at) as arrived_at
        from public.lab_funnel_events
       where workspace_key is not null
         and (${since}::timestamptz is null or occurred_at >= ${since})
       group by visitor_key, workspace_key
    )
    select percentile_cont(0.5) within group (
             order by extract(epoch from (outcome.first_at - arrivals.arrived_at)) / 60
           ) as minutes
      from arrivals
      join lateral (
        select min(usage.created_at) as first_at from public.lab_usage_events usage
         where usage.workspace_key = arrivals.workspace_key
           and usage.outcome in ('success', 'success_without_done_event', 'completed')
      ) outcome on outcome.first_at is not null
     where outcome.first_at >= arrivals.arrived_at`

  const stalledRows = await sql<Array<{
    invitation_id: string | null
    email: string | null
    display_name: string | null
    last_step: FunnelStep
    surface: string | null
    occurred_at: Date | string
  }>>`
    with furthest as (
      select distinct on (event.visitor_key)
             event.visitor_key, event.invitation_id, event.user_id, event.step as last_step,
             event.surface, event.occurred_at
        from public.lab_funnel_events event
       where (${since}::timestamptz is null or event.occurred_at >= ${since})
       order by event.visitor_key,
                array_position(
                  array['invite_clicked','landing_viewed','signup_started','signup_completed','workspace_entered'],
                  event.step
                ) desc,
                event.occurred_at desc
    )
    select furthest.invitation_id,
           coalesce(invitation.email, users.email) as email,
           coalesce(invitation.display_name, users.display_name) as display_name,
           furthest.last_step, furthest.surface, furthest.occurred_at
      from furthest
      left join public.lab_admin_invitations invitation on invitation.id = furthest.invitation_id
      left join public.lab_users users on users.clerk_user_id = furthest.user_id
     where furthest.last_step <> 'workspace_entered'
       and (${cohort}::text is null or invitation.cohort_key = ${cohort})
     order by furthest.occurred_at desc
     limit ${STALLED_LIMIT}`

  return {
    generatedAt: new Date().toISOString(),
    since,
    cohort,
    stages,
    biggestDropOff: biggestDropOff(stages),
    medianTimeToFirstValueMinutes: ttfv?.minutes === null || ttfv?.minutes === undefined
      ? null
      : Math.round(Number(ttfv.minutes) * 10) / 10,
    stalled: stalledRows.map((row) => ({
      invitationId: row.invitation_id,
      email: row.email,
      displayName: row.display_name,
      lastStep: row.last_step,
      surface: row.surface,
      occurredAt: row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : new Date(row.occurred_at).toISOString(),
    })),
    measurementNote:
      'Steps up to workspace entry are recorded; later stages are read from the usage ledger. '
      + 'Counts are people, not visits. No prompt or response content is ever selected.',
  }
}

/** Missing table degrades to an empty report rather than a 500. */
export function isMissingFunnelTable(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown; table_name?: unknown }
  if (candidate.code !== '42P01') return false
  return `${String(candidate.table_name || '')} ${String(candidate.message || '')}`
    .includes('lab_funnel_events')
}
