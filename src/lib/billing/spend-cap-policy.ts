/**
 * Ceilings on real provider spend, decided without touching storage.
 *
 * Credits already bound what one person may consume, and they fail closed. What
 * credits cannot bound is the money AI360 actually pays a provider:
 *
 *   - Sponsored and free seats spend credits nobody paid for. A pilot cohort of
 *     thirty carries a real bill even though every participant is inside their
 *     allowance.
 *   - Credit weights are a model of cost, not cost itself. If a provider raises
 *     a price, or a weight is mis-set, every request stays legitimately inside
 *     its credit budget while the true spend runs away.
 *   - A retrying agent can be individually cheap and collectively ruinous.
 *
 * So these caps are denominated in measured US dollars from `lab_cost_ledger`,
 * not in credits. They are a circuit breaker sitting behind the credit gate,
 * not a second pricing system.
 */

export type SpendScope = 'budget' | 'application' | 'workspace' | 'user'

export const SPEND_SCOPES: SpendScope[] = ['budget', 'application', 'workspace', 'user']

/** Scopes measured over a UTC day. `budget` is cumulative and excluded. */
export const DAILY_SPEND_SCOPES = ['application', 'workspace', 'user'] as const

/**
 * Generous enough that ordinary pilot use never meets them, tight enough that a
 * loop is caught within minutes. For reference: Everyday's entire monthly model
 * budget is about US$2.07, and a four-second video is about US$0.14.
 *
 * `budget` has no default. A daily ceiling is a safety rail every deployment
 * should have, so absence takes a default there; a cumulative budget is a
 * decision about a specific programme and a specific pot of money, and
 * inventing one would be guessing at somebody's finances.
 */
export const DEFAULT_SPEND_CAPS_USD: Record<SpendScope, number | null> = {
  budget: null,
  application: 25,
  workspace: 5,
  user: 5,
}

export type SpendCaps = Record<SpendScope, number | null>

export type SpendTotals = Record<SpendScope, number>

/** The date the cumulative budget starts counting from, as `YYYY-MM-DD`. */
export const BUDGET_SINCE_ENV = 'AI360_SPEND_CAP_SINCE'

const ENV_NAMES: Record<SpendScope, string> = {
  budget: 'AI360_SPEND_CAP_TOTAL_USD',
  application: 'AI360_SPEND_CAP_DAILY_USD',
  workspace: 'AI360_SPEND_CAP_WORKSPACE_DAILY_USD',
  user: 'AI360_SPEND_CAP_USER_DAILY_USD',
}

/**
 * The budget window start, or null when no cumulative budget is being kept.
 *
 * A total cap without a start date would silently include every dollar ever
 * spent, so a programme budget would begin partly consumed by history it has
 * nothing to do with. Requiring the date makes the window explicit.
 */
export function parseBudgetSince(raw: string | undefined): Date | null {
  const value = (raw ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function spendCapEnvName(scope: SpendScope) {
  return ENV_NAMES[scope]
}

/**
 * Reads one cap. An unset value takes the default, because a deployment that
 * forgot to configure a ceiling should still have one. `off` disables the scope
 * deliberately, which is a decision somebody has to type.
 *
 * A malformed value falls back to the default rather than to "no limit": the
 * failure mode of a typo must not be an uncapped bill.
 */
export function parseSpendCap(raw: string | undefined, scope: SpendScope): number | null {
  const value = (raw ?? '').trim().toLowerCase()
  if (!value) return DEFAULT_SPEND_CAPS_USD[scope]
  if (value === 'off' || value === 'none' || value === 'disabled') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SPEND_CAPS_USD[scope]
  return parsed
}

export function readSpendCaps(env: Record<string, string | undefined>): SpendCaps {
  // A budget amount with no start date cannot be enforced honestly, so the
  // pair is treated as one setting: both present, or the scope is off.
  const budgetAmount = parseSpendCap(env[ENV_NAMES.budget], 'budget')
  const budgetSince = parseBudgetSince(env[BUDGET_SINCE_ENV])

  return {
    budget: budgetAmount !== null && budgetSince !== null ? budgetAmount : null,
    application: parseSpendCap(env[ENV_NAMES.application], 'application'),
    workspace: parseSpendCap(env[ENV_NAMES.workspace], 'workspace'),
    user: parseSpendCap(env[ENV_NAMES.user], 'user'),
  }
}

/** True when a budget amount was set but its start date was not, or vice versa. */
export function budgetConfigIncomplete(env: Record<string, string | undefined>) {
  const amount = (env[ENV_NAMES.budget] ?? '').trim()
  const since = (env[BUDGET_SINCE_ENV] ?? '').trim()
  const amountSet = Boolean(amount) && !['off', 'none', 'disabled'].includes(amount.toLowerCase())
  const sinceSet = parseBudgetSince(since) !== null
  if (amountSet && !sinceSet) return `${BUDGET_SINCE_ENV} is missing or not YYYY-MM-DD`
  if (!amountSet && Boolean(since)) return `${ENV_NAMES.budget} is not set`
  return null
}

export type SpendDecision =
  | { allowed: true }
  | { allowed: false; scope: SpendScope; spentUsd: number; capUsd: number; projectedUsd: number }

/**
 * Decides whether the work about to run may start.
 *
 * `projectedUsd` is the ceiling of the request being considered, so a cap is a
 * ceiling rather than a tripwire: work is refused before it crosses the line,
 * not after it already has. The narrowest scope is reported first, because
 * "you have spent your day's worth" is more useful to a person than "the
 * platform is busy".
 */
export function decideSpend(input: {
  caps: SpendCaps
  spent: SpendTotals
  projectedUsd: number
}): SpendDecision {
  const projected = Number.isFinite(input.projectedUsd) && input.projectedUsd > 0
    ? input.projectedUsd
    : 0

  for (const scope of ['user', 'workspace', 'application', 'budget'] as const) {
    const cap = input.caps[scope]
    if (cap === null) continue
    const spent = Number.isFinite(input.spent[scope]) ? Math.max(0, input.spent[scope]) : 0
    if (spent + projected > cap) {
      return { allowed: false, scope, spentUsd: spent, capUsd: cap, projectedUsd: projected }
    }
  }
  return { allowed: true }
}

/** Seconds until the UTC day rolls over, for a `Retry-After` header. */
export function secondsUntilUtcMidnight(now: Date = new Date()) {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000))
}
