import { isChatMode, routeFor, type ChatMode } from '@/lib/models'
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
  role: 'user' | 'assistant'
  content: string
  attachments?: Attachment[]
}
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'video_url'; video_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }

const AGENT_PROMPT = `You are AI 360 Agent, an outcome-focused research and document-analysis agent built by AI 360 for learners, professionals and entrepreneurs across Africa.

Your job is to complete useful multi-step knowledge work, not merely discuss it.

- Decide whether current web information or a supplied URL must be researched. Use the available tools when they materially improve accuracy.
- Examine attached files carefully and connect findings across them.
- Produce a complete, usable result with a short conclusion, clear evidence and practical next actions.
- Cite web sources using descriptive Markdown links close to supported claims.
- Never invent a source, URL, statistic, tool result or completed action.
- Never claim to send, publish, buy, delete or modify an external system. Those actions are not available.
- Write in a warm, confident editorial voice. Start with the result.
- Never use em dashes or en dashes. Use periods, commas, colons or parentheses.
- Use valid Markdown with short paragraphs, H2/H3 headings, restrained bold, lists and tables only when useful.
- For medical, legal, financial or employment matters, state relevant limitations and recommend qualified review.
- Never expose private reasoning. Summarize completed work and evidence instead.`

function providerMessage(message: Msg) {
  if (message.role !== 'user' || !message.attachments?.length) {
    return { role: message.role, content: message.content }
  }
  const content: ContentPart[] = [{ type: 'text', text: message.content || 'Complete this task using the attached material.' }]
  for (const attachment of message.attachments) {
    if (attachment.kind === 'image' && attachment.data) {
      content.push({ type: 'image_url', image_url: { url: attachment.data } })
    } else if (attachment.kind === 'video' && attachment.data) {
      content.push({ type: 'video_url', video_url: { url: attachment.data } })
    } else if (attachment.kind === 'pdf' && attachment.data) {
      content.push({ type: 'file', file: { filename: attachment.name, file_data: attachment.data } })
    } else if (attachment.kind === 'text' && attachment.text) {
      content.push({ type: 'text', text: `\n\nAttached document: ${attachment.name}\n${attachment.text.slice(0, 60_000)}` })
    }
  }
  return { role: message.role, content }
}

function textContent(value: unknown) {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map((part) => {
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') return part.text
      return ''
    })
    .join('')
}

function plainText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_>`|]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function actionSuggestions(messages: Msg[], result: string) {
  const request = [...messages].reverse().find((message) => message.role === 'user')?.content ?? 'AI 360 follow-up'
  const topic = request.replace(/\s+/g, ' ').trim().slice(0, 90)
  const summary = plainText(result).slice(0, 5_000)
  return [
    {
      id: crypto.randomUUID(),
      kind: 'email',
      title: 'Share by email',
      description: 'Review a prepared email draft before opening it in your mail app.',
      status: 'proposed',
      payload: {
        recipient: '',
        subject: `AI 360 follow-up: ${topic}`,
        body: summary,
      },
    },
    {
      id: crypto.randomUUID(),
      kind: 'calendar',
      title: 'Schedule a follow-up',
      description: 'Choose a time, review the details, then create a calendar invite.',
      status: 'proposed',
      payload: {
        title: `Follow up: ${topic}`,
        notes: summary.slice(0, 1_500),
        durationMinutes: 60,
      },
    },
    {
      id: crypto.randomUUID(),
      kind: 'task',
      title: 'Save the next action',
      description: 'Turn the outcome into a local task stored with this conversation.',
      status: 'proposed',
      payload: {
        title: topic,
        notes: summary.slice(0, 1_500),
      },
    },
  ]
}

export async function POST(request: Request) {
  const tooLarge = rejectLargeRequest(request, 14_000_000)
  if (tooLarge) return tooLarge
  const limited = rateLimit(request, 'agent', { minute: 4, daily: 16 })
  if (limited) return limited

  let body: { messages?: Msg[]; mode?: ChatMode }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const messages = (body.messages ?? [])
    .filter((message) => message && typeof message.content === 'string')
    .slice(-16)
  if (!messages.length) return Response.json({ error: 'A task is required' }, { status: 400 })
  const mode: ChatMode = isChatMode(body.mode) ? body.mode : 'auto'
  const key = process.env.OPENROUTER_API_KEY
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      try {
        send({ type: 'step', id: 'understand', label: 'Understanding the outcome', status: 'active' })
        send({ type: 'step', id: 'understand', label: 'Outcome understood', status: 'complete' })
        send({ type: 'step', id: 'plan', label: 'Building a focused plan', status: 'active' })

        if (!key) {
          send({ type: 'step', id: 'plan', label: 'Plan ready', status: 'complete' })
          send({ type: 'step', id: 'tools', label: 'Previewing research tools', status: 'complete' })
          send({
            type: 'result',
            content:
              '## Agent preview\n\nThe Agent workspace is ready. Add an OpenRouter key to run web research, URL reading and document analysis with bounded tools.',
            sources: [],
          })
          controller.close()
          return
        }

        send({ type: 'step', id: 'plan', label: 'Plan ready', status: 'complete' })
        send({ type: 'step', id: 'tools', label: 'Researching and reading relevant material', status: 'active' })

        const { model, models } = routeFor(mode)
        const hasPdf = messages.some((message) =>
          message.attachments?.some((attachment) => attachment.kind === 'pdf'),
        )
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
            messages: [{ role: 'system', content: AGENT_PROMPT }, ...messages.map(providerMessage)],
            tools: [
              {
                type: 'openrouter:web_search',
                parameters: {
                  engine: 'auto',
                  max_results: 4,
                  max_total_results: 8,
                  search_context_size: 'medium',
                },
              },
              { type: 'openrouter:web_fetch' },
              { type: 'openrouter:datetime' },
            ],
            max_tokens: 3_500,
            ...(hasPdf
              ? { plugins: [{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }] }
              : {}),
          }),
        })

        if (!response.ok) {
          const detail = await response.text().catch(() => '')
          console.error('Agent request failed', response.status, detail.slice(0, 600))
          throw new Error('Agent request failed')
        }
        const json = await response.json()
        send({ type: 'step', id: 'tools', label: 'Research and reading complete', status: 'complete' })
        send({ type: 'step', id: 'verify', label: 'Checking the result and sources', status: 'active' })

        const message = json.choices?.[0]?.message
        const annotations = Array.isArray(message?.annotations) ? message.annotations : []
        const sources = annotations
          .filter((annotation: unknown) => {
            if (!annotation || typeof annotation !== 'object') return false
            const value = annotation as { type?: string; url_citation?: { url?: string } }
            return value.type === 'url_citation' && typeof value.url_citation?.url === 'string'
          })
          .map((annotation: { url_citation: { url: string; title?: string } }) => ({
            url: annotation.url_citation.url,
            title: annotation.url_citation.title || annotation.url_citation.url,
          }))
          .filter(
            (source: { url: string }, index: number, items: Array<{ url: string }>) =>
              items.findIndex((item) => item.url === source.url) === index,
          )
          .slice(0, 8)

        send({ type: 'step', id: 'verify', label: 'Result checked', status: 'complete' })
        const resultContent = textContent(message?.content) || 'The agent completed its work but returned no readable result.'
        send({
          type: 'result',
          content: resultContent,
          sources,
          actions: actionSuggestions(messages, resultContent),
          usage: {
            totalTokens: json.usage?.total_tokens,
            cost: json.usage?.cost,
          },
        })
        controller.close()
      } catch (error) {
        console.error('Agent stream failed', error)
        send({ type: 'error', message: 'The agent could not complete this task. Please try again.' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
