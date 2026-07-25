type Bucket = { count: number; resetAt: number }

const shared = globalThis as typeof globalThis & {
  __ai360RateBuckets?: Map<string, Bucket>
}

const buckets = shared.__ai360RateBuckets ?? new Map<string, Bucket>()
shared.__ai360RateBuckets = buckets

function requesterId(request: Request) {
  const forwarded = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]
  return (forwarded || 'local').trim().slice(0, 80)
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

export function rateLimit(
  request: Request,
  scope: 'chat' | 'agent' | 'studio' | 'voice' | 'export' | 'action',
  defaults: { minute: number; daily: number },
) {
  const requester = requesterId(request)
  const prefix = `AI360_RATE_${scope.toUpperCase()}`
  const minuteLimit = configuredLimit(`${prefix}_PER_MINUTE`, defaults.minute)
  const dailyLimit = configuredLimit(`${prefix}_PER_DAY`, defaults.daily)
  const minute = consume(`${scope}:minute:${requester}`, minuteLimit, 60_000)
  const daily = consume(`${scope}:day:${requester}`, dailyLimit, 86_400_000)
  const result = !minute.allowed ? minute : daily

  if (!result.allowed) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1_000))
    return Response.json(
      {
        error: scope === 'agent'
          ? 'You have reached the current Agent research limit. Please try again later.'
          : 'You have reached the current usage limit. Please try again later.',
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

export function rejectLargeRequest(request: Request, maxBytes: number) {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return Response.json({ error: 'Request is too large' }, { status: 413 })
  }
  return null
}
