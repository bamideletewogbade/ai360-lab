import 'server-only'

import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import { errorDetails, logEvent } from '@/lib/observability'
import {
  BUDGET_SINCE_ENV,
  decideSpend,
  parseBudgetSince,
  readSpendCaps,
  secondsUntilUtcMidnight,
  type SpendCaps,
  type SpendDecision,
  type SpendTotals,
} from '@/lib/billing/spend-cap-policy'

/**
 * The measured side of the spend circuit breaker.
 *
 * Totals come from `lab_cost_ledger`, the view that already unions the two
 * places a real charge can land. Deliberately not a counter table: see
 * `0027_spend_caps.sql` for why the truth is read rather than mirrored.
 *
 * This control lags by design. Cost is recorded when work finishes, so a burst
 * of simultaneous requests is measured only as each completes. That is
 * acceptable because it is the *second* control, not the first — every
 * authenticated request has already passed the credit gate, which reserves
 * atomically and fails closed. Credits bound each request; this bounds the
 * aggregate.
 */

/** Application-wide spend changes slowly and is the most expensive to read. */
const APPLICATION_CACHE_MS = 30_000

let applicationCache: { value: number; expiresAt: number } | null = null
let budgetCache: { value: number; expiresAt: number } | null = null

/** Test seam: drops the cached application and budget totals. */
export function resetSpendCapCache() {
  applicationCache = null
  budgetCache = null
}

export function budgetSince() {
  return parseBudgetSince(process.env[BUDGET_SINCE_ENV])
}

export function currentSpendCaps(): SpendCaps {
  return readSpendCaps(process.env)
}

