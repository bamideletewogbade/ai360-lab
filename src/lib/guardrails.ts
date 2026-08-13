import { getOptionalAuthContext, isAuthConfigured } from '@/lib/auth'
import type { WorkspaceAuthContext } from '@/lib/workspace'

type Bucket = { count: number; resetAt: number }

const shared = globalThis as typeof globalThis & {
  __ai360RateBuckets?: Map<string, Bucket>
}

const buckets = shared.__ai360RateBuckets ?? new Map<string, Bucket>()
shared.__ai360RateBuckets = buckets

function clientIp(request: Request) {
  const forwarded = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]
  return (forwarded || 'local').trim().slice(0, 80)
}

/**
 * Who a limit applies to.
 *
 * Signed-in people are limited per workspace. Anonymous requests fall back to
 * the network address, which is deliberately a weaker guarantee: shared campus,
 * office and cafe connections in Ghana put many genuine users behind one public
 * address, so IP limits must stay a backstop for abuse rather than the way real
 * capacity is granted.
 */
export type Requester = {
  key: string
  identified: boolean
  workspaceKey: string | null
  context: WorkspaceAuthContext | null
}

export async function resolveRequester(request: Request): Promise<Requester> {
  // An unavailable identity provider must not silently turn an authenticated
  // paid request into anonymous, unmetered work. A genuine signed-out session
  // still resolves cleanly to null and keeps the guest path available.
  const context = await getOptionalAuthContext()
  if (context) {
    return {
      key: `ws:${context.workspace.key}`,
      identified: true,
      workspaceKey: context.workspace.key,
      context,
    }
  }
  return { key: `ip:${clientIp(request)}`, identified: false, workspaceKey: null, context: null }
}

function consume(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, resetAt: now + windowMs }
  }
  if (current.count >= limit) return { allowed: false, resetAt: current.resetAt }
  current.count += 1
  return { allowed: true, resetAt: current.resetAt }
}

function configuredLimit(key: string, fallback: number) {
  const value = Number(process.env[key])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

export type RateScope =
  | 'chat' | 'agent' | 'studio' | 'studio_image' | 'studio_video'
  | 'studio_video_quote' | 'studio_video_status' | 'voice' | 'export' | 'action' | 'feedback'
  | 'billing_checkout' | 'payment_callback' | 'browser'

/**
 * Scopes that spend enough per request that an anonymous caller should not be
 * able to reach them once identity is available to check.
 */
export const EXPENSIVE_SCOPES: ReadonlySet<RateScope> = new Set<RateScope>([
  'agent', 'studio', 'studio_image', 'studio_video',
])

/** Anonymous callers keep a deliberately small share of any scope's allowance. */
const ANONYMOUS_SHARE = 0.5

export function rateLimit(
  request: Request,
  scope: RateScope,
  defaults: { minute: number; daily: number },
  requester?: Requester,
) {
  const subject = requester
    ?? { key: `ip:${clientIp(request)}`, identified: false, workspaceKey: null, context: null }
  const prefix = `AI360_RATE_${scope.toUpperCase()}`
  const scale = subject.identified ? 1 : ANONYMOUS_SHARE
  const minuteLimit = Math.max(1, Math.floor(configuredLimit(`${prefix}_PER_MINUTE`, defaults.minute) * scale))
  const dailyLimit = Math.max(1, Math.floor(configuredLimit(`${prefix}_PER_DAY`, defaults.daily) * scale))
  const minute = consume(`${scope}:minute:${subject.key}`, minuteLimit, 60_000)
  const daily = consume(`${scope}:day:${subject.key}`, dailyLimit, 86_400_000)
  const result = !minute.allowed ? minute : daily

  if (!result.allowed) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1_000))
    return Response.json(
      {
        error: scope === 'agent'
          ? 'You have reached the current Agent research limit. Please try again later.'
          : 'You have reached the current usage limit. Please try again later.',
        ...(subject.identified ? {} : { hint: 'Signing in gives you your own allowance instead of one shared with your network.' }),
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Remaining': '0',
          'Cache-Control': 'no-store',
        },
      },
    )
  }
  return null
}

/**
 * Expensive work must belong to someone.
 *
 * Returns null when the request may proceed. When identity is not configured at
 * all AI360 stays open, so the product still runs and demos without Clerk.
 */
export function requireIdentifiedRequester(scope: RateScope, requester: Requester) {
  if (!EXPENSIVE_SCOPES.has(scope)) return null
  if (!isAuthConfigured()) return null
  if (requester.identified) return null
  return Response.json(
    {
      error: 'Sign in to use this. It keeps your work saved and gives you your own allowance.',
      status: 'sign_in_required',
    },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  )
}

export function rejectLargeRequest(request: Request, maxBytes: number) {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return Response.json({ error: 'Request is too large' }, { status: 413 })
  }
  return null
}
