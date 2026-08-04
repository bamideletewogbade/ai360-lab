import { rateLimit, rejectLargeRequest, requireIdentifiedRequester, resolveRequester } from '@/lib/guardrails'
import { errorDetails, providerErrorDetails, requestLogger } from '@/lib/observability'
import { recordUsageEventSafe } from '@/lib/usage'
import { openCreditGate } from '@/lib/billing/credit-gate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ImageRequest = {
  approved?: boolean
  kind?: 'logo' | 'social' | 'flyer'
  businessName?: string
  brand?: {
    summary?: string
    voice?: string
    colors?: Array<{ name?: string; hex?: string; role?: string }>
    tagline?: string
  }
  campaign?: {
    name?: string
    bigIdea?: string
    callToAction?: string
  }
  asset?: {
    title?: string
    purpose?: string
    content?: string
  }
}

function clean(value: unknown, max = 2_000) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : ''
}

function promptFor(body: ImageRequest) {
  const kind = body.kind === 'logo' ? 'logo concept' : body.kind === 'flyer' ? 'campaign flyer' : 'social media campaign graphic'
  const colors = body.brand?.colors
    ?.slice(0, 4)
    .map((color) => `${clean(color.name, 40)} ${clean(color.hex, 10)} for ${clean(color.role, 60)}`)
    .join(', ')

  return `Create one polished ${kind} for ${clean(body.businessName, 120)}.

Brand: ${clean(body.brand?.summary)}
Brand voice: ${clean(body.brand?.voice, 500)}
Brand colors: ${colors || 'use a coherent professional palette'}
Tagline: ${clean(body.brand?.tagline, 240)}
Campaign: ${clean(body.campaign?.name, 240)}
Big idea: ${clean(body.campaign?.bigIdea, 800)}
Call to action: ${clean(body.campaign?.callToAction, 240)}
Asset purpose: ${clean(body.asset?.purpose, 500)}
Approved creative direction:
${clean(body.asset?.content, 5_000)}

Art direction: modern, distinctive, premium but approachable, commercially usable, strong hierarchy, generous negative space, designed for a real small business in Africa. Avoid generic AI imagery, mockup frames, watermarks, visible third-party logos, trademarks and tiny illegible details. Never invent a price, phone number, URL, date or promotional claim. ${body.kind === 'logo' ? 'Show a single clean brand mark on a plain background. Keep typography minimal and spell the business name correctly.' : 'Treat this as clean base artwork for later typesetting. Include at most one short approved headline. Do not add body copy, prices, phone numbers or secondary call-to-action text.'}`
}

function imageModels() {
  const configured = (process.env.OPENROUTER_IMAGE_MODELS || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)
  const primary = process.env.OPENROUTER_IMAGE_MODEL || 'openai/gpt-image-1-mini'
  return [...new Set(configured.length
    ? configured
    : [primary, 'google/gemini-3.1-flash-lite-image'])].slice(0, 3)
}

