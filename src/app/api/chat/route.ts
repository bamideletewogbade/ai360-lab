import type { NextRequest } from 'next/server'
import { isChatMode, isPremiumChatMode, providerPreferences, REASONING_BUDGET, routeFor, SYSTEM_PROMPT, type ChatMode } from '@/lib/models'
import {
  configuredLimit, consumeDailyBucketFallback, rateLimit, rejectLargeRequest, resolveRequester,
  type Requester,
} from '@/lib/guardrails'
import { consumeChatDailyCounter } from '@/lib/chat-daily-cap'
import { errorDetails, providerErrorDetails, requestLogger } from '@/lib/observability'
import { citationSources, LIVE_INFORMATION_TOOLS } from '@/lib/live-tools'
import { recordUsageEventSafe } from '@/lib/usage'
import { openCreditGate } from '@/lib/billing/credit-gate'
import { chatFeature } from '@/lib/billing/credits'
import { readBalance } from '@/lib/billing/credit-repository'
import { productKnowledgeBlock } from '@/lib/product-knowledge'
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
  | { type: 'error'; code: string; message: string; retryable: boolean; creditNotice: string; requestId: string }
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'video_url'; video_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Everyday chat is included with a plan, so its cost is bounded by a daily
 * fair-use cap instead of a credit meter. The cap follows the plan, because a
 * free Explorer workspace must not be able to chat like a paid one. Anonymous
 * callers sit at the Explorer allowance: they cannot buy credits, so over the
 * cap they are asked to sign in rather than overflow onto a balance.
 */
const CHAT_FAIR_USE_DAILY: Record<string, number> = {
  explorer: 10,
  everyday: 60,
  builder: 120,
  team: 150,
}

async function chatFairUseDaily(requester: Requester) {
  const planLimit = !requester.context
    ? CHAT_FAIR_USE_DAILY.explorer
    : await readBalance(requester.context)
        .then((balance) => CHAT_FAIR_USE_DAILY[balance?.plan ?? 'everyday'] ?? 60)
        .catch(() => {
          // The meter must never block chat because the billing database is
          // slow or down; the conservative paid-plan default still bounds cost.
          return 60
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

  let body: { messages?: Msg[]; mode?: ChatMode; sessionId?: string; language?: unknown }
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
        const providerStartedAt = performance.now()
        log.info('provider.request.started', {
          provider: 'openrouter',
          model,
          fallbackModels: models,
          hasPdf: policy.hasPdf,
        })
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
            messages: [
              {
                role: 'system',
                content: `${SYSTEM_PROMPT}\n\n${productKnowledgeBlock()}\n\n${languageDirective(language)}\n\n${policy.liveInformation
                  ? 'Live information tools are available for this request. Use them only where freshness or verification matters.'
                  : 'Live information tools are not enabled for this request. Do not claim that you searched or verified current information.'}`,
              },
              ...messages.map(toProviderMessage),
            ],
            ...(policy.liveInformation ? { tools: LIVE_INFORMATION_TOOLS } : {}),
            provider: providerPreferences('chat', { withTools: policy.liveInformation }),
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
        let outputText = ''
        // Price-sorted routing over the fallback list often serves a different
        // model than the one asked for. Recording the requested model made the
        // usage ledger attribute every cost to the wrong place.
        let answeredBy = model
        let finishReason: string | undefined
        const sources = new Map<string, string>()
        let usage: {
          prompt_tokens?: number
          completion_tokens?: number
          total_tokens?: number
          cost?: number
          server_tool_use?: { web_search_requests?: number }
        } | undefined
        const appendLiveSources = () => {
          const missing = [...sources.entries()].filter(([url]) => !outputText.includes(url))
          if (!missing.length) return
          const block = `\n\n### Live sources\n\n${missing.map(([url, title]) => `- [${title}](${url})`).join('\n')}`
          outputText += block
          outputCharacters += block.length
          send({ type: 'delta', text: block })
        }
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
              appendLiveSources()
              const truncated = wasTruncated(finishReason)
              const leaked = looksLikeLeakedReasoning(outputText)
              if (truncated || leaked) {
                // The person still receives whatever arrived. Recording it is
                // what makes an intermittent provider fault countable instead
                // of a thing one user mentions once.
                log.warn('chat.answer.degraded', {
                  model: answeredBy, finishReason, truncated, leakedReasoning: leaked, outputCharacters,
                })
              }
              await recordUsageEventSafe({
                requestId: log.requestId, route: '/api/chat', feature: 'chat', provider: 'openrouter',
                model: answeredBy,
                inputTokens: usage?.prompt_tokens, outputTokens: usage?.completion_tokens,
                actualCostUsd: usage?.cost, latencyMs: Math.round(performance.now() - providerStartedAt),
                outcome: truncated || leaked ? 'success_degraded' : 'success', metadata: {
                  mode, liveWebUsed: sources.size > 0, sourceCount: sources.size,
                  webSearchRequests: usage?.server_tool_use?.web_search_requests || 0,
                  attachmentCount: attachments.length,
                  requestedModel: model, finishReason: finishReason ?? null,
                  truncated, leakedReasoning: leaked,
                },
              })
              await gate?.settle('success', usage?.cost)
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
                cost: usage?.cost,
                webSearchRequests: usage?.server_tool_use?.web_search_requests,
                liveWebUsed: sources.size > 0,
                sourceCount: sources.size,
              })
              send({ type: 'done' })
              controller.close()
              return
            }
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
              const annotations =
                json.choices?.[0]?.delta?.annotations ||
                json.choices?.[0]?.message?.annotations ||
                json.choices?.[0]?.annotations
              for (const source of citationSources(annotations)) sources.set(source.url, source.title)
              if (json.usage && typeof json.usage === 'object') usage = json.usage
            } catch {
              log.warn('provider.stream.event_ignored', { provider: 'openrouter', model })
            }
          }
        }
        appendLiveSources()
        await recordUsageEventSafe({
          requestId: log.requestId, route: '/api/chat', feature: 'chat', provider: 'openrouter',
          model: answeredBy,
          inputTokens: usage?.prompt_tokens, outputTokens: usage?.completion_tokens,
          actualCostUsd: usage?.cost, latencyMs: Math.round(performance.now() - providerStartedAt),
          outcome: 'success_without_done_event', metadata: {
            mode, sourceCount: sources.size, attachmentCount: attachments.length,
            requestedModel: model, finishReason: finishReason ?? null,
            truncated: wasTruncated(finishReason), leakedReasoning: looksLikeLeakedReasoning(outputText),
          },
        })
        await gate?.settle('success', usage?.cost)
        log.finish(200, {
          outcome: 'success_without_done_event',
          provider: 'openrouter',
          model: answeredBy,
          requestedModel: model,
          finishReason,
          chunkCount,
          outputCharacters,
          totalTokens: usage?.total_tokens,
          cost: usage?.cost,
          webSearchRequests: usage?.server_tool_use?.web_search_requests,
          liveWebUsed: sources.size > 0,
          sourceCount: sources.size,
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
