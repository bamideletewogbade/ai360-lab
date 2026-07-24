import type { NextRequest } from 'next/server'
import { isChatMode, routeFor, SYSTEM_PROMPT, type ChatMode } from '@/lib/models'
import { rateLimit, rejectLargeRequest } from '@/lib/guardrails'

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
    `You’re using AI 360 Lab in preview mode.${fileNote} ` +
    `Add an OpenRouter key to switch on live answers and streaming. ` +
    `For now, the full workspace experience—history, files, voice and model selection—is ready to explore.`

  for (const word of reply.split(' ')) {
    controller.enqueue(encoder.encode(`${word} `))
    await sleep(24)
  }
}

export async function POST(req: NextRequest) {
  const tooLarge = rejectLargeRequest(req, 14_000_000)
  if (tooLarge) return tooLarge
  const limited = rateLimit(req, 'chat', { minute: 12, daily: 80 })
  if (limited) return limited

  let body: { messages?: Msg[]; mode?: ChatMode }
  try {
    body = await req.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const messages = (body.messages ?? [])
    .filter((message) => message && typeof message.content === 'string')
    .slice(-20)
  const mode: ChatMode = isChatMode(body.mode) ? body.mode : 'auto'
  const key = process.env.OPENROUTER_API_KEY

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        if (!key) {
          await mockStream(controller, messages)
          controller.close()
          return
        }

        const { model, models } = routeFor(mode)
        const hasPdf = messages.some((message) =>
          message.attachments?.some((attachment) => attachment.kind === 'pdf'),
        )
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
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
            max_tokens: 2_500,
            ...(hasPdf
              ? { plugins: [{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }] }
              : {}),
          }),
        })

        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => '')
          console.error('OpenRouter error', res.status, detail.slice(0, 500))
          controller.enqueue(encoder.encode('The Lab is busy right now — please try again in a moment.'))
          controller.close()
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const data = trimmed.slice(5).trim()
            if (data === '[DONE]') {
              controller.close()
              return
            }
            try {
              const json = JSON.parse(data)
              const delta: string | undefined = json.choices?.[0]?.delta?.content
              if (delta) controller.enqueue(encoder.encode(delta))
            } catch {
              // A malformed provider event should not terminate the user's stream.
            }
          }
        }
        controller.close()
      } catch (error) {
        console.error('Chat stream failed', error)
        controller.enqueue(encoder.encode('Something went wrong. Please try again.'))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