function modelOptions(model: string, kind: ImageRequest['kind']) {
  const aspectRatio = kind === 'flyer' ? '2:3' : '1:1'
  if (model.startsWith('openai/')) {
    return {
      aspect_ratio: aspectRatio,
      quality: 'low',
      background: kind === 'logo' ? 'transparent' : 'opaque',
    }
  }
  if (model.startsWith('google/')) {
    return { resolution: '1K', aspect_ratio: aspectRatio }
  }
  return { aspect_ratio: aspectRatio }
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/studio/image')
  const tooLarge = rejectLargeRequest(request, 250_000)
  if (tooLarge) {
    log.finish(tooLarge.status, { outcome: 'request_too_large' })
    return new Response(tooLarge.body, { status: tooLarge.status, headers: log.headers(tooLarge.headers) })
  }
  const requester = await resolveRequester(request)
  const anonymous = requireIdentifiedRequester('studio_image', requester)
  if (anonymous) {
    log.finish(anonymous.status, { outcome: 'sign_in_required' })
    return new Response(anonymous.body, { status: anonymous.status, headers: log.headers(anonymous.headers) })
  }
  const limited = rateLimit(request, 'studio_image', { minute: 2, daily: 8 }, requester)
  if (limited) {
    log.finish(limited.status, { outcome: 'rate_limited' })
    return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  }

  let body: ImageRequest
  try {
    body = await request.json()
  } catch {
    log.finish(400, { outcome: 'invalid_json' })
    return Response.json({ error: 'Invalid image request', requestId: log.requestId }, {
      status: 400,
      headers: log.headers(),
    })
  }

  if (!body.approved) {
    log.finish(409, { outcome: 'approval_required' })
    return Response.json({
      error: 'Approve this asset and confirm image generation first.',
      requestId: log.requestId,
    }, { status: 409, headers: log.headers() })
  }
  if (!['logo', 'social', 'flyer'].includes(body.kind || '') || !clean(body.businessName) || !clean(body.asset?.content)) {
    log.finish(400, { outcome: 'incomplete_request' })
    return Response.json({ error: 'The approved asset is incomplete.', requestId: log.requestId }, {
      status: 400,
      headers: log.headers(),
    })
  }

  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    log.finish(503, { outcome: 'not_configured' })
    return Response.json({ error: 'Studio image generation is not configured.', requestId: log.requestId }, {
      status: 503,
      headers: log.headers(),
    })
  }

  const credit = await openCreditGate({
    request, requester, feature: 'image', requestId: log.requestId,
  })
  if (credit.denied) {
    log.finish(402, { outcome: 'insufficient_credits', kind: body.kind })
    return new Response(credit.denied.body, { status: 402, headers: log.headers(credit.denied.headers) })
  }
  const gate = credit.gate

  const models = imageModels()
  const startedAt = performance.now()
  log.info('studio.image.started', { models, kind: body.kind, approved: true, creditsReserved: gate.reserved })

  for (const [attempt, model] of models.entries()) {
    const providerStartedAt = performance.now()
    try {
      log.info('studio.image.provider_started', { model, attempt: attempt + 1, kind: body.kind })
      const response = await fetch('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        signal: AbortSignal.timeout(120_000),
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://lab.aithreesixty.tech',
          'X-Title': process.env.OPENROUTER_SITE_NAME || 'AI 360 Lab',
        },
        body: JSON.stringify({
          model,
          prompt: promptFor(body),
          n: 1,
          ...modelOptions(model, body.kind),
        }),
      })
      if (!response.ok) {
        const failure = await providerErrorDetails(response)
        log.warn('studio.image.provider_failed', {
          model,
          attempt: attempt + 1,
          kind: body.kind,
          durationMs: Math.round(performance.now() - providerStartedAt),
          ...failure,
        })
        continue
      }

      const result = await response.json() as {
        data?: Array<{ b64_json?: string; media_type?: string }>
        usage?: { cost?: number; total_tokens?: number }
      }
      const image = result.data?.[0]
      if (!image?.b64_json) {
        log.warn('studio.image.provider_failed', {
          model,
          attempt: attempt + 1,
          kind: body.kind,
          outcome: 'empty_image',
        })
        continue
      }
      const mediaType = image.media_type || 'image/png'
      const latencyMs = Math.round(performance.now() - startedAt)

      await recordUsageEventSafe({
        requestId: log.requestId, route: '/api/studio/image', feature: `image.${body.kind}`,
        provider: 'openrouter', model, outputTokens: result.usage?.total_tokens,
        actualCostUsd: result.usage?.cost, latencyMs, outcome: 'success',
        metadata: { kind: body.kind, attempt: attempt + 1, mediaType },
      })

      log.info('studio.image.completed', {
        model,
        attempt: attempt + 1,
        kind: body.kind,
        durationMs: latencyMs,
        mediaType,
        costUsd: result.usage?.cost,
        totalTokens: result.usage?.total_tokens,
      })
      await gate.settle('success', result.usage?.cost)
      log.finish(200, { outcome: 'success', model, attempt: attempt + 1, kind: body.kind, creditsReserved: gate.reserved })
      return Response.json({
        image: `data:${mediaType};base64,${image.b64_json}`,
        mediaType,
        costUsd: result.usage?.cost,
        model,
        requestId: log.requestId,
      }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
    } catch (error) {
      log.warn('studio.image.provider_failed', {
        model,
        attempt: attempt + 1,
        kind: body.kind,
        durationMs: Math.round(performance.now() - providerStartedAt),
        ...errorDetails(error),
      })
    }
  }

  log.error('studio.image.failed', {
    models,
    kind: body.kind,
    durationMs: Math.round(performance.now() - startedAt),
    outcome: 'all_providers_failed',
  })
  await recordUsageEventSafe({
    requestId: log.requestId, route: '/api/studio/image', feature: `image.${body.kind}`,
    provider: 'openrouter', model: models[0], latencyMs: Math.round(performance.now() - startedAt),
    outcome: 'all_providers_failed', metadata: { attemptedModels: models },
  })
  await gate.settle('failure')
  log.finish(502, { outcome: 'all_providers_failed', attemptedModels: models.length })
  return Response.json({
    error: 'Studio could not create this design after trying its backup image provider. Please try again shortly.',
    requestId: log.requestId,
  }, { status: 502, headers: log.headers({ 'Cache-Control': 'no-store' }) })
}
