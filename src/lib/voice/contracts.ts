import { isSpeechInputCode, type SpeechInputCode } from '@/lib/languages'

export const MAX_VOICE_BYTES = 12 * 1024 * 1024
export const MAX_VOICE_SECONDS = 5 * 60

const AUDIO_FORMATS = {
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac',
  'audio/flac': 'flac',
} as const

export type VoiceFormat = typeof AUDIO_FORMATS[keyof typeof AUDIO_FORMATS]
export type TranscriptionRequest = {
  audio: File
  format: VoiceFormat
  inputLanguage: SpeechInputCode
  durationSeconds?: number
}
export type TranscriptionUsage = {
  cost?: number; inputTokens?: number; outputTokens?: number; totalTokens?: number; seconds?: number
}
export type TranscriptionResult = {
  text: string
  provider: string
  model: string
  usage?: TranscriptionUsage
  detectedLanguage?: string
  segments?: Array<{ start: number; end: number; text: string }>
  confidenceAvailable: boolean
}
export type TranscriptionProvider = {
  readonly id: string
  transcribe(input: TranscriptionRequest, signal: AbortSignal): Promise<TranscriptionResult>
}

export function voiceFormatForMime(mime: string): VoiceFormat | undefined {
  const normalized = mime.toLowerCase().split(';', 1)[0].trim()
  return AUDIO_FORMATS[normalized as keyof typeof AUDIO_FORMATS]
}

function readDuration(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const duration = Number(value)
  return Number.isFinite(duration) && duration >= 0 ? duration : Number.NaN
}

export function parseTranscriptionForm(form: FormData):
  | { ok: true; value: TranscriptionRequest }
  | { ok: false; status: 400 | 413; error: string; outcome: string } {
  const audio = form.get('audio')
  if (!(audio instanceof File) || audio.size === 0) {
    return { ok: false, status: 400, error: 'Choose a voice recording to transcribe', outcome: 'audio_missing' }
  }
  if (audio.size > MAX_VOICE_BYTES) {
    return { ok: false, status: 413, error: 'The voice recording is too large', outcome: 'audio_too_large' }
  }
  const format = voiceFormatForMime(audio.type)
  if (!format) {
    return { ok: false, status: 400, error: 'This voice recording format is not supported', outcome: 'format_unsupported' }
  }
  const requestedLanguage = form.get('inputLanguage')
  const inputLanguage: SpeechInputCode = isSpeechInputCode(requestedLanguage) ? requestedLanguage : 'mixed'
  const durationSeconds = readDuration(form.get('durationSeconds'))
  if (Number.isNaN(durationSeconds) || (durationSeconds !== undefined && durationSeconds > MAX_VOICE_SECONDS + 2)) {
    return { ok: false, status: 400, error: 'The voice recording is longer than five minutes', outcome: 'duration_invalid' }
  }
  return { ok: true, value: { audio, format, inputLanguage, durationSeconds } }
}
