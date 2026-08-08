import { rateLimit, rejectLargeRequest, resolveRequester } from '@/lib/guardrails'
import { errorDetails, providerErrorDetails, requestLogger } from '@/lib/observability'
import { recordUsageEventSafe } from '@/lib/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FORMATS = new Set(['webm', 'wav', 'mp3', 'm4a', 'ogg', 'aac', 'flac'])

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/transcribe')
  const tooLarge = rejectLargeRequest(request, 15_000_000)
  if (tooLarge) {
    log.finish(tooLarge.status, { outcome: 'request_too_large' })
    return new Response(tooLarge.body, { status: tooLarge.status, headers: log.headers(tooLarge.headers) })
  }
  const limited = rateLimit(request, 'voice', { minute: 5, daily: 24 }, await resolveRequester(request))
  if (limited) {
    log.finish(limited.status, { outcome: 'rate_limited' })
    return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  }

  let body: { data?: string; format?: string }
  try {
    body = await request.json()
  } catch {
    log.finish(400, { outcome: 'invalid_json' })
    return Response.json({ error: 'Invalid request', requestId: log.requestId }, {
      status: 400,
      headers: log.headers(),
    })
  }

  const format = String(body.format || '').toLowerCase()
  const data = typeof body.data === 'string' ? body.data : ''
  if (!FORMATS.has(format) || !data) {
    log.finish(400, { outcome: 'unsupported_format', format })
    return Response.json({ error: 'Unsupported recording format', requestId: log.requestId }, {
      status: 400,
      headers: log.headers(),
    })
  }
  if (data.length > 14_000_000) {
    log.finish(413, { outcome: 'recording_too_large', encodedBytes: data.length })
    return Response.json({ error: 'Recording is too large', requestId: log.requestId }, {
      status: 413,
      headers: log.headers(),
    })
  }

  // Browser recordings arrive as data URLs, while OpenRouter expects only the
  // raw base64 payload inside input_audio.data.
  const audioData = data.startsWith('data:')
    ? data.slice(data.indexOf(',') + 1)
    : data
  if (!audioData || !/^[A-Za-z0-9+/=_-]+$/.test(audioData)) {
    log.finish(400, { outcome: 'invalid_audio_data', format })
    return Response.json({ error: 'The recording data is invalid', requestId: log.requestId }, {
      status: 400,
      headers: log.headers(),
    })
  }

  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    log.finish(503, { outcome: 'not_configured' })
    return Response.json({ error: 'Voice transcription is not configured', requestId: log.requestId }, {
      status: 503,
      headers: log.headers(),
    })
  }

  try {
    const model = process.env.OPENROUTER_STT_MODEL || 'openai/whisper-large-v3'
    const providerStartedAt = performance.now()
    log.info('provider.request.started', {
      provider: 'openrouter',
      feature: 'transcription',
      model,
      format,
      encodedBytes: audioData.length,
    })
    const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://lab.aithreesixty.tech',
        'X-Title': process.env.OPENROUTER_SITE_NAME || 'AI360 Lab',
      },
      body: JSON.stringify({
        model,
        input_audio: { data: audioData, format },
        temperature: 0,
      }),
    })
    if (!response.ok) {
      const failure = await providerErrorDetails(response)
      log.error('provider.request.failed', {
        provider: 'openrouter',
        feature: 'transcription',
        model,
        durationMs: Math.round(performance.now() - providerStartedAt),
        ...failure,
      })
      log.finish(502, { outcome: 'provider_error', providerStatus: response.status })
      await recordUsageEventSafe({
        requestId: log.requestId, route: '/api/transcribe', feature: 'transcription',
        provider: 'openrouter', model, latencyMs: Math.round(performance.now() - providerStartedAt),
        outcome: 'provider_error', metadata: { providerStatus: response.status, format },
      })
      return Response.json({
        error: 'The recording could not be transcribed',
        requestId: log.requestId,
      }, { status: 502, headers: log.headers() })
    }
    const result = await response.json()
    const latencyMs = Math.round(performance.now() - providerStartedAt)
    await recordUsageEventSafe({
      requestId: log.requestId, route: '/api/transcribe', feature: 'transcription',
      provider: 'openrouter', model, inputTokens: result.usage?.prompt_tokens,
      outputTokens: result.usage?.completion_tokens, actualCostUsd: result.usage?.cost,
      latencyMs, outcome: 'success', metadata: { format },
    })
    log.finish(200, {
      outcome: 'success',
      provider: 'openrouter',
      model,
      durationMs: latencyMs,
      outputCharacters: typeof result.text === 'string' ? result.text.length : 0,
      totalTokens: result.usage?.total_tokens,
      cost: result.usage?.cost,
    })
    return Response.json({
      text: typeof result.text === 'string' ? result.text : '',
      usage: result.usage,
      requestId: log.requestId,
    }, { headers: log.headers() })
  } catch (error) {
    log.error('transcription.failed', errorDetails(error))
    log.finish(502, { outcome: 'request_error' })
    return Response.json({
      error: 'The recording could not be transcribed',
      requestId: log.requestId,
    }, { status: 502, headers: log.headers() })
  }
}
