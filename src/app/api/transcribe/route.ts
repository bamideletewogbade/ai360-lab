import { rateLimit, rejectLargeRequest } from '@/lib/guardrails'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FORMATS = new Set(['webm', 'wav', 'mp3', 'm4a', 'ogg', 'aac', 'flac'])

export async function POST(request: Request) {
  const tooLarge = rejectLargeRequest(request, 15_000_000)
  if (tooLarge) return tooLarge
  const limited = rateLimit(request, 'voice', { minute: 5, daily: 24 })
  if (limited) return limited

  let body: { data?: string; format?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const format = String(body.format || '').toLowerCase()
  const data = typeof body.data === 'string' ? body.data : ''
  if (!FORMATS.has(format) || !data) {
    return Response.json({ error: 'Unsupported recording format' }, { status: 400 })
  }
  if (data.length > 14_000_000) {
    return Response.json({ error: 'Recording is too large' }, { status: 413 })
  }

  const key = process.env.OPENROUTER_API_KEY
  if (!key) return Response.json({ error: 'Voice transcription is not configured' }, { status: 503 })

  try {
    const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://lab.aithreesixty.tech',
        'X-Title': process.env.OPENROUTER_SITE_NAME || 'AI 360 Lab',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_STT_MODEL || 'openai/whisper-large-v3',
        input_audio: { data, format },
        temperature: 0,
      }),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.error('Transcription failed', response.status, detail.slice(0, 500))
      return Response.json({ error: 'The recording could not be transcribed' }, { status: 502 })
    }
    const result = await response.json()
    return Response.json({
      text: typeof result.text === 'string' ? result.text : '',
      usage: result.usage,
    })
  } catch (error) {
    console.error('Transcription request failed', error)
    return Response.json({ error: 'The recording could not be transcribed' }, { status: 502 })
  }
}
