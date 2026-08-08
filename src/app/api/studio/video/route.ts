import { createHmac, timingSafeEqual } from 'node:crypto'
import { rateLimit, rejectLargeRequest, requireIdentifiedRequester, resolveRequester } from '@/lib/guardrails'
import { errorDetails, providerErrorDetails, requestLogger } from '@/lib/observability'
import { recordUsageEventSafe } from '@/lib/usage'
import { openCreditGate } from '@/lib/billing/credit-gate'
import { settleReservation } from '@/lib/billing/credit-repository'
import { estimateCredits } from '@/lib/billing/credits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DURATION = 4
const RESOLUTION = '720p'
const ASPECT_RATIO = '9:16'

type VideoRequest = {
  action?: 'quote' | 'submit' | 'status'
  token?: string
  approved?: boolean
  acceptedCostUsd?: number
  businessName?: string
  brand?: { summary?: string; voice?: string; tagline?: string }
  campaign?: { name?: string; bigIdea?: string; callToAction?: string }
  asset?: { title?: string; purpose?: string; content?: string }
}

function clean(value: unknown, max = 2_000) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : ''
}

function videoModel() {
  return process.env.OPENROUTER_VIDEO_MODEL || 'google/veo-3.1-lite'
}

async function currentQuote() {
  const model = videoModel()
  const response = await fetch('https://openrouter.ai/api/v1/videos/models', {
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Video model catalogue returned ${response.status}`)
  const body = await response.json() as {
    data?: Array<{
      id?: string
      pricing_skus?: Record<string, string>
      supported_durations?: number[]
      supported_resolutions?: string[]
      supported_aspect_ratios?: string[]
    }>
  }
  const entry = body.data?.find((item) => item.id === model)
  if (!entry) throw new Error('Configured video model is unavailable')
  if (!entry.supported_durations?.includes(DURATION) || !entry.supported_resolutions?.includes(RESOLUTION) || !entry.supported_aspect_ratios?.includes(ASPECT_RATIO)) {
    throw new Error('Configured video model does not support the Studio format')
  }
  const perSecond = Number(
    entry.pricing_skus?.duration_seconds_without_audio_720p
    || entry.pricing_skus?.duration_seconds_without_audio,
  )
  if (!Number.isFinite(perSecond) || perSecond <= 0) throw new Error('Video price is unavailable')
  return { model, costUsd: Number((perSecond * DURATION).toFixed(4)) }
}

function tokenSecret() {
  return process.env.OPENROUTER_API_KEY || ''
}

// The token carries the credit reservation as well as the job, because video
// work finishes long after the request that started it. Without this the hold
// could only be reclaimed by expiry, so a failed render would still cost money
// until the sweeper ran.
function signJob(id: string, reservationId?: string | null) {
  const payload = Buffer.from(JSON.stringify({
    id,
    createdAt: Date.now(),
    ...(reservationId ? { res: reservationId } : {}),
  })).toString('base64url')
  const signature = createHmac('sha256', tokenSecret()).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function readJob(token: string) {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = createHmac('sha256', tokenSecret()).update(payload).digest()
  const supplied = Buffer.from(signature, 'base64url')
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      id?: unknown
      createdAt?: unknown
      res?: unknown
    }
    if (typeof parsed.id !== 'string' || typeof parsed.createdAt !== 'number') return null
    if (Date.now() - parsed.createdAt > 24 * 60 * 60 * 1_000) return null
    return { id: parsed.id, reservationId: typeof parsed.res === 'string' ? parsed.res : null }
  } catch {
    return null
  }
}

function promptFor(body: VideoRequest) {
  return `Create a polished four-second vertical promotional video for ${clean(body.businessName, 120)}.

Brand: ${clean(body.brand?.summary)}
Voice: ${clean(body.brand?.voice, 500)}
Tagline: ${clean(body.brand?.tagline, 240)}
Campaign: ${clean(body.campaign?.name, 240)}
Big idea: ${clean(body.campaign?.bigIdea, 800)}
Call to action: ${clean(body.campaign?.callToAction, 240)}
Asset purpose: ${clean(body.asset?.purpose, 500)}
Approved scene plan:
${clean(body.asset?.content, 5_000)}

Execution: one coherent cinematic moment with intentional camera movement, natural lighting and a strong first frame. Premium but authentic African small-business advertising. No audio, no watermark, no fake interface, no visible third-party logos or trademarks, no text, no distorted hands or faces. Leave clean visual space for captions to be added later.`
}

async function providerHeaders() {
  return {
    Authorization: `Bearer ${tokenSecret()}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://lab.aithreesixty.tech',
    'X-Title': process.env.OPENROUTER_SITE_NAME || 'AI 360 Lab',
  }
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/studio/video')
  const requestStartedAt = performance.now()
  const tooLarge = rejectLargeRequest(request, 250_000)
  if (tooLarge) {
    log.finish(tooLarge.status, { outcome: 'request_too_large' })
    return new Response(tooLarge.body, { status: tooLarge.status, headers: log.headers(tooLarge.headers) })
  }
  let body: VideoRequest
  try {
    body = await request.json()
  } catch {
    log.finish(400, { outcome: 'invalid_json' })
    return Response.json({ error: 'Invalid video request', requestId: log.requestId }, {
      status: 400,
      headers: log.headers(),
    })
  }

  const rateScope = body.action === 'quote'
    ? 'studio_video_quote'
    : body.action === 'status'
      ? 'studio_video_status'
      : 'studio_video'
  const requester = await resolveRequester(request)
  const anonymous = requireIdentifiedRequester(rateScope, requester)
  if (anonymous) {
    log.finish(anonymous.status, { outcome: 'sign_in_required', action: body.action })
    return new Response(anonymous.body, { status: anonymous.status, headers: log.headers(anonymous.headers) })
  }
  const limited = rateLimit(
    request,
    rateScope,
    // Checking on a job is a cheap read, not a paid generation, and it has to
    // outlast the job it is watching. A clip takes about 80 seconds, so a limit
    // of 8 a minute froze the progress display a third of the way through.
    // Generation itself stays tightly limited, because that is what costs money.
    body.action === 'quote'
      ? { minute: 8, daily: 50 }
      : body.action === 'status'
        ? { minute: 40, daily: 600 }
        : { minute: 1, daily: 3 },
    requester,
  )
  if (limited) {
    log.finish(limited.status, { outcome: 'rate_limited', action: body.action })
    return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  }

  if (!tokenSecret()) {
    log.finish(503, { outcome: 'not_configured' })
    return Response.json({ error: 'Studio video generation is not configured.', requestId: log.requestId }, {
      status: 503,
      headers: log.headers(),
    })
  }

  try {
    if (body.action === 'quote') {
      const quote = await currentQuote()
      await recordUsageEventSafe({
        requestId: log.requestId, route: '/api/studio/video', feature: 'video.quote',
        provider: 'openrouter', model: quote.model, estimatedCostUsd: quote.costUsd,
        latencyMs: Math.round(performance.now() - requestStartedAt), outcome: 'quote',
        metadata: { duration: DURATION, resolution: RESOLUTION, aspectRatio: ASPECT_RATIO },
      })
      log.finish(200, { outcome: 'quote', model: quote.model, estimatedCostUsd: quote.costUsd })
      return Response.json({
        ...quote,
        duration: DURATION,
        resolution: RESOLUTION,
        aspectRatio: ASPECT_RATIO,
        audio: false,
        requestId: log.requestId,
      }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
    }

    if (body.action === 'status') {
      const job = readJob(clean(body.token, 2_000))
      const id = job?.id
      if (!job || !id) {
        log.finish(400, { outcome: 'invalid_job_token' })
        return Response.json({ error: 'This video job is invalid or expired.', requestId: log.requestId }, {
          status: 400,
          headers: log.headers(),
        })
      }
      const response = await fetch(`https://openrouter.ai/api/v1/videos/${encodeURIComponent(id)}`, {
        headers: await providerHeaders(),
        signal: AbortSignal.timeout(30_000),
        cache: 'no-store',
      })
      if (!response.ok) {
        const failure = await providerErrorDetails(response)
        log.warn('studio.video.status_failed', { ...failure })
        log.finish(502, { outcome: 'provider_error' })
        return Response.json({ error: 'Video status could not be checked.', requestId: log.requestId }, {
          status: 502,
          headers: log.headers(),
        })
      }
      const result = await response.json() as {
        status?: string
        error?: string
        usage?: { cost?: number }
      }
      await recordUsageEventSafe({
        requestId: log.requestId, route: '/api/studio/video', feature: 'video.status',
        provider: 'openrouter', model: videoModel(), actualCostUsd: result.usage?.cost,
        latencyMs: Math.round(performance.now() - requestStartedAt), outcome: result.status || 'status',
      })

      // The render finished in a later request than the one that reserved the
      // credits, so this is where a video is finally charged or refunded.
      const finished = result.status === 'completed' || result.status === 'failed'
      if (finished && job.reservationId && requester.context) {
        const settlement = await settleReservation({
          context: requester.context,
          reservationId: job.reservationId,
          estimate: estimateCredits('video', { quotedUsd: result.usage?.cost }),
          measuredUsd: result.usage?.cost,
          outcome: result.status === 'completed' ? 'success' : 'failure',
        })
        log.info('studio.video.settled', {
          status: result.status,
          settled: settlement.ok,
          charged: settlement.ok ? settlement.charged : undefined,
          released: settlement.ok ? settlement.released : undefined,
        })
      }

      log.info('studio.video.status', { status: result.status, costUsd: result.usage?.cost })
      log.finish(200, { outcome: 'status', status: result.status })
      return Response.json({
        status: result.status,
        error: clean(result.error, 500) || undefined,
        costUsd: result.usage?.cost,
        downloadUrl: result.status === 'completed'
          ? `/api/studio/video?token=${encodeURIComponent(body.token || '')}`
          : undefined,
        requestId: log.requestId,
      }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
    }

    if (body.action !== 'submit' || !body.approved || !clean(body.asset?.content) || !clean(body.businessName)) {
      log.finish(409, { outcome: 'approval_required' })
      return Response.json({
        error: 'Approve the video asset and accept the current price first.',
        requestId: log.requestId,
      }, { status: 409, headers: log.headers() })
    }

    const quote = await currentQuote()
    if (typeof body.acceptedCostUsd !== 'number' || Math.abs(body.acceptedCostUsd - quote.costUsd) > 0.0001) {
      log.finish(409, { outcome: 'quote_changed', estimatedCostUsd: quote.costUsd })
      return Response.json({
        error: 'The video price changed. Please review the new quote.',
        quote,
        requestId: log.requestId,
      }, { status: 409, headers: log.headers() })
    }

    // The accepted quote is a real provider price, so it decides the hold
    // rather than the published range.
    const credit = await openCreditGate({
      request, requester, feature: 'video', requestId: log.requestId, quotedUsd: quote.costUsd,
    })
    if (credit.denied) {
      log.finish(credit.denied.status, { outcome: 'credit_denied', estimatedCostUsd: quote.costUsd })
      return new Response(credit.denied.body, {
        status: credit.denied.status,
        headers: log.headers(credit.denied.headers),
      })
    }
    const gate = credit.gate

    log.info('studio.video.started', {
      model: quote.model,
      duration: DURATION,
      resolution: RESOLUTION,
      aspectRatio: ASPECT_RATIO,
      audio: false,
      acceptedCostUsd: quote.costUsd,
      creditsReserved: gate.reserved,
    })
    const response = await fetch('https://openrouter.ai/api/v1/videos', {
      method: 'POST',
      headers: await providerHeaders(),
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: quote.model,
        prompt: promptFor(body),
        duration: DURATION,
        resolution: RESOLUTION,
        aspect_ratio: ASPECT_RATIO,
        generate_audio: false,
      }),
    })
    if (!response.ok) {
      const failure = await providerErrorDetails(response)
      log.error('studio.video.failed', { model: quote.model, ...failure })
      await gate.settle('failure')
      log.finish(502, { outcome: 'provider_error' })
      return Response.json({ error: 'The video provider could not start this job.', requestId: log.requestId }, {
        status: 502,
        headers: log.headers(),
      })
    }
    const result = await response.json() as { id?: string; status?: string }
    if (!result.id) {
      await gate.settle('failure')
      throw new Error('Provider returned no video job ID')
    }
    const token = signJob(result.id, gate.reservationId)
    await recordUsageEventSafe({
      requestId: log.requestId, route: '/api/studio/video', feature: 'video.submit',
      provider: 'openrouter', model: quote.model, estimatedCostUsd: quote.costUsd,
      latencyMs: Math.round(performance.now() - requestStartedAt), outcome: 'submitted',
      metadata: { duration: DURATION, resolution: RESOLUTION, aspectRatio: ASPECT_RATIO },
    })
    log.info('studio.video.submitted', { model: quote.model, status: result.status })
    log.finish(202, { outcome: 'submitted', model: quote.model })
    return Response.json({
      token,
      status: result.status || 'pending',
      model: quote.model,
      estimatedCostUsd: quote.costUsd,
      requestId: log.requestId,
    }, { status: 202, headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('studio.video.failed', { ...errorDetails(error) })
    log.finish(500, { outcome: 'exception' })
    return Response.json({ error: 'Video generation failed.', requestId: log.requestId }, {
      status: 500,
      headers: log.headers(),
    })
  }
}

export async function GET(request: Request) {
  const log = requestLogger(request, '/api/studio/video')
  const limited = rateLimit(request, 'studio_video_status', { minute: 8, daily: 100 })
  if (limited) {
    log.finish(limited.status, { outcome: 'rate_limited', action: 'download' })
    return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  }
  const token = new URL(request.url).searchParams.get('token') || ''
  if (!tokenSecret()) {
    log.finish(503, { outcome: 'not_configured' })
    return Response.json({ error: 'Studio video generation is not configured.', requestId: log.requestId }, {
      status: 503,
      headers: log.headers(),
    })
  }
  const id = readJob(token)?.id
  if (!id) {
    log.finish(400, { outcome: 'invalid_job_token' })
    return Response.json({ error: 'This video download is invalid or expired.', requestId: log.requestId }, {
      status: 400,
      headers: log.headers(),
    })
  }
  try {
    const response = await fetch(`https://openrouter.ai/api/v1/videos/${encodeURIComponent(id)}/content?index=0`, {
      headers: { Authorization: `Bearer ${tokenSecret()}` },
      signal: AbortSignal.timeout(120_000),
      cache: 'no-store',
    })
    if (!response.ok || !response.body) {
      const failure = await providerErrorDetails(response)
      log.error('studio.video.download_failed', { ...failure })
      log.finish(502, { outcome: 'provider_error' })
      return Response.json({ error: 'The video file is not ready.', requestId: log.requestId }, {
        status: 502,
        headers: log.headers(),
      })
    }
    log.info('studio.video.downloaded', { contentType: response.headers.get('content-type') })
    log.finish(200, { outcome: 'success' })
    return new Response(response.body, {
      headers: log.headers({
        'Content-Type': response.headers.get('content-type') || 'video/mp4',
        'Content-Disposition': 'inline; filename="ai360-studio-promo.mp4"',
        'Cache-Control': 'private, max-age=300',
      }),
    })
  } catch (error) {
    log.error('studio.video.download_failed', { ...errorDetails(error) })
    log.finish(500, { outcome: 'exception' })
    return Response.json({ error: 'Video download failed.', requestId: log.requestId }, {
      status: 500,
      headers: log.headers(),
    })
  }
}
