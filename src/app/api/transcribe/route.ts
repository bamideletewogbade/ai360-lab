import { openCreditGate, type CreditGate } from '@/lib/billing/credit-gate'
import { rateLimit, rejectLargeRequest, resolveRequester } from '@/lib/guardrails'
import { transcriptionLanguageHint } from '@/lib/languages'
import { errorDetails, providerErrorDetails, requestLogger } from '@/lib/observability'
import { recordUsageEventSafe } from '@/lib/usage'
import { MAX_VOICE_BYTES, parseTranscriptionForm } from '@/lib/voice/contracts'
import { OpenRouterTranscriptionProvider } from '@/lib/voice/openrouter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ROUTE = '/api/transcribe'
const MULTIPART_OVERHEAD_BYTES = 512 * 1024

export async function POST(request: Request) {
  const log = requestLogger(request, ROUTE)
  const tooLarge = rejectLargeRequest(request, MAX_VOICE_BYTES + MULTIPART_OVERHEAD_BYTES)
  if (tooLarge) {
    log.finish(tooLarge.status, { outcome: 'request_too_large' })
    return new Response(tooLarge.body, { status: tooLarge.status, headers: log.headers(tooLarge.headers) })
  }

  const requester = await resolveRequester(request)
  const limited = rateLimit(request, 'voice', { minute: 5, daily: 24 }, requester)
  if (limited) {
    log.finish(limited.status, { outcome: 'rate_limited' })
    return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    log.finish(400, { outcome: 'multipart_invalid' })
    return Response.json({ error: 'Send the recording as a voice upload', requestId: log.requestId }, {
      status: 400, headers: log.headers({ 'Cache-Control': 'no-store' }),
    })
  }

  const parsed = parseTranscriptionForm(form)
  if (!parsed.ok) {
    log.finish(parsed.status, { outcome: parsed.outcome })
    return Response.json({ error: parsed.error, requestId: log.requestId }, {
      status: parsed.status, headers: log.headers({ 'Cache-Control': 'no-store' }),
    })
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    log.finish(503, { outcome: 'not_configured' })
    return Response.json({ error: 'Voice transcription is not configured', requestId: log.requestId }, {
      status: 503, headers: log.headers({ 'Cache-Control': 'no-store' }),
    })
  }

  const credit = await openCreditGate({
    request, requester, feature: 'voice', requestId: log.requestId,
  })
  if (credit.denied) {
    log.finish(credit.denied.status, { outcome: 'credit_denied' })
    return new Response(credit.denied.body, {
      status: credit.denied.status,
      headers: log.headers(credit.denied.headers),
    })
  }
  const gate: CreditGate = credit.gate
  const provider = new OpenRouterTranscriptionProvider({
    apiKey,
    model: process.env.OPENROUTER_STT_MODEL,
  })
  const providerStartedAt = performance.now()
  const languageHint = transcriptionLanguageHint(parsed.value.inputLanguage)
  log.info('provider.request.started', {
    provider: provider.id,
    feature: 'transcription',
    model: provider.model,
    format: parsed.value.format,
    audioBytes: parsed.value.audio.size,
    durationSeconds: parsed.value.durationSeconds,
    requestedLanguage: parsed.value.inputLanguage,
    languageHintApplied: Boolean(languageHint),
    creditsReserved: gate.reserved,
  })

  try {
    const result = await provider.transcribe(parsed.value, AbortSignal.timeout(90_000))
    const latencyMs = Math.round(performance.now() - providerStartedAt)
    if (!result.text) {
      await gate.settle('failure')
      log.finish(422, { outcome: 'empty_transcript', provider: result.provider, model: result.model })
      return Response.json({
        error: 'We could not hear enough speech. Try again closer to the microphone.',
        requestId: log.requestId,
      }, { status: 422, headers: log.headers({ 'Cache-Control': 'no-store' }) })
    }

    await recordUsageEventSafe({
      requestId: log.requestId, route: ROUTE, feature: 'transcription',
      provider: result.provider, model: result.model,
      inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens,
      actualCostUsd: result.usage?.cost, latencyMs, outcome: 'success',
      metadata: {
        format: parsed.value.format,
        audioBytes: parsed.value.audio.size,
        durationSeconds: parsed.value.durationSeconds,
        requestedLanguage: parsed.value.inputLanguage,
        detectedLanguage: result.detectedLanguage,
        languageHintApplied: Boolean(languageHint),
        segmentCount: result.segments?.length || 0,
      },
    })
    await gate.settle('success', result.usage?.cost)
    log.finish(200, {
      outcome: 'success', provider: result.provider, model: result.model, durationMs: latencyMs,
      outputCharacters: result.text.length, totalTokens: result.usage?.totalTokens,
      cost: result.usage?.cost, creditsReserved: gate.reserved,
    })
    return Response.json({
      text: result.text,
      segments: result.segments,
      language: {
        requested: parsed.value.inputLanguage,
        detected: result.detectedLanguage,
        hintApplied: languageHint || null,
      },
      confidenceAvailable: result.confidenceAvailable,
      reviewRequired: true,
      audioRetention: 'not_stored',
      usage: result.usage,
      requestId: log.requestId,
    }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
  } catch (error) {
    await gate.settle('failure')
    const failure = error instanceof Response ? await providerErrorDetails(error) : errorDetails(error)
    log.error('provider.request.failed', {
      provider: provider.id, feature: 'transcription', model: provider.model,
      durationMs: Math.round(performance.now() - providerStartedAt), ...failure,
    })
    await recordUsageEventSafe({
      requestId: log.requestId, route: ROUTE, feature: 'transcription',
      provider: provider.id, model: provider.model,
      latencyMs: Math.round(performance.now() - providerStartedAt), outcome: 'provider_error',
      metadata: { format: parsed.value.format, requestedLanguage: parsed.value.inputLanguage },
    })
    log.finish(502, { outcome: 'provider_error' })
    return Response.json({
      error: 'The voice note could not be transcribed. You can retry without recording it again.',
      requestId: log.requestId,
    }, { status: 502, headers: log.headers({ 'Cache-Control': 'no-store' }) })
  }
}
