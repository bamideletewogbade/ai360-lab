/**
 * The shape of the pre-activation funnel, decided without touching storage.
 *
 * Pure so the route, the client tracker, the admin report and the tests all
 * agree on what a step is called and what counts as a valid one. A funnel whose
 * step names drift between the writer and the reader silently reports zeroes.
 */

/** Steps recorded by this system, in the order a person passes through them. */
export const FUNNEL_STEPS = [
  'invite_clicked',
  'landing_viewed',
  'signup_started',
  'signup_completed',
  'workspace_entered',
] as const

export type FunnelStep = (typeof FUNNEL_STEPS)[number]

/**
 * Steps derived from data that already exists rather than recorded again.
 * `lab_usage_events` and friends are the source of truth for everything after
 * the workspace opens; see `0028_funnel_events.sql`.
 */
export const DERIVED_STEPS = ['first_prompt', 'first_outcome', 'first_export', 'returned'] as const

export type DerivedStep = (typeof DERIVED_STEPS)[number]

export type FunnelStage = FunnelStep | DerivedStep

export const FUNNEL_STAGES: FunnelStage[] = [...FUNNEL_STEPS, ...DERIVED_STEPS]

/** Plain-language labels, so every surface names a stage identically. */
export const FUNNEL_STAGE_LABELS: Record<FunnelStage, string> = {
  invite_clicked: 'Clicked the invitation',
  landing_viewed: 'Reached the site',
  signup_started: 'Started signing up',
  signup_completed: 'Created an account',
  workspace_entered: 'Opened the workspace',
  first_prompt: 'Asked for something',
  first_outcome: 'Received a result',
  first_export: 'Exported a deliverable',
  returned: 'Came back another day',
}

export type Surface = 'mobile' | 'tablet' | 'desktop'

export const SURFACES: Surface[] = ['mobile', 'tablet', 'desktop']

export function isFunnelStep(value: unknown): value is FunnelStep {
  return typeof value === 'string' && (FUNNEL_STEPS as readonly string[]).includes(value)
}

export function isSurface(value: unknown): value is Surface {
  return typeof value === 'string' && (SURFACES as string[]).includes(value)
}

/**
 * A visitor key is opaque and client-minted, so it is never trusted for
 * anything but grouping. The bounds exist to keep a forged value from becoming
 * a storage problem, not to prove who anybody is.
 */
const VISITOR_KEY = /^[A-Za-z0-9_-]{8,64}$/

export function isVisitorKey(value: unknown): value is string {
  return typeof value === 'string' && VISITOR_KEY.test(value)
}

/**
 * The query parameter that carries an invitation id on a landing URL.
 *
 * Lives here rather than in the client module so the server route that builds
 * invitation links and the browser that reads them cannot drift apart — a
 * mismatch would silently un-attribute every invited visit.
 */
export const FUNNEL_INVITATION_PARAM = 'i'

/** Invitation ids as `createAdminInvitations` mints them. */
const INVITATION_ID = /^invitation_[0-9a-f-]{36}$/

export function normalizeInvitationId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const candidate = value.trim().toLowerCase()
  return INVITATION_ID.test(candidate) ? candidate : null
}

/**
 * A referrer reduced to its host.
 *
 * A full referrer URL can carry a query string, and query strings carry other
 * people's personal data — a search term, a session token, an email address in
 * a redirect. The host answers "where did they come from" without any of that.
 */
export function referrerHost(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const host = new URL(value).hostname.toLowerCase()
    return host && host.length <= 120 ? host : null
  } catch {
    return null
  }
}

export type FunnelEventInput = {
  step: FunnelStep
  visitorKey: string
  invitationId: string | null
  surface: Surface | null
  referrerHost: string | null
}

export type FunnelEventRejection =
  | 'unknown_step'
  | 'invalid_visitor_key'

/** Validates a posted event. Unknown fields are dropped rather than rejected. */
export function parseFunnelEvent(input: unknown):
  | { ok: true; event: FunnelEventInput }
  | { ok: false; reason: FunnelEventRejection } {
  const body = (input ?? {}) as Record<string, unknown>
  if (!isFunnelStep(body.step)) return { ok: false, reason: 'unknown_step' }
  if (!isVisitorKey(body.visitorKey)) return { ok: false, reason: 'invalid_visitor_key' }
  return {
    ok: true,
    event: {
      step: body.step,
      visitorKey: body.visitorKey,
      invitationId: normalizeInvitationId(body.invitationId),
      surface: isSurface(body.surface) ? body.surface : null,
      referrerHost: referrerHost(body.referrer),
    },
  }
}

export type FunnelStageCount = {
  stage: FunnelStage
  label: string
  people: number
  /** Share of the widest stage, so the drop-off reads at a glance. */
  percentOfStart: number
  /** Share of the stage immediately before it — where the loss actually is. */
  percentOfPrevious: number
}

/**
 * Turns per-stage headcounts into a funnel.
 *
 * Counts are monotonic by construction: somebody who exported something
 * obviously reached the site, even if the landing event was lost to an ad
 * blocker or a closed tab. Carrying the running maximum backwards keeps the
 * funnel from showing a later stage as wider than an earlier one, which is the
 * classic way an instrumentation gap gets read as a data error.
 */
export function summarizeFunnel(counts: Partial<Record<FunnelStage, number>>): FunnelStageCount[] {
  const ordered = FUNNEL_STAGES.map((stage) => Math.max(0, Math.floor(counts[stage] ?? 0)))

  const monotonic = [...ordered]
  for (let index = monotonic.length - 2; index >= 0; index -= 1) {
    monotonic[index] = Math.max(monotonic[index], monotonic[index + 1])
  }

  const start = monotonic[0] || 0
  return FUNNEL_STAGES.map((stage, index) => {
    const people = monotonic[index]
    const previous = index === 0 ? people : monotonic[index - 1]
    return {
      stage,
      label: FUNNEL_STAGE_LABELS[stage],
      people,
      percentOfStart: start > 0 ? Math.round((people / start) * 100) : 0,
      percentOfPrevious: previous > 0 ? Math.round((people / previous) * 100) : 0,
    }
  })
}

/**
 * The stage that loses the most people, which is the one worth fixing first.
 * Ignores the first stage, which has nothing before it to fall from.
 */
export function biggestDropOff(stages: FunnelStageCount[]): FunnelStageCount | null {
  let worst: FunnelStageCount | null = null
  let worstLoss = 0
  for (let index = 1; index < stages.length; index += 1) {
    const loss = stages[index - 1].people - stages[index].people
    if (loss > worstLoss) {
      worstLoss = loss
      worst = stages[index]
    }
  }
  return worst
}

/** Minutes from first arrival to a delivered result: the pilot's headline number. */
export function timeToFirstValueMinutes(input: {
  arrivedAt: string | Date | null
  firstOutcomeAt: string | Date | null
}): number | null {
  if (!input.arrivedAt || !input.firstOutcomeAt) return null
  const from = new Date(input.arrivedAt).getTime()
  const to = new Date(input.firstOutcomeAt).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null
  return Math.round(((to - from) / 60_000) * 10) / 10
}
