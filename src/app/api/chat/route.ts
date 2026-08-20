import type { NextRequest } from 'next/server'
import { isChatMode, isPremiumChatMode, providerPreferences, REASONING_BUDGET, routeFor, SYSTEM_PROMPT, type ChatMode } from '@/lib/models'
import {
  configuredLimit, consumeDailyBucketFallback, rateLimit, rejectLargeRequest, resolveRequester,
  type Requester,
} from '@/lib/guardrails'
import { consumeChatDailyCounter } from '@/lib/chat-daily-cap'
import { errorDetails, providerErrorDetails, requestLogger } from '@/lib/observability'
import { citationSources, LIVE_INFORMATION_TOOLS } from '@/lib/live-tools'
import {
  accumulateToolCalls, CREATE_DOCUMENT_TOOL, guestDocumentSignInMessage, parseToolCall, shouldOfferDocumentTool,
  type StreamedToolCall,
} from '@/lib/chat-tools'
import { isAuthConfigured } from '@/lib/auth'
import { isDocumentStoreConfigured, persistGeneratedDocument } from '@/lib/export/document-store'
import { NoTabularContentError, renderDocument } from '@/lib/export/render'
import { resolveDocumentBrand } from '@/lib/export/brand'
import { recordUsageEventSafe } from '@/lib/usage'
import { CHAT_FAIR_USE_DAILY, CHAT_FAIR_USE_FALLBACK } from '@/lib/billing/catalog'
import { openCreditGate } from '@/lib/billing/credit-gate'
import { chatFeature } from '@/lib/billing/credits'
import { readBalance } from '@/lib/billing/credit-repository'
import { productKnowledgeBlock } from '@/lib/product-knowledge'
import { projectContextBlock } from '@/lib/studio/project-context'
import { brandKnowledgeBlock } from '@/lib/brand-knowledge'
import { DEFAULT_LANGUAGE, isLanguageCode, languageDirective, type LanguageCode } from '@/lib/languages'
import { policyForConversation, prepareConversationContext, type ContextMessage } from '@/lib/context-engineering'
import {
  looksLikeLeakedReasoning, providerContentText, servedModel, stripThinkingBlocks, wasTruncated,
} from '@/lib/provider-content'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Msg = ContextMessage
type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  /** A file the assistant produced and stored; the browser renders it as a download. */
  | {
      type: 'attachment'
      assetId: string
      filename: string
      title: string
      format: string
      byteSize: number
    }
  | { type: 'error'; code: string; message: string; retryable: boolean; creditNotice: string; requestId: string }
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'video_url'; video_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Anonymous callers sit at the Explorer allowance: they cannot buy credits, so
 * over the cap they are asked to sign in rather than overflow onto a balance.
 * The caps themselves live in the catalogue, because the pricing page publishes
 * them and the two must not drift.
 */
async function chatFairUseDaily(requester: Requester) {
  const planLimit = !requester.context
    ? CHAT_FAIR_USE_DAILY.explorer
    : await readBalance(requester.context)
        .then((balance) => CHAT_FAIR_USE_DAILY[balance?.plan ?? 'everyday'] ?? CHAT_FAIR_USE_FALLBACK)
        .catch(() => {
          // The meter must never block chat because the billing database is
          // slow or down; the conservative paid-plan default still bounds cost.
          return CHAT_FAIR_USE_FALLBACK
        })
  return configuredLimit('AI360_RATE_CHAT_PER_DAY', planLimit)
}

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

