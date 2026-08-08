import { isChatMode, routeFor, type ChatMode } from '@/lib/models'
import { rateLimit, rejectLargeRequest, requireIdentifiedRequester, resolveRequester } from '@/lib/guardrails'
import { errorDetails, requestLogger } from '@/lib/observability'
import { recordUsageEventSafe } from '@/lib/usage'
import { openCreditGate } from '@/lib/billing/credit-gate'
import { failRun, runAgent } from '@/lib/agent/runtime'
import { isAgentDepth, reconcileApprovedPlan, type AgentDepth } from '@/lib/agent/protocol'
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from '@/lib/languages'

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
  const log = requestLogger(request, '/api/agent')
  const tooLarge = rejectLargeRequest(request, 14_000_000)
  if (tooLarge) {
    log.finish(tooLarge.status, { outcome: 'request_too_large' })
    return new Response(tooLarge.body, { status: tooLarge.status, headers: log.headers(tooLarge.headers) })
  }
  const requester = await resolveRequester(request)
  const anonymous = requireIdentifiedRequester('agent', requester)
  if (anonymous) {
    log.finish(anonymous.status, { outcome: 'sign_in_required' })
    return new Response(anonymous.body, { status: anonymous.status, headers: log.headers(anonymous.headers) })
  }
  const limited = rateLimit(request, 'agent', { minute: 4, daily: 16 }, requester)
  if (limited) {
    log.finish(limited.status, { outcome: 'rate_limited' })
    return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  }

  let body: {
    messages?: Msg[]
    mode?: ChatMode
    sessionId?: string
    depth?: unknown
    language?: unknown
    planOnly?: unknown
    /** The plan the client was shown, echoed back so approvals can be checked against it. */
    proposedPlan?: unknown
    approvedPlan?: unknown
  }
  try {
    body = await request.json()
  } catch {
    log.finish(400, { outcome: 'invalid_json' })
    return Response.json({ error: 'Invalid request', requestId: log.requestId }, {
      status: 400,
      headers: log.headers(),
    })
  }

  const messages = (body.messages ?? [])
    .filter((message) => message && typeof message.content === 'string')
    .slice(-16)
  if (!messages.length) {
    log.finish(400, { outcome: 'missing_task' })
    return Response.json({ error: 'A task is required', requestId: log.requestId }, {
      status: 400,
      headers: log.headers(),
    })
  }
  const mode: ChatMode = isChatMode(body.mode) ? body.mode : 'auto'
  const depth: AgentDepth = isAgentDepth(body.depth) ? body.depth : 'standard'
  const language: LanguageCode = isLanguageCode(body.language) ? body.language : DEFAULT_LANGUAGE
  // Approved objectives are reconciled against what was proposed, so a client
  // cannot smuggle in extra work by editing the approval payload.
  const approvedObjectives = reconcileApprovedPlan(
    Array.isArray(body.proposedPlan)
      ? body.proposedPlan.filter((item: unknown): item is string => typeof item === 'string')
      : [],
    body.approvedPlan,
  )
  const planOnly = body.planOnly === true && !approvedObjectives.length
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 256) : undefined
  const key = process.env.OPENROUTER_API_KEY
  const encoder = new TextEncoder()
  const attachments = messages.flatMap((message) => message.attachments ?? [])
  log.info('agent.accepted', {
    mode,
    depth,
    planOnly,
    approvedTaskCount: approvedObjectives.length,
    messageCount: messages.length,
    attachmentCount: attachments.length,
    attachmentKinds: attachments.map((attachment) => attachment.kind),
    aiConfigured: Boolean(key),
  })

  // Planning is one small call, so it is charged as a chat turn rather than a
  // full agent run. Rejecting a plan should cost one credit, not five.
  const credit = key
    ? await openCreditGate({
        request, requester, requestId: log.requestId,
        feature: planOnly ? 'chat' : 'agent',
      })
    : { gate: undefined, denied: undefined }
  if (credit.denied) {
    log.finish(credit.denied.status, { outcome: 'credit_denied' })
    return new Response(credit.denied.body, {
      status: credit.denied.status,
      headers: log.headers(credit.denied.headers),
    })
  }
  const gate = credit.gate

  // The run must outlive the connection that started it. On a mobile network
  // that drops, the old shape lost the work and stranded the credits until the
  // reservation expired. Now the stream is only a view of the run: writing to a
  // closed connection is ignored, and the client picks the run up again from
  // /api/agent/runs/<id>.
  let connected = true

  const stream = new ReadableStream({
    cancel() {
      connected = false
      log.info('agent.client_disconnected', { runId: `run_${log.requestId.slice(0, 48)}` })
    },
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        if (!connected) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          // The client has gone. The run carries on and is recovered by id.
          connected = false
        }
      }
      const close = () => {
        if (!connected) return
        connected = false
        try { controller.close() } catch { /* already closed by the client */ }
      }
      try {
        if (!key) {
          send({ type: 'step', id: 'plan', label: 'Plan ready', status: 'complete' })
          send({ type: 'step', id: 'tools', label: 'Previewing research tools', status: 'complete' })
          send({
            type: 'result',
            content:
              '## Agent preview\n\nThe Agent workspace is ready. Add an OpenRouter key to run web research, URL reading and document analysis with bounded tools.',
            sources: [],
          })
          log.finish(200, { outcome: 'preview_response' })
          close()
          return
        }

        const goal = [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
        const startedAt = performance.now()
        const run = await runAgent({
          goal,
          messages: messages.map(providerMessage),
          mode,
          depth,
          language,
          hasAttachments: attachments.length > 0,
          planOnly,
          approvedObjectives,
          requestId: log.requestId,
          sessionId,
          context: requester.context,
          apiKey: key,
          siteUrl: process.env.OPENROUTER_SITE_URL || 'https://lab.aithreesixty.tech',
          siteName: process.env.OPENROUTER_SITE_NAME || 'AI 360 Lab',
          emit: (event) => send(event as unknown as Record<string, unknown>),
          log,
        })

        if (run.awaitingApproval) {
          await gate?.settle('success', run.costUsd)
          log.finish(200, { outcome: 'awaiting_approval', taskCount: run.plan.length, cost: run.costUsd, depth })
          close()
          return
        }

        const resultContent = run.content || 'The agent completed its work but returned no readable result.'
        send({
          type: 'result',
          content: resultContent,
          sources: run.sources,
          actions: actionSuggestions(messages, resultContent),
          usage: { totalTokens: run.totalTokens, cost: run.costUsd },
        })
        await recordUsageEventSafe({
          requestId: log.requestId, route: '/api/agent', feature: 'agent', provider: 'openrouter',
          model: routeFor(mode, { workload: 'agent' }).model,
          actualCostUsd: run.costUsd, latencyMs: Math.round(performance.now() - startedAt),
          outcome: 'success',
          metadata: {
            sourceCount: run.sources.length, attachmentCount: attachments.length,
            tasksRun: run.tasksRun, revised: run.revised, stoppedEarly: run.stoppedEarly,
          },
        })
        await gate?.settle('success', run.costUsd)
        log.finish(200, {
          outcome: 'success',
          provider: 'openrouter',
          creditsReserved: gate?.reserved,
          sourceCount: run.sources.length,
          outputCharacters: resultContent.length,
          totalTokens: run.totalTokens,
          cost: run.costUsd,
          tasksRun: run.tasksRun,
          revised: run.revised,
          stoppedEarly: run.stoppedEarly,
        })
        close()
      } catch (error) {
        log.error('agent.stream.failed', errorDetails(error))
        await failRun(log.requestId, requester.context, 'run_failed')
        await gate?.settle('failure')
        log.finish(500, { outcome: 'stream_error' })
        send({
          type: 'error',
          message: `The agent could not complete this task. Please try again. Reference: ${log.requestId}`,
        })
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
