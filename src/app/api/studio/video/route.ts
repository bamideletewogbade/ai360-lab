import { createHmac, timingSafeEqual } from 'node:crypto'
import { rateLimit, rejectLargeRequest, requireIdentifiedRequester, resolveRequester } from '@/lib/guardrails'
import { errorDetails, providerErrorDetails, requestLogger } from '@/lib/observability'
import { recordUsageEventSafe } from '@/lib/usage'
import { openCreditGate } from '@/lib/billing/credit-gate'
import { settleReservation } from '@/lib/billing/credit-repository'
import { estimateCredits, FEATURE_WEIGHTS, usdBudgetForCredits } from '@/lib/billing/credits'
import { defaultMediaIntent, mediaIntentSchema, type MediaIntent } from '@/lib/media/intent'
import { isVideoSelection, selectVideoModel, type VideoModelEntry } from '@/lib/media/video-catalogue'
import {
  createMediaJob,
  isMediaJobStoreConfigured,
  markMediaJobSubmitted,
  readMediaJob,
  updateMediaJobResult,
} from '@/lib/media/job-repository'
import { persistGeneratedMedia } from '@/lib/media/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type VideoRequest = {
  action?: 'quote' | 'submit' | 'status'
  token?: string
  jobId?: string
  projectId?: string
  intent?: unknown
  approved?: boolean
  acceptedCostUsd?: number
  /** Raw-prompt mode: render straight from what the person typed, with no brand brief. */
  prompt?: string
  businessName?: string
  brand?: { summary?: string; voice?: string; tagline?: string }
  campaign?: { name?: string; bigIdea?: string; callToAction?: string }
  location?: string
  asset?: { id?: string; title?: string; purpose?: string; content?: string }
}

function clean(value: unknown, max = 2_000) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : ''
}

function requestedIntent(body: VideoRequest): MediaIntent {
  const supplied = mediaIntentSchema.safeParse(body.intent)
  if (supplied.success && supplied.data.mediaType === 'video') return supplied.data
  return defaultMediaIntent({
    mediaType: 'video',
    purpose: clean(body.asset?.purpose) || clean(body.asset?.title) || 'Create an approved promotional video',
  })
}