function toUsd(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

async function readApplicationSpend(sql: ReturnType<typeof getPostgres>) {
  const now = Date.now()
  if (applicationCache && applicationCache.expiresAt > now) return applicationCache.value
  // The boundary is built as a timestamptz, not a naive timestamp. Comparing a
  // naive `date_trunc(... at time zone 'utc')` against a timestamptz column
  // makes Postgres cast it using the *session* time zone, which would silently
  // shift the day by the connection's offset. The trailing `at time zone 'utc'`
  // converts it back, so the window is a real UTC day on any connection — and
  // matches the "resets at midnight UTC" the product already promises.
  const [row] = await sql<{ cost_usd: string }[]>`
    select coalesce(sum(cost_usd), 0)::numeric as cost_usd
      from public.lab_cost_ledger
     where occurred_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`
  const value = toUsd(row?.cost_usd)
  applicationCache = { value, expiresAt: now + APPLICATION_CACHE_MS }
  return value
}

/**
 * Cumulative spend since the budget window opened. Cached like the
 * application total: a programme budget moves slowly, and being thirty seconds
 * behind cannot meaningfully overspend it.
 */
async function readBudgetSpend(sql: ReturnType<typeof getPostgres>, since: Date | null) {
  if (!since) return 0
  const now = Date.now()
  if (budgetCache && budgetCache.expiresAt > now) return budgetCache.value
  const [row] = await sql<{ cost_usd: string }[]>`
    select coalesce(sum(cost_usd), 0)::numeric as cost_usd
      from public.lab_cost_ledger
     where occurred_at >= ${since.toISOString()}::timestamptz`
  const value = toUsd(row?.cost_usd)
  budgetCache = { value, expiresAt: now + APPLICATION_CACHE_MS }
  return value
}

/**
 * Measured spend for each scope, in US dollars. Workspace, user and
 * application are today's; budget is cumulative since its start date.
 *
 * The workspace and user figures come from one round trip; the two broad
 * figures are cached briefly, because a thirty-second-stale number is entirely
 * adequate for a backstop.
 */
export async function readSpendTotals(input: {
  workspaceKey: string | null
  userId: string | null
}): Promise<SpendTotals> {
  const sql = getPostgres()
  const [application, budget, scoped] = await Promise.all([
    readApplicationSpend(sql),
    readBudgetSpend(sql, budgetSince()),
    sql<{ workspace_usd: string; user_usd: string }[]>`
      select
        coalesce((
          select sum(cost_usd) from public.lab_cost_ledger
           where workspace_key = ${input.workspaceKey}
             and occurred_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
        ), 0)::numeric as workspace_usd,
        coalesce((
          select sum(cost_usd) from public.lab_cost_ledger
           where owner_id = ${input.userId}
             and occurred_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
        ), 0)::numeric as user_usd`,
  ])
  return {
    budget,
    application,
    workspace: toUsd(scoped[0]?.workspace_usd),
    user: toUsd(scoped[0]?.user_usd),
  }
}

export type SpendCapCheck =
  | { allowed: true }
  | { allowed: false; decision: Extract<SpendDecision, { allowed: false }> }

/**
 * Whether today's spend leaves room for the work about to run.
 *
 * Fails **open** on a read error, and says so loudly. The credit gate
 * immediately after this one fails closed on the same database, so a Postgres
 * outage still stops authenticated paid work — letting a backstop take the
 * product down as well would trade a bounded cost risk for a total one.
 */
export async function checkSpendCaps(input: {
  workspaceKey: string | null
  userId: string | null
  projectedUsd: number
  requestId: string
  feature: string
}): Promise<SpendCapCheck> {
  const caps = currentSpendCaps()
  if (Object.values(caps).every((cap) => cap === null)) return { allowed: true }
  if (!isPostgresConfigured()) return { allowed: true }

  let spent: SpendTotals
  try {
    spent = await readSpendTotals({ workspaceKey: input.workspaceKey, userId: input.userId })
  } catch (error) {
    logEvent('error', 'spend_cap.read_failed', {
      requestId: input.requestId.slice(0, 64),
      feature: input.feature,
      ...errorDetails(error),
    })
    return { allowed: true }
  }

  const decision = decideSpend({ caps, spent, projectedUsd: input.projectedUsd })

  // A programme budget hits a wall rather than resetting overnight, so the
  // operator needs to see it coming while they can still act — top the
  // provider account up, or narrow who is still being invited.
  if (caps.budget !== null && spent.budget >= caps.budget * 0.8) {
    logEvent('warn', 'spend_cap.budget_nearly_spent', {
      spentUsd: Number(spent.budget.toFixed(4)),
      capUsd: caps.budget,
      remainingUsd: Number(Math.max(0, caps.budget - spent.budget).toFixed(4)),
      percentUsed: Math.round((spent.budget / caps.budget) * 100),
    })
  }

  if (decision.allowed) return { allowed: true }

  logEvent('warn', 'spend_cap.exceeded', {
    requestId: input.requestId.slice(0, 64),
    feature: input.feature,
    scope: decision.scope,
    spentUsd: Number(decision.spentUsd.toFixed(4)),
    capUsd: decision.capUsd,
    projectedUsd: Number(decision.projectedUsd.toFixed(4)),
    workspaceKey: decision.scope === 'application' || decision.scope === 'budget'
      ? null
      : input.workspaceKey,
  })
  return { allowed: false, decision }
}

/**
 * The refusal a capped request receives.
 *
 * A scope the person controls reads as "come back tomorrow" (429). The
 * application ceiling is AI360's own problem, so it reads as a service limit
 * (503) and never tells a customer what the platform spends.
 */
export function spendCapResponse(decision: Extract<SpendDecision, { allowed: false }>) {
  const retryAfter = String(secondsUntilUtcMidnight())
  if (decision.scope === 'budget') {
    // The programme has spent its allocation. Nothing the person did caused
    // this and nothing they do will clear it, so it never suggests retrying.
    return Response.json({
      error: 'This programme has reached its allocated capacity for AI work. Your account and credits are untouched — please contact the AI360 team.',
      status: 'programme_budget_reached',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  if (decision.scope === 'application') {
    return Response.json({
      error: 'AI360 has paused expensive work while we check capacity. Nothing was started and no credits were used. Please try again shortly.',
      status: 'service_spend_cap',
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '900' },
    })
  }
  return Response.json({
    error: 'You have reached the daily limit for heavy work on this account. Everyday chat still works, and the limit resets at midnight UTC. No credits were used.',
    status: 'daily_spend_cap',
    scope: decision.scope,
    resetsInSeconds: Number(retryAfter),
  }, {
    status: 429,
    headers: { 'Cache-Control': 'no-store', 'Retry-After': retryAfter },
  })
}
