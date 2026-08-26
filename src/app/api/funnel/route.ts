import { getOptionalAuthContext } from '@/lib/auth'
import { rateLimit, rejectLargeRequest, resolveRequester } from '@/lib/guardrails'
import { parseFunnelEvent } from '@/lib/funnel/contract'
import { recordFunnelStepSafe, attachIdentityToVisit } from '@/lib/funnel/repository'

export const dynamic = 'force-dynamic'

/**
 * Records one pre-activation funnel step.
 *
 * Public by necessity: the steps worth measuring happen before anybody has an
 * account. That makes the endpoint forgeable, and it is treated as such — a
 * caller may only name a step from a fixed list, identity is stamped from the
 * server session rather than read from the body, the two steps that assert an
 * account require a real session, and one visitor key can write each step
 * exactly once. The worst a forged call achieves is one junk row in a report
 * nobody bills from.
 *
 * It answers 204 whatever happens. A tracker that could see errors would be a
 * tracker somebody was tempted to retry, and analytics must never become a
 * reason a page misbehaves.
 */
const NO_CONTENT = new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  const oversized = rejectLargeRequest(request, 2_048)
  if (oversized) return NO_CONTENT

  // Do Not Track is honoured before anything is read, so an objecting browser
  // is never parsed, never stored and never identified.
  if (request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1') {
    return NO_CONTENT
  }

  const requester = await resolveRequester(request)
  const limited = rateLimit(request, 'feedback', { minute: 30, daily: 400 }, requester)
  if (limited) return NO_CONTENT

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NO_CONTENT
  }

  const parsed = parseFunnelEvent(body)
  if (!parsed.ok) return NO_CONTENT

  const context = await getOptionalAuthContext()

  // Two steps assert that an account exists, so the server checks rather than
  // believes. A browser may post them all it likes; without a real session
  // nothing is written, and the funnel cannot be inflated past the point where
  // it starts describing actual users.
  const claimsAccount = parsed.event.step === 'signup_completed'
    || parsed.event.step === 'workspace_entered'
  if (claimsAccount && !context) return NO_CONTENT

  await recordFunnelStepSafe({
    ...parsed.event,
    userId: context?.userId ?? null,
    workspaceKey: context?.workspace.key ?? null,
  })

  // Entering the workspace is the first step that can carry an identity, so it
  // is where the anonymous half of the visit gets a name.
  if (context && parsed.event.step === 'workspace_entered') {
    await attachIdentityToVisit({
      visitorKey: parsed.event.visitorKey,
      userId: context.userId,
      workspaceKey: context.workspace.key,
    }).catch(() => undefined)
  }

  return NO_CONTENT
}