async function currentQuote(intent: MediaIntent) {
  const response = await fetch('https://openrouter.ai/api/v1/videos/models', {
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Video model catalogue returned ${response.status}`)
  const body = await response.json() as {
    data?: VideoModelEntry[]
  }
  const format = {
    durationSeconds: intent.durationSeconds || 4,
    resolution: intent.resolution,
    aspectRatio: intent.aspectRatio,
    withAudio: intent.audio !== 'off',
  }
  const catalogue = body.data || []
  const selection = selectVideoModel({
    catalogue,
    tier: intent.qualityTier,
    budgetUsd: usdBudgetForCredits(FEATURE_WEIGHTS.video.ceiling),
    format,
  })
  if (!isVideoSelection(selection)) {
    throw new Error(selection.cheapestUsd === null
      ? 'No current video engine supports these choices.'
      : 'This video quality is above the current credit limit. Choose a shorter or lower-quality version.')
  }
  return { ...selection, format }
}

function tokenSecret() {
  return process.env.MEDIA_JOB_SIGNING_SECRET || process.env.OPENROUTER_API_KEY || ''
}

function providerKey() {
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

const PROMPT_MODE_EXECUTION = '\n\nExecution: one coherent moment with natural lighting and a strong first frame. No watermark, fake interface, visible third-party logos, trademarks or generated text. Leave clean visual space for editable captions to be added later.'

function promptFor(body: VideoRequest, intent: MediaIntent) {
  // Raw-prompt mode passes the person's own words through with the execution
  // guardrails only, so a prompt like "drone over Accra at sunset" stays theirs.
  const rawPrompt = clean(body.prompt, 5_000)
  if (rawPrompt) {
    return `${rawPrompt}${PROMPT_MODE_EXECUTION}${intent.audio === 'off' ? ' No audio.' : ` Use ${intent.audio} audio only.`}`
  }
  return `Create a polished ${intent.durationSeconds}-second ${intent.aspectRatio} promotional video for ${clean(body.businessName, 120)}.

Brand: ${clean(body.brand?.summary)}
Voice: ${clean(body.brand?.voice, 500)}
Tagline: ${clean(body.brand?.tagline, 240)}
Campaign: ${clean(body.campaign?.name, 240)}
Big idea: ${clean(body.campaign?.bigIdea, 800)}
Call to action: ${clean(body.campaign?.callToAction, 240)}
Asset purpose: ${clean(body.asset?.purpose, 500)}
Market and location: ${clean(body.location, 240) || 'Use only the supplied business context and references'}
Approved scene plan:
${clean(body.asset?.content, 5_000)}

Execution: one coherent moment with ${intent.motion} camera movement, natural lighting and a strong first frame. Ground every person, product and location in the supplied business context instead of using generic regional stereotypes. ${intent.audio === 'off' ? 'No audio.' : `Use ${intent.audio} audio only.`} No watermark, fake interface, visible third-party logos, trademarks or generated text. Leave clean visual space for editable captions to be added later. ${intent.constraints.join(' ')}`
}

function providerStatus(status?: string) {
  return status === 'completed' ? 'completed' as const
    : status === 'failed' ? 'failed' as const
      : status === 'in_progress' || status === 'processing' ? 'running' as const
        : 'submitted' as const
}

async function fetchProviderVideo(id: string) {
  const response = await fetch(`https://openrouter.ai/api/v1/videos/${encodeURIComponent(id)}/content?index=0`, {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ''}` },
    signal: AbortSignal.timeout(120_000),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Video download returned ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  return { bytes, mimeType: response.headers.get('content-type')?.split(';')[0] || 'video/mp4' }
}

async function providerHeaders() {
  return {
    Authorization: `Bearer ${providerKey()}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://ai360.africa',
    'X-Title': process.env.OPENROUTER_SITE_NAME || 'AI360',
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

  if (!providerKey() || !tokenSecret()) {
    log.finish(503, { outcome: 'not_configured' })
    return Response.json({ error: 'Studio video generation is not configured.', requestId: log.requestId }, {
      status: 503,
      headers: log.headers(),
    })
  }

  try {
    if (body.action === 'quote') {
      const intent = requestedIntent(body)
      const quote = await currentQuote(intent)
      await recordUsageEventSafe({
        requestId: log.requestId, route: '/api/studio/video', feature: 'video.quote',
        provider: 'openrouter', model: quote.model, estimatedCostUsd: quote.costUsd,
        latencyMs: Math.round(performance.now() - requestStartedAt), outcome: 'quote',
        metadata: { duration: quote.format.durationSeconds, resolution: quote.format.resolution, aspectRatio: quote.format.aspectRatio, tier: intent.qualityTier },
      })
      log.finish(200, { outcome: 'quote', model: quote.model, estimatedCostUsd: quote.costUsd })
      return Response.json({
        ...quote,
        duration: quote.format.durationSeconds,
        resolution: quote.format.resolution,
        aspectRatio: quote.format.aspectRatio,
        audio: quote.format.withAudio,
        tier: intent.qualityTier,
        credits: estimateCredits('video', { quotedUsd: quote.costUsd }).reserve,
        intent,
        requestId: log.requestId,
      }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
    }

    if (body.action === 'status') {
      const durableJob = requester.context && body.jobId && isMediaJobStoreConfigured()
        ? await readMediaJob(requester.context, clean(body.jobId, 96))
        : null
      const tokenJob = durableJob ? null : readJob(clean(body.token, 2_000))
      const id = durableJob?.providerJobId || tokenJob?.id
      const reservationId = durableJob?.reservationId || tokenJob?.reservationId
      if (!id) {
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
        provider: 'openrouter', model: durableJob?.model || undefined, actualCostUsd: result.usage?.cost,
        latencyMs: Math.round(performance.now() - requestStartedAt), outcome: result.status || 'status',
      })

      // The render finished in a later request than the one that reserved the
      // credits, so this is where a video is finally charged or refunded.
      const finished = result.status === 'completed' || result.status === 'failed'
      if (finished && reservationId && requester.context) {
        const settlement = await settleReservation({
          context: requester.context,
          reservationId,
          estimate: estimateCredits('video', { quotedUsd: durableJob?.quotedCostUsd ?? result.usage?.cost }),
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

      let durableAssetId = durableJob?.outputAssetId || null
      if (durableJob && requester.context) {
        const nextStatus = providerStatus(result.status)
        await updateMediaJobResult({
          context: requester.context,
          jobId: durableJob.id,
          status: nextStatus,
          actualCostUsd: result.usage?.cost,
          errorCode: nextStatus === 'failed' ? 'provider_failed' : null,
          errorMessage: clean(result.error, 500) || null,
        })
        if (nextStatus === 'completed' && !durableAssetId) {
          const file = await fetchProviderVideo(id)
          const stored = await persistGeneratedMedia({
            context: requester.context,
            jobId: durableJob.id,
            projectId: durableJob.projectId,
            bytes: file.bytes,
            mimeType: file.mimeType,
            metadata: {
              model: durableJob.model || 'unknown',
              duration: durableJob.intent.durationSeconds || 4,
              aspectRatio: durableJob.intent.aspectRatio,
              qualityTier: durableJob.intent.qualityTier,
            },
          })
          durableAssetId = stored.assetId
        }
      }

      log.info('studio.video.status', { status: result.status, costUsd: result.usage?.cost })
      log.finish(200, { outcome: 'status', status: result.status })
      return Response.json({
        status: result.status,
        error: clean(result.error, 500) || undefined,
        costUsd: result.usage?.cost,
        jobId: durableJob?.id,
        assetId: durableAssetId || undefined,
        downloadUrl: result.status === 'completed'
          ? durableAssetId
            ? `/api/studio/media?assetId=${encodeURIComponent(durableAssetId)}`
            : `/api/studio/video?token=${encodeURIComponent(body.token || '')}`
          : undefined,
        requestId: log.requestId,
      }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
    }

    if (body.action !== 'submit' || !body.approved) {
      log.finish(409, { outcome: 'approval_required' })
      return Response.json({
        error: 'Approve the video asset and accept the current price first.',
        requestId: log.requestId,
      }, { status: 409, headers: log.headers() })
    }
    // Raw-prompt mode needs only the person's words; the branded mode needs
    // the approved scene plan.
    const submitPrompt = clean(body.prompt, 5_000)
    if (!submitPrompt && (!clean(body.asset?.content) || !clean(body.businessName))) {
      log.finish(409, { outcome: 'approval_required' })
      return Response.json({
        error: 'Approve the video asset and accept the current price first.',
        requestId: log.requestId,
      }, { status: 409, headers: log.headers() })
    }

    const intent = requestedIntent(body)
    const quote = await currentQuote(intent)
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
    const durable = Boolean(requester.context && isMediaJobStoreConfigured())
    const jobId = `media_${crypto.randomUUID()}`
    if (durable && requester.context) {
      await createMediaJob({
        context: requester.context,
        id: jobId,
        projectId: clean(body.projectId, 64) || undefined,
        projectAssetId: clean(body.asset?.id, 64) || undefined,
        intent,
        idempotencyKey: `video:${request.headers.get('idempotency-key') || log.requestId}`,
        quotedCostUsd: quote.costUsd,
        reservationId: gate.reservationId,
      })
    }

    log.info('studio.video.started', {
      model: quote.model,
      duration: quote.format.durationSeconds,
      resolution: quote.format.resolution,
      aspectRatio: quote.format.aspectRatio,
      audio: quote.format.withAudio,
      tier: intent.qualityTier,
      acceptedCostUsd: quote.costUsd,
      creditsReserved: gate.reserved,
    })
    const response = await fetch('https://openrouter.ai/api/v1/videos', {
      method: 'POST',
      headers: await providerHeaders(),
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: quote.model,
        prompt: promptFor(body, intent),
        duration: quote.format.durationSeconds,
        resolution: quote.format.resolution,
        aspect_ratio: quote.format.aspectRatio,
        generate_audio: quote.format.withAudio,
      }),
    })
    if (!response.ok) {
      const failure = await providerErrorDetails(response)
      log.error('studio.video.failed', { model: quote.model, ...failure })
      await gate.settle('failure')
      if (durable && requester.context) {
        await updateMediaJobResult({ context: requester.context, jobId, status: 'failed', errorCode: 'provider_failed', errorMessage: 'The video provider could not start this job.' }).catch(() => undefined)
      }
      log.finish(502, { outcome: 'provider_error' })
      return Response.json({ error: 'The video provider could not start this job.', requestId: log.requestId }, {
        status: 502,
        headers: log.headers(),
      })
    }
    const result = await response.json() as { id?: string; status?: string }
    if (!result.id) {
      await gate.settle('failure')
      if (durable && requester.context) {
        await updateMediaJobResult({ context: requester.context, jobId, status: 'failed', errorCode: 'missing_provider_job', errorMessage: 'The provider returned no video job ID.' }).catch(() => undefined)
      }
      throw new Error('Provider returned no video job ID')
    }
    const token = signJob(result.id, gate.reservationId)
    if (durable && requester.context) {
      await markMediaJobSubmitted({
        context: requester.context,
        jobId,
        provider: 'openrouter',
        model: quote.model,
        providerJobId: result.id,
        status: providerStatus(result.status) === 'running' ? 'running' : 'submitted',
      })
    }
    await recordUsageEventSafe({
      requestId: log.requestId, route: '/api/studio/video', feature: 'video.submit',
      provider: 'openrouter', model: quote.model, estimatedCostUsd: quote.costUsd,
      latencyMs: Math.round(performance.now() - requestStartedAt), outcome: 'submitted',
      metadata: { duration: quote.format.durationSeconds, resolution: quote.format.resolution, aspectRatio: quote.format.aspectRatio, tier: intent.qualityTier },
    })
    log.info('studio.video.submitted', { model: quote.model, status: result.status })
    log.finish(202, { outcome: 'submitted', model: quote.model })
    return Response.json({
      token,
      jobId: durable ? jobId : undefined,
      status: result.status || 'pending',
      model: quote.model,
      estimatedCostUsd: quote.costUsd,
      requestId: log.requestId,
    }, { status: 202, headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    log.error('studio.video.failed', { ...errorDetails(error) })
    const configurationMessage = error instanceof Error && (
      error.message.startsWith('No current video engine')
      || error.message.startsWith('This video quality')
    ) ? error.message : null
    const status = configurationMessage ? 422 : 500
    log.finish(status, { outcome: configurationMessage ? 'unsupported_configuration' : 'exception' })
    return Response.json({ error: configurationMessage || 'Video generation failed.', requestId: log.requestId }, {
      status,
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
  if (!providerKey() || !tokenSecret()) {
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
      headers: { Authorization: `Bearer ${providerKey()}` },
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
