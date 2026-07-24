import type { NextRequest } from 'next/server'
import { isChatMode, routeFor, SYSTEM_PROMPT, type ChatMode } from '@/lib/models'
import { rateLimit, rejectLargeRequest } from '@/lib/guardrails'
import { errorDetails, providerErrorDetails, requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Attachment = {
  name: string
  kind: 'image' | 'video' | 'pdf' | 'text'
  data?: string
  text?: string
}
type Msg = {
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: Attachment[]
}
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'video_url'; video_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function toProviderMessage(message: Msg) {
  if (!message.attachments?.length || message.role !== 'user') {
    return { role: message.role, content: message.content }
  }

  const content: ContentPart[] = [{ type: 'text', text: message.content || 'Please review the attached file.' }]
  for (const attachment of message.attachments) {
    if (attachment.kind === 'image' && attachment.data) {
      content.push({ type: 'image_url', image_url: { url: attachment.data } })
    } else if (attachment.kind === 'video' && attachment.data) {
      content.push({ type: 'video_url', video_url: { url: attachment.data } })
    } else if (attachment.kind === 'pdf' && attachment.data) {
      content.push({ type: 'file', file: { filename: attachment.name, file_data: attachment.data } })
    } else if (attachment.kind === 'text' && attachment.text) {
      content.push({
        type: 'text',
        text: `\n\n--- Attached document: ${attachment.name} ---\n${attachment.text.slice(0, 60_000)}`,
      })
    }
  }
  return { role: message.role, content }
}

async function mockStream(controller: ReadableStreamDefaultController, messages: Msg[]) {
  const encoder = new TextEncoder()
  const last = [...messages].reverse().find((message) => message.role === 'user')
  const fileNote = last?.attachments?.length
    ? ` I can also see your attached ${last.attachments.map((file) => file.name).join(', ')}.`
    : ''
  const reply =
    `You are using AI 360 Lab in preview mode.${fileNote} ` +
    `Add an OpenRouter key to switch on live answers and streaming. ` +
    `For now, the full workspace experience, including history, files, voice and model selection, is ready to explore.`

  for (const word of reply.split(' ')) {
    controller.enqueue(encoder.encode(`${word} `))
    await sleep(24)
  }
}

function responseWithRequestId(response: Response, requestId: string) {
  const headers = new Headers(response.headers)
  headers.set('X-Request-Id', requestId)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export async function POST(req: NextRequest) {
  const log = requestLogger(req, '/api/chat')
  const tooLarge = rejectLargeRequest(req, 14_000_000)
  if (tooLarge) {
    log.finish(tooLarge.status, { outcome: 'request_too_large' })
    return responseWithRequestId(tooLarge, log.requestId)
  }
  const limited = rateLimit(req, 'chat', { minute: 12, daily: 80 })
  if (limited) {
    log.finish(limited.status, { outcome: 'rate_limited' })
    return responseWithRequestId(limited, log.requestId)
  }

  let body: { messages?: Msg[]; mode?: ChatMode }
  try {
    body = await req.json()
  } catch {
    log.finish(400, { outcome: 'invalid_json' })
    return new Response('Bad request', { status: 400, headers: log.headers() })
  }

  const messages = (body.messages ?? [])
    .filter((message) => message && typeof message.content === 'string')
    .slice(-20)
  const mode: ChatMode = isChatMode(body.mode) ? body.mode : 'auto'
  const key = process.env.OPENROUTER_API_KEY
  const attachments = messages.flatMap((message) => message.attachments ?? [])
  log.info('chat.accepted', {
    mode,
    messageCount: messages.length,
    attachmentCount: attachments.length,
    attachmentKinds: attachments.map((attachment) => attachment.kind),
    aiConfigured: Boolean(key),
  })

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        if (!key) {
          await mockStream(controller, messages)
          log.finish(200, { outcome: 'preview_response' })
          controller.close()
          return
        }

        const { model, models } = routeFor(mode)
        const hasPdf = messages.some((message) =>
          message.attachments?.some((attachment) => attachment.kind === 'pdf'),
        )
        const providerStartedAt = performance.now()
        log.info('provider.request.started', {
          provider: 'openrouter',
          model,
          fallbackModels: models,
          hasPdf,
        })
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: AbortSignal.timeout(90_000),
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://lab.aithreesixty.tech',
            'X-Title': process.env.OPENROUTER_SITE_NAME || 'AI 360 Lab',
          },
          body: JSON.stringify({
            model,
            models,
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages.map(toProviderMessage)],
            stream: true,
            stream_options: { include_usage: true },
            max_tokens: 2_500,
            ...(hasPdf
              ? { plugins: [{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }] }
              : {}),
          }),
        })

        if (!res.ok || !res.body) {
          const failure = await providerErrorDetails(res)
          log.error('provider.request.failed', {
            provider: 'openrouter',
            model,
            durationMs: Math.round(performance.now() - providerStartedAt),
            ...failure,
          })
          log.finish(502, { outcome: 'provider_error', providerStatus: res.status })
          controller.enqueue(
            encoder.encode(`The Lab could not reach its AI provider. Please try again. Reference: ${log.requestId}`),
          )
          controller.close()
          return
        }

        log.info('provider.stream.connected', {
          provider: 'openrouter',
          model,
          providerStatus: res.status,
          durationMs: Math.round(performance.now() - providerStartedAt),
        })
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let chunkCount = 0
        let outputCharacters = 0
        let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number } | undefined
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunkCount += 1
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const data = trimmed.slice(5).trim()
            if (data === '[DONE]') {
              log.finish(200, {
                outcome: 'success',
                provider: 'openrouter',
                model,
                chunkCount,
                outputCharacters,
                promptTokens: usage?.prompt_tokens,
                completionTokens: usage?.completion_tokens,
                totalTokens: usage?.total_tokens,
                cost: usage?.cost,
              })
              controller.close()
              return
            }
            try {
              const json = JSON.parse(data)
              const delta: string | undefined = json.choices?.[0]?.delta?.content
              if (delta) {
                outputCharacters += delta.length
                controller.enqueue(encoder.encode(delta))
              }
              if (json.usage && typeof json.usage === 'object') usage = json.usage
            } catch {
              log.warn('provider.stream.event_ignored', { provider: 'openrouter', model })
            }
          }
        }
        log.finish(200, {
          outcome: 'success_without_done_event',
          provider: 'openrouter',
          model,
          chunkCount,
          outputCharacters,
          totalTokens: usage?.total_tokens,
          cost: usage?.cost,
        })
        controller.close()
      } catch (error) {
        log.error('chat.stream.failed', errorDetails(error))
        log.finish(500, { outcome: 'stream_error' })
        controller.enqueue(
          encoder.encode(`Something went wrong. Please try again. Reference: ${log.requestId}`),
        )
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: log.headers({
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    }),
  })
}
