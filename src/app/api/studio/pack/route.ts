import { rateLimit, rejectLargeRequest, requireIdentifiedRequester, resolveRequester } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'
import { recordUsageEventSafe } from '@/lib/usage'
import { openCreditGate } from '@/lib/billing/credit-gate'
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from '@/lib/languages'
import { findPack, isPackId, packCredits } from '@/lib/studio/packs'
import { runPack, type Intake, type PackEvent } from '@/lib/studio/coordinator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function clean(value: unknown, max = 20_000) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : ''
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/studio/pack')
  const tooLarge = rejectLargeRequest(request, 2_000_000)
  if (tooLarge) {
    log.finish(tooLarge.status, { outcome: 'request_too_large' })
    return new Response(tooLarge.body, { status: tooLarge.status, headers: log.headers(tooLarge.headers) })
  }

  const requester = await resolveRequester(request)
  const anonymous = requireIdentifiedRequester('studio', requester)
  if (anonymous) {
    log.finish(anonymous.status, { outcome: 'sign_in_required' })
    return new Response(anonymous.body, { status: anonymous.status, headers: log.headers(anonymous.headers) })
  }
  const limited = rateLimit(request, 'studio', { minute: 5, daily: 24 }, requester)
  if (limited) {
    log.finish(limited.status, { outcome: 'rate_limited' })
    return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  }

  let body: { packId?: unknown; intake?: Intake; language?: unknown }
  try {
    body = await request.json()
  } catch {
    log.finish(400, { outcome: 'invalid_json' })
    return Response.json({ error: 'Invalid request', requestId: log.requestId }, { status: 400, headers: log.headers() })
  }

  if (!isPackId(body.packId)) {
    log.finish(400, { outcome: 'unknown_pack' })
    return Response.json({ error: 'Choose one of the available packs.', requestId: log.requestId }, {
      status: 400,
      headers: log.headers(),
    })
  }
  const pack = findPack(body.packId)!

  const intake: Intake = {
    businessName: clean(body.intake?.businessName, 255),
    industry: clean(body.intake?.industry, 255),
    offer: clean(body.intake?.offer),
    audience: clean(body.intake?.audience),
    goal: clean(body.intake?.goal, 500),
    location: clean(body.intake?.location, 255),
    channels: Array.isArray(body.intake?.channels)
      ? body.intake.channels.filter((entry): entry is string => typeof entry === 'string').slice(0, 20)
      : [],
    notes: clean(body.intake?.notes, 60_000),
  }
  if (!intake.businessName || !intake.goal) {
    log.finish(400, { outcome: 'incomplete_intake' })
    return Response.json({ error: 'Tell us the business name and what you are trying to achieve.', requestId: log.requestId }, {
      status: 400,
      headers: log.headers(),
    })
  }

  const language: LanguageCode = isLanguageCode(body.language) ? body.language : DEFAULT_LANGUAGE
  const key = process.env.OPENROUTER_API_KEY
  const encoder = new TextEncoder()

  log.info('studio.pack.accepted', {
    packId: pack.id,
    specialists: pack.stages.flatMap((stage) => stage.specialists),
    estimatedCredits: packCredits(pack),
    language,
    aiConfigured: Boolean(key),
  })

  if (!key) {
    log.finish(503, { outcome: 'not_configured' })
    return Response.json({ error: 'Create is not configured yet.', requestId: log.requestId }, {
      status: 503,
      headers: log.headers(),
    })
  }

  // A pack is one purchase to the person paying, so it is reserved once up
  // front rather than charged per specialist.
  const credit = await openCreditGate({ request, requester, feature: 'agent', requestId: log.requestId })
  if (credit.denied) {
    log.finish(credit.denied.status, { outcome: 'credit_denied', packId: pack.id })
    return new Response(credit.denied.body, {
      status: credit.denied.status,
      headers: log.headers(credit.denied.headers),
    })
  }
  const gate = credit.gate

  // Like the agent, the work outlives the connection watching it.
  let connected = true
  const stream = new ReadableStream({
    cancel() {
      connected = false
      log.info('studio.pack.client_disconnected', { packId: pack.id })
    },
    async start(controller) {
      const send = (event: PackEvent) => {
        if (!connected) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          connected = false
        }
      }
      const close = () => {
        if (!connected) return
        connected = false
        try { controller.close() } catch { /* already gone */ }
      }

      const startedAt = performance.now()
      try {
        const result = await runPack({
          pack,
          intake,
          language,
          apiKey: key,
          siteUrl: process.env.OPENROUTER_SITE_URL || 'https://lab.aithreesixty.tech',
          siteName: process.env.OPENROUTER_SITE_NAME || 'AI360 Lab',
          emit: send,
          log,
        })

        send({
          type: 'result',
          sections: result.sections,
          sources: result.sources,
          usage: { cost: result.costUsd, totalTokens: result.totalTokens },
        })

        await recordUsageEventSafe({
          requestId: log.requestId,
          route: '/api/studio/pack',
          feature: `pack.${pack.id}`,
          provider: 'openrouter',
          actualCostUsd: result.costUsd,
          latencyMs: Math.round(performance.now() - startedAt),
          outcome: 'success',
          metadata: { packId: pack.id, sections: result.sections.length, stoppedEarly: result.stoppedEarly },
        })
        await gate?.settle('success', result.costUsd)
        log.finish(200, {
          outcome: 'success',
          packId: pack.id,
          sections: result.sections.length,
          cost: result.costUsd,
          stoppedEarly: result.stoppedEarly,
          creditsReserved: gate?.reserved,
        })
        close()
      } catch (error) {
        log.error('studio.pack.failed', { packId: pack.id, ...errorDetails(error) })
        await gate?.settle('failure')
        send({ type: 'error', message: `This pack could not be produced. Reference: ${log.requestId}` })
        log.finish(500, { outcome: 'pack_failed', packId: pack.id })
        close()
      }
    },
  })

  return new Response(stream, {
    headers: log.headers({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    }),
  })
}
