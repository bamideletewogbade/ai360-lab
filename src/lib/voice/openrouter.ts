import { transcriptionLanguageHint } from '@/lib/languages'
import type { TranscriptionProvider, TranscriptionRequest, TranscriptionResult, TranscriptionUsage } from '@/lib/voice/contracts'

type ProviderResponse = { text?: unknown; language?: unknown; segments?: unknown; usage?: Record<string, unknown> }

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function providerUsage(result: ProviderResponse): TranscriptionUsage | undefined {
  const usage = result.usage
  if (!usage) return undefined
  return {
    cost: finite(usage.cost),
    inputTokens: finite(usage.input_tokens) ?? finite(usage.prompt_tokens),
    outputTokens: finite(usage.output_tokens) ?? finite(usage.completion_tokens),
    totalTokens: finite(usage.total_tokens),
    seconds: finite(usage.seconds),
  }
}

function providerSegments(value: unknown): TranscriptionResult['segments'] {
  if (!Array.isArray(value)) return undefined
  const segments = value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const part = item as { start?: unknown; end?: unknown; text?: unknown }
    const start = finite(part.start)
    const end = finite(part.end)
    if (start === undefined || end === undefined || typeof part.text !== 'string') return []
    return [{ start, end, text: part.text }]
  })
  return segments.length ? segments : undefined
}

export class OpenRouterTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'openrouter'
  readonly model: string
  private readonly apiKey: string

  constructor(options: { apiKey: string; model?: string }) {
    this.apiKey = options.apiKey
    this.model = options.model || 'openai/whisper-large-v3'
  }

  async transcribe(input: TranscriptionRequest, signal: AbortSignal): Promise<TranscriptionResult> {
    const form = new FormData()
    form.set('model', this.model)
    form.set('file', input.audio, `voice-note.${input.format}`)
    form.set('temperature', '0')
    const hint = transcriptionLanguageHint(input.inputLanguage)
    if (hint) form.set('language', hint)

    const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST', signal,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://ai360.africa',
        'X-Title': process.env.OPENROUTER_SITE_NAME || 'AI360',
      },
      body: form,
    })
    if (!response.ok) throw response

    const result = await response.json() as ProviderResponse
    return {
      text: typeof result.text === 'string' ? result.text.trim() : '',
      provider: this.id,
      model: this.model,
      usage: providerUsage(result),
      detectedLanguage: typeof result.language === 'string' ? result.language : undefined,
      segments: providerSegments(result.segments),
      // The common endpoint does not promise calibrated confidence values.
      confidenceAvailable: false,
    }
  }
}