async function mockStream(send: (event: ChatStreamEvent) => void, messages: Msg[]) {
  const last = [...messages].reverse().find((message) => message.role === 'user')
  const fileNote = last?.attachments?.length
    ? ` I can also see your attached ${last.attachments.map((file) => file.name).join(', ')}.`
    : ''
  const reply =
    `You are using AI360 in preview mode.${fileNote} ` +
    `Add an OpenRouter key to switch on live answers and streaming. ` +
    `For now, the full workspace experience, including history, files, voice and model selection, is ready to explore.`

  for (const word of reply.split(' ')) {
    send({ type: 'delta', text: `${word} ` })
    await sleep(24)
  }
  send({ type: 'done' })
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
  const requester = await resolveRequester(req)
  // The minute bucket is the only hard rate limit here. The daily allowance is
  // decided once the request is classified below: signed-in users who pass it
  // are metered at one credit per extra message instead of being blocked, and
  // anonymous callers (who have no credit account to overflow onto) get a
  // durable per-day hard stop. The counter is durable, so a deploy cannot
  // reset the allowance.
  const limited = rateLimit(req, 'chat', { minute: 12, daily: null }, requester)
  if (limited) {
    log.finish(limited.status, { outcome: 'rate_limited' })
    return responseWithRequestId(limited, log.requestId)
  }

  let body: { messages?: Msg[]; mode?: ChatMode; sessionId?: string; language?: unknown; projectId?: unknown }
  try {
    body = await req.json()
  } catch {
    log.finish(400, { outcome: 'invalid_json' })
    return new Response('Bad request', { status: 400, headers: log.headers() })
  }

  const messages = prepareConversationContext(body.messages ?? [])
  const mode: ChatMode = isChatMode(body.mode) ? body.mode : 'auto'
  const language: LanguageCode = isLanguageCode(body.language) ? body.language : DEFAULT_LANGUAGE
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 256) : undefined
  // A chat inside a project inherits that project's brief and files. The id is
  // the only thing taken from the request; the content behind it is read from
  // the caller's own workspace, so this cannot be used to inject context the
  // person does not already own.
  const projectId = typeof body.projectId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.projectId)
    ? body.projectId
    : ''
  const projectContext = projectId && requester.workspaceKey
    ? await projectContextBlock({ workspaceKey: requester.workspaceKey, projectId })
    : ''
  // Workspace-wide, unlike the project context above: applies to every
  // conversation, not just ones inside a project, because a business's own
  // facts and voice are not scoped to one piece of work.
  const brandKnowledge = requester.workspaceKey
    ? await brandKnowledgeBlock({ workspaceKey: requester.workspaceKey })
    : ''
  const key = process.env.OPENROUTER_API_KEY
  const policy = policyForConversation(messages)
  const attachments = messages.flatMap((message) => message.attachments ?? [])
  log.info('chat.accepted', {
    mode,
    messageCount: messages.length,
    attachmentCount: attachments.length,
    attachmentKinds: attachments.map((attachment) => attachment.kind),
    liveInformation: policy.liveInformation,
    contextCharacters: policy.contextCharacters,
    aiConfigured: Boolean(key),
  })

  const guestDocumentMessage = guestDocumentSignInMessage({
    authConfigured: isAuthConfigured(),
    authenticated: Boolean(requester.context),
    messages,
  })
  if (guestDocumentMessage) {
    log.finish(200, { outcome: 'document_sign_in_required' })
    const body = [
      JSON.stringify({ type: 'delta', text: guestDocumentMessage } satisfies ChatStreamEvent),
      JSON.stringify({ type: 'done' } satisfies ChatStreamEvent),
      '',
    ].join('\n')
    return responseWithRequestId(new Response(body, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    }), log.requestId)
  }

  let feature = chatFeature({
    liveResearch: policy.liveInformation,
    hasAttachment: policy.hasAttachments,
    premium: isPremiumChatMode(mode),
  })
  let overflow = false
  if (feature === 'chat') {
    // Plain chat is the only surface bounded by the daily fair-use allowance;
    // metered chat (research, files, premium models) is already paid for by the
    // credit gate below, so the free allowance never limits it.
    const dailyLimit = await chatFairUseDaily(requester)
    const used = await consumeChatDailyCounter(requester.key)
    const overDaily = used !== null
      ? used > dailyLimit
      : !consumeDailyBucketFallback(requester.key, dailyLimit).allowed
    if (overDaily) {
      if (!requester.identified) {
        // Anonymous callers have no credit account to overflow onto, so the
        // durable cap is a hard stop and the path to paying is signing in.
        log.finish(429, { outcome: 'daily_limit', dailyLimit })
        return responseWithRequestId(Response.json(
          {
            error: 'You have reached today\'s chat limit. It resets at midnight UTC.',
            hint: 'Sign in to keep chatting — included chat is free, and extra messages after the daily limit cost 1 credit each.',
          },
          { status: 429, headers: { 'Cache-Control': 'no-store' } },
        ), log.requestId)
      }
      feature = 'chat.overflow'
      overflow = true
    }
  }
  log.info('chat.billing', { feature, overflow, metered: feature !== 'chat' })

  // Plain chat on the fast model is included with a plan: no reservation, no
  // charge, bounded only by the fair-use cap above. Live research, files and
  // deliberately premium models stay metered. Preview mode costs nothing too.
  const credit = key && feature !== 'chat'
    ? await openCreditGate({ request: req, requester, feature, requestId: log.requestId })
    : { gate: undefined, denied: undefined }
  if (credit.denied) {
    log.finish(credit.denied.status, { outcome: 'credit_denied' })
    return responseWithRequestId(credit.denied, log.requestId)
  }
  const gate = credit.gate

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: ChatStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      try {
        if (!key) {
          await mockStream(send, messages)
          log.finish(200, { outcome: 'preview_response' })
          controller.close()
          return
        }

        const { model, models } = routeFor(mode, {
          workload: 'chat',
          hasVideo: policy.hasVideo,
          hasAttachments: policy.hasAttachments,
        })

        /**
         * Producing a file is only offered when the file could actually be kept:
         * a signed-in workspace to own it, storage configured to hold it, and a
         * request that reads like someone wanting something to keep or send. A
         * model that can see a tool will eventually reach for it, so the narrow
         * gate is the feature.
         */
        const documentToolOffered = Boolean(
          requester.context
          && isDocumentStoreConfigured()
          && shouldOfferDocumentTool(messages),
        )
        const providerTools = [
          ...(policy.liveInformation ? LIVE_INFORMATION_TOOLS : []),
          ...(documentToolOffered ? [CREATE_DOCUMENT_TOOL] : []),
        ]
        const providerStartedAt = performance.now()
        log.info('provider.request.started', {
          provider: 'openrouter',
          model,
          fallbackModels: models,
          hasPdf: policy.hasPdf,
          documentToolOffered,
        })

        const systemContent = `${SYSTEM_PROMPT}\n\n${productKnowledgeBlock()}\n\n${languageDirective(language)}\n\n${policy.liveInformation
          ? 'Live information tools are available for this request. Use them only where freshness or verification matters.'
          : 'Live information tools are not enabled for this request. Do not claim that you searched or verified current information.'}${documentToolOffered
          ? '\n\nYou can attach a downloadable file to this answer with the create_document tool when the person asked for something to keep, send or print. Write the document body yourself in markdown. After the tool returns, still reply briefly saying what you made — do not repeat the whole document in the message.'
          : ''}${projectContext ? `\n\n${projectContext}` : ''}${brandKnowledge ? `\n\n${brandKnowledge}` : ''}`

        const conversation: unknown[] = [
          { role: 'system', content: systemContent },
          ...messages.map(toProviderMessage),
        ]

        let chunkCount = 0
        let outputCharacters = 0
        let outputText = ''
        // Price-sorted routing over the fallback list often serves a different
        // model than the one asked for. Recording the requested model made the
        // usage ledger attribute every cost to the wrong place.
        let answeredBy = model
        let finishReason: string | undefined
        const sources = new Map<string, string>()
        type ProviderUsage = {
          prompt_tokens?: number
          completion_tokens?: number
          total_tokens?: number
          cost?: number
          server_tool_use?: { web_search_requests?: number }
        }
        let usage: ProviderUsage | undefined
        // A tool round trip means a second billable call, so cost accumulates
        // across passes rather than being read from the last one.
        let totalCostUsd = 0
        let passes = 0
        const producedFiles: Array<{ filename: string; format: string; byteSize: number }> = []

        const appendLiveSources = () => {
          const missing = [...sources.entries()].filter(([url]) => !outputText.includes(url))
          if (!missing.length) return
          const block = `\n\n### Live sources\n\n${missing.map(([url, title]) => `- [${title}](${url})`).join('\n')}`
          outputText += block
          outputCharacters += block.length
          send({ type: 'delta', text: block })
        }

        /**
         * One provider pass: streams any text straight to the browser and
         * returns whatever tool calls the model assembled along the way.
         */
        const runPass = async (
          passMessages: unknown[],
        ): Promise<{ failed: boolean; toolCalls: StreamedToolCall[] }> => {
          passes += 1
          const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(90_000),
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://ai360.africa',
              'X-Title': process.env.OPENROUTER_SITE_NAME || 'AI360',
            },
            body: JSON.stringify({
              model,
              models,
              ...(sessionId ? { session_id: sessionId } : {}),
              messages: passMessages,
              ...(providerTools.length ? { tools: providerTools } : {}),
              provider: providerPreferences('chat', { withTools: providerTools.length > 0 }),
              // A thinking model otherwise spends the whole budget reasoning and
              // streams back an empty answer.
              reasoning: REASONING_BUDGET,
              stream: true,
              max_tokens: 2_000,
              ...(policy.hasPdf
                ? { plugins: [{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }] }
                : {}),
            }),
          })

          if (!res.ok || !res.body) {
            const failure = await providerErrorDetails(res)
            log.error('provider.request.failed', {
              provider: 'openrouter',
              model,
              pass: passes,
              durationMs: Math.round(performance.now() - providerStartedAt),
              ...failure,
            })
            log.finish(502, { outcome: 'provider_error', providerStatus: res.status })
            await recordUsageEventSafe({
              requestId: log.requestId, route: '/api/chat', feature: 'chat', provider: 'openrouter', model,
              latencyMs: Math.round(performance.now() - providerStartedAt), outcome: 'provider_error',
              metadata: { providerStatus: res.status, mode, attachmentCount: attachments.length },
            })
            await gate?.settle('failure')
            send({
              type: 'error',
              code: 'provider_unavailable',
              message: 'AI360 could not reach the AI service.',
              retryable: true,
              creditNotice: 'No credits were used for this attempt.',
              requestId: log.requestId,
            })
            controller.close()
            return { failed: true, toolCalls: [] }
          }

          log.info('provider.stream.connected', {
            provider: 'openrouter',
            model,
            pass: passes,
            providerStatus: res.status,
            durationMs: Math.round(performance.now() - providerStartedAt),
          })
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let toolCalls = new Map<number, StreamedToolCall>()

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunkCount += 1
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            let finished = false
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed.startsWith('data:')) continue
              const data = trimmed.slice(5).trim()
              if (data === '[DONE]') { finished = true; break }
              try {
                const json = JSON.parse(data)
                // Providers return this field as a string, as an array of content
                // parts, or as a single bare part. Only the first was handled, so
                // the other two reached the browser as raw JSON.
                answeredBy = servedModel(json, answeredBy)
                if (json.choices?.[0]?.finish_reason) finishReason = json.choices[0].finish_reason
                const delta = stripThinkingBlocks(providerContentText(json.choices?.[0]?.delta?.content))
                if (delta) {
                  outputCharacters += delta.length
                  outputText += delta
                  send({ type: 'delta', text: delta })
                }
                toolCalls = accumulateToolCalls(toolCalls, json.choices?.[0]?.delta?.tool_calls)
                const annotations =
                  json.choices?.[0]?.delta?.annotations ||
                  json.choices?.[0]?.message?.annotations ||
                  json.choices?.[0]?.annotations
                for (const source of citationSources(annotations)) sources.set(source.url, source.title)
                if (json.usage && typeof json.usage === 'object') {
                  usage = json.usage as ProviderUsage
                  if (typeof usage.cost === 'number') totalCostUsd += usage.cost
                }
              } catch {
                log.warn('provider.stream.event_ignored', { provider: 'openrouter', model })
              }
            }
            if (finished) break
          }
          return { failed: false, toolCalls: [...toolCalls.values()] }
        }

        const first = await runPass(conversation)
        if (first.failed) return

        /**
         * Exactly one tool round trip, never a loop. A bounded exchange cannot
         * run away with someone's credits, and one pass is all this tool needs:
         * the model writes the document, we make and keep the file, and it gets
         * one turn to say what it produced.
         */
        const documentCalls = documentToolOffered ? first.toolCalls.filter((call) => call.id) : []
        if (documentCalls.length) {
          const toolResults: unknown[] = []
          // Resolved once and reused for every call in this pass: the project's
          // own colours when it has them, else the workspace's saved kit, else
          // undefined — every builder already has a sensible neutral default.
          const brand = await resolveDocumentBrand({
            workspaceKey: requester.context!.workspace.key,
            projectId: projectId || null,
          }).catch(() => undefined)
          for (const call of documentCalls) {
            const parsed = parseToolCall(call)
            if (!parsed.ok) {
              log.warn('chat.tool.rejected', { tool: call.name, reason: parsed.reason })
              toolResults.push({
                role: 'tool', tool_call_id: call.id, name: call.name,
                content: JSON.stringify({ ok: false, error: parsed.reason }),
              })
              continue
            }
            try {
              const document = await renderDocument({
                title: parsed.arguments.title,
                content: parsed.arguments.content,
                format: parsed.arguments.format,
                brand,
              })
              const stored = await persistGeneratedDocument({
                context: requester.context!,
                bytes: document.bytes,
                mimeType: document.mimeType,
                filename: document.filename,
                format: parsed.arguments.format,
                conversationId: sessionId || null,
                projectId: projectId || null,
                metadata: { title: parsed.arguments.title, source: 'chat.create_document' },
              })
              producedFiles.push({
                filename: stored.filename, format: stored.format, byteSize: stored.byteSize,
              })
              log.info('chat.tool.document_created', {
                format: stored.format, bytes: stored.byteSize, assetId: stored.assetId,
              })
              send({
                type: 'attachment',
                assetId: stored.assetId,
                filename: stored.filename,
                title: parsed.arguments.title,
                format: stored.format,
                byteSize: stored.byteSize,
              })
              toolResults.push({
                role: 'tool', tool_call_id: call.id, name: call.name,
                content: JSON.stringify({
                  ok: true, filename: stored.filename, format: stored.format,
                  note: 'The file is attached to this answer and the person can download it.',
                }),
              })
            } catch (error) {
              const reason = error instanceof NoTabularContentError
                ? 'That content has no table in it, so it cannot become a spreadsheet. Offer it as a document instead.'
                : 'The file could not be created.'
              log.error('chat.tool.document_failed', { format: parsed.arguments.format, ...errorDetails(error) })
              toolResults.push({
                role: 'tool', tool_call_id: call.id, name: call.name,
                content: JSON.stringify({ ok: false, error: reason }),
              })
            }
          }

          // Hand the results back so the model can say what it produced.
          const second = await runPass([
            ...conversation,
            {
              role: 'assistant',
              content: outputText || null,
              tool_calls: documentCalls.map((call) => ({
                id: call.id, type: 'function',
                function: { name: call.name, arguments: call.argumentsText },
              })),
            },
            ...toolResults,
          ])
          if (second.failed) return
        }

        appendLiveSources()
        const truncated = wasTruncated(finishReason)
        const leaked = looksLikeLeakedReasoning(outputText)
        if (truncated || leaked) {
          // The person still receives whatever arrived. Recording it is what
          // makes an intermittent provider fault countable instead of a thing
          // one user mentions once.
          log.warn('chat.answer.degraded', {
            model: answeredBy, finishReason, truncated, leakedReasoning: leaked, outputCharacters,
          })
        }
        await recordUsageEventSafe({
          requestId: log.requestId, route: '/api/chat', feature: 'chat', provider: 'openrouter',
          model: answeredBy,
          inputTokens: usage?.prompt_tokens, outputTokens: usage?.completion_tokens,
          actualCostUsd: totalCostUsd || usage?.cost,
          latencyMs: Math.round(performance.now() - providerStartedAt),
          outcome: truncated || leaked ? 'success_degraded' : 'success', metadata: {
            mode, liveWebUsed: sources.size > 0, sourceCount: sources.size,
            webSearchRequests: usage?.server_tool_use?.web_search_requests || 0,
            attachmentCount: attachments.length,
            requestedModel: model, finishReason: finishReason ?? null,
            truncated, leakedReasoning: leaked,
            providerPasses: passes,
            documentsCreated: producedFiles.length,
            documentFormats: producedFiles.map((file) => file.format),
          },
        })
        await gate?.settle('success', totalCostUsd || usage?.cost)
        log.finish(200, {
          outcome: truncated || leaked ? 'success_degraded' : 'success',
          provider: 'openrouter',
          model: answeredBy,
          requestedModel: model,
          finishReason,
          creditsReserved: gate?.reserved,
          chunkCount,
          outputCharacters,
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens: usage?.total_tokens,
          cost: totalCostUsd || usage?.cost,
          webSearchRequests: usage?.server_tool_use?.web_search_requests,
          liveWebUsed: sources.size > 0,
          sourceCount: sources.size,
          providerPasses: passes,
          documentsCreated: producedFiles.length,
        })
        send({ type: 'done' })
        controller.close()
      } catch (error) {
        log.error('chat.stream.failed', errorDetails(error))
        await gate?.settle('failure')
        log.finish(500, { outcome: 'stream_error' })
        send({
          type: 'error',
          code: 'stream_failed',
          message: 'AI360 could not complete this response.',
          retryable: true,
          creditNotice: 'No credits were used for incomplete work.',
          requestId: log.requestId,
        })
        controller.close()
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
