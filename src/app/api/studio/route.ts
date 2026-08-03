import { rateLimit, rejectLargeRequest } from '@/lib/guardrails'
import { providerPreferences, routeFor } from '@/lib/models'
import { errorDetails, providerErrorDetails, requestLogger } from '@/lib/observability'
import { recordUsageEventSafe } from '@/lib/usage'
import { citationSources, LIVE_INFORMATION_TOOLS } from '@/lib/live-tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type BrandFile = {
  name?: string
  kind?: 'image' | 'pdf' | 'text'
  data?: string
  text?: string
}

type Intake = {
  businessName?: string
  industry?: string
  offer?: string
  audience?: string
  goal?: string
  location?: string
  channels?: string[]
  notes?: string
}

type StudioRequest = {
  action?: 'create' | 'regenerate'
  intake?: Intake
  brandFile?: BrandFile
  asset?: { id?: string; title?: string; type?: string; content?: string }
  brand?: unknown
  campaign?: unknown
  instruction?: string
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }

const STUDIO_PROMPT = `You are AI 360 Studio, a practical brand strategist, campaign planner and production coordinator for small businesses.

Create useful, specific deliverables that can be used immediately. Consider the realities of businesses in Ghana and Africa when relevant, including WhatsApp, Facebook, Instagram, TikTok, SMS, Google Business Profile and printable materials.

Rules:
- Return valid JSON only. Do not wrap it in Markdown.
- Never invent facts about the business. Mark reasonable proposals as recommendations.
- Keep copy polished, warm and commercially useful.
- Never use em dashes or en dashes.
- Do not use Markdown bold markers inside short social or SMS copy.
- Do not promise that visual or video files were rendered. A logo item must be a detailed creative direction. A video item must include a production-ready script and scene plan.
- Give every asset a distinct purpose, channel and call to action.
- For a full launch pack, include exactly eight assets covering strategy, messaging, WhatsApp, social, flyer, email or SMS, logo direction and promotional video.
- For a single-asset revision, return only the requested asset object.
- Use live web tools automatically when current market, platform, competitor or public information would materially improve the work.
- When live information is used, include the supporting page title and URL in sources. Otherwise return an empty sources array.
- Output must match the requested JSON structure.`

const PACK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['brand', 'campaign', 'assets', 'sources'],
  properties: {
    brand: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'audience', 'personality', 'voice', 'colors', 'tagline', 'valueProposition'],
      properties: {
        summary: { type: 'string' },
        audience: { type: 'string' },
        personality: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
        voice: { type: 'string' },
        colors: {
          type: 'array',
          minItems: 3,
          maxItems: 4,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'hex', 'role'],
            properties: {
              name: { type: 'string' },
              hex: { type: 'string' },
              role: { type: 'string' },
            },
          },
        },
        tagline: { type: 'string' },
        valueProposition: { type: 'string' },
      },
    },
    campaign: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'objective', 'bigIdea', 'callToAction', 'channels', 'successMeasures'],
      properties: {
        name: { type: 'string' },
        objective: { type: 'string' },
        bigIdea: { type: 'string' },
        callToAction: { type: 'string' },
        channels: { type: 'array', items: { type: 'string' }, minItems: 1 },
        successMeasures: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
      },
    },
    assets: {
      type: 'array',
      minItems: 8,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'title', 'channel', 'purpose', 'content'],
        properties: {
          id: { type: 'string' },
          type: {
            type: 'string',
            enum: ['strategy', 'messaging', 'whatsapp', 'social', 'flyer', 'direct', 'logo', 'video'],
          },
          title: { type: 'string' },
          channel: { type: 'string' },
          purpose: { type: 'string' },
          content: { type: 'string' },
        },
      },
    },
    sources: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'url'],
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
        },
      },
    },
  },
} as const

function clean(value: unknown, max = 2_000) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : ''
}

function cleanIntake(value: Intake | undefined): Intake {
  return {
    businessName: clean(value?.businessName, 120),
    industry: clean(value?.industry, 120),
    offer: clean(value?.offer),
    audience: clean(value?.audience),
    goal: clean(value?.goal),
    location: clean(value?.location, 160),
    channels: Array.isArray(value?.channels)
      ? value.channels.filter((item): item is string => typeof item === 'string').slice(0, 8)
      : [],
    notes: clean(value?.notes),
  }
}

function parseJson(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned)
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

function providerContent(body: StudioRequest, research = '') {
  const intake = cleanIntake(body.intake)
  const researchBlock = research
    ? `\n\nVerified live research for context:\n${research.slice(0, 12_000)}`
    : ''
  const text = body.action === 'regenerate'
    ? `Improve one asset in an existing campaign.

Brand:
${JSON.stringify(body.brand)}

Campaign:
${JSON.stringify(body.campaign)}

Asset to improve:
${JSON.stringify(body.asset)}

User direction:
${clean(body.instruction, 1_000) || 'Make it more specific, polished and ready to use.'}
${researchBlock}

Return JSON with exactly these fields: id, type, title, channel, purpose, content.`
    : `Create a complete Marketing Launch Pack from this business intake:

${JSON.stringify(intake, null, 2)}

If the brand material is incomplete, propose a coherent starting direction and make that clear in the content.${researchBlock}`

  const content: ContentPart[] = [{ type: 'text', text }]
  const file = body.brandFile
  if (body.action !== 'regenerate' && file?.kind === 'image' && file.data) {
    content.push({ type: 'image_url', image_url: { url: file.data } })
  } else if (body.action !== 'regenerate' && file?.kind === 'pdf' && file.data) {
    content.push({
      type: 'file',
      file: { filename: clean(file.name, 160) || 'brand-guide.pdf', file_data: file.data },
    })
  } else if (body.action !== 'regenerate' && file?.kind === 'text' && file.text) {
    content.push({ type: 'text', text: `\n\nBrand material:\n${clean(file.text, 60_000)}` })
  }
  return content
}

function needsLiveResearch(body: StudioRequest, intake: Intake) {
  const context = [
    intake.industry,
    intake.offer,
    intake.audience,
    intake.goal,
    intake.notes,
    body.instruction,
  ].join(' ').toLowerCase()
  return /\b(current|currently|latest|recent|today|tonight|this week|this month|up[- ]to[- ]date|news|event|festival|price|rate|trend|competitor|regulation|law|policy|election|travel|tourism|things to do|market data|statistics)\b/.test(context)
}

function readableContent(value: unknown) {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map((part) =>
      part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text
        : '',
    )
    .join('')
}

function validPack(value: unknown) {
  if (!value || typeof value !== 'object') return false
  const pack = value as { brand?: unknown; campaign?: unknown; assets?: unknown }
  return Boolean(
    pack.brand &&
    typeof pack.brand === 'object' &&
    pack.campaign &&
    typeof pack.campaign === 'object' &&
    Array.isArray(pack.assets) &&
    pack.assets.length === 8,
  )
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/studio')
  const tooLarge = rejectLargeRequest(request, 14_000_000)
  if (tooLarge) {
    log.finish(tooLarge.status, { outcome: 'request_too_large' })
    return new Response(tooLarge.body, { status: tooLarge.status, headers: log.headers(tooLarge.headers) })
  }
  const limited = rateLimit(request, 'studio', { minute: 5, daily: 24 })
  if (limited) {
    log.finish(limited.status, { outcome: 'rate_limited' })
    return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })
  }

  let body: StudioRequest
  try {
    body = await request.json()
  } catch {
    log.finish(400, { outcome: 'invalid_json' })
    return Response.json({ error: 'Invalid Studio request', requestId: log.requestId }, {
      status: 400,
      headers: log.headers(),
    })
  }

  const action = body.action === 'regenerate' ? 'regenerate' : 'create'
  const intake = cleanIntake(body.intake)
  if (action === 'create' && (!intake.businessName || !intake.offer || !intake.audience || !intake.goal)) {
    log.finish(400, { outcome: 'incomplete_intake' })
    return Response.json({
      error: 'Business name, offer, audience and campaign goal are required.',
      requestId: log.requestId,
    }, { status: 400, headers: log.headers() })
  }

  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    log.finish(503, { outcome: 'not_configured' })
    return Response.json({ error: 'AI 360 Studio is not configured', requestId: log.requestId }, {
      status: 503,
      headers: log.headers(),
    })
  }

  const { model, models } = routeFor('auto', { workload: 'studio' })
  const hasPdf = body.brandFile?.kind === 'pdf'
  const startedAt = performance.now()
  let research = ''
  let researchSources: Array<{ title: string; url: string }> = []
  let researchUsage: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    cost?: number
    server_tool_use?: { web_search_requests?: number }
  } | undefined
  log.info('studio.generation.started', {
    action,
    model,
    fallbackModels: models,
    hasBrandFile: Boolean(body.brandFile),
    brandFileKind: body.brandFile?.kind,
    channelCount: intake.channels?.length,
  })

  try {
    if (needsLiveResearch(body, intake)) {
      const researchStartedAt = performance.now()
      log.info('studio.research.started', { action, model })
      try {
        const researchResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
            messages: [
              {
                role: 'system',
                content:
                  'You are the research scout for AI 360 Studio. Use live tools only when useful. Find a small number of current public facts that materially improve this business campaign. Prefer authoritative or primary sources. Summarize findings concisely with descriptive Markdown links. Never invent a source.',
              },
              {
                role: 'user',
                content: `Research the current context relevant to this campaign brief:\n${JSON.stringify(intake, null, 2)}`,
              },
            ],
            tools: LIVE_INFORMATION_TOOLS,
            provider: providerPreferences('studio'),
            max_tokens: 1_200,
          }),
        })
        if (researchResponse.ok) {
          const researchJson = await researchResponse.json()
          research = readableContent(researchJson.choices?.[0]?.message?.content)
          researchSources = citationSources(researchJson.choices?.[0]?.message?.annotations)
          researchUsage = researchJson.usage
          log.info('studio.research.completed', {
            action,
            model,
            durationMs: Math.round(performance.now() - researchStartedAt),
            sourceCount: researchSources.length,
            webSearchRequests: researchJson.usage?.server_tool_use?.web_search_requests,
          })
        } else {
          const failure = await providerErrorDetails(researchResponse)
          log.warn('studio.research.skipped', { action, model, ...failure })
        }
      } catch (error) {
        log.warn('studio.research.skipped', { action, model, ...errorDetails(error) })
      }
    }

    const providerPayload = JSON.stringify({
        model,
        models,
        messages: [
          { role: 'system', content: STUDIO_PROMPT },
          { role: 'user', content: providerContent(body, research) },
        ],
        response_format: action === 'create'
          ? {
              type: 'json_schema',
              json_schema: { name: 'marketing_launch_pack', strict: true, schema: PACK_SCHEMA },
            }
          : { type: 'json_object' },
        max_tokens: action === 'create' ? 6_000 : 1_800,
        provider: providerPreferences('studio'),
        temperature: 0.6,
        plugins: [
          { id: 'response-healing' },
          ...(hasPdf ? [{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }] : []),
        ],
      })
    let response: Response | undefined
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: AbortSignal.timeout(120_000),
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://lab.aithreesixty.tech',
            'X-Title': process.env.OPENROUTER_SITE_NAME || 'AI 360 Lab',
          },
          body: providerPayload,
        })
      } catch (error) {
        if (attempt === 3) throw error
        log.warn('studio.provider.retrying', {
          action,
          model,
          attempt,
          reason: 'network_error',
          ...errorDetails(error),
        })
        await wait(500 * attempt)
        continue
      }
      if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt === 3) break
      const retryFailure = await providerErrorDetails(response)
      log.warn('studio.provider.retrying', {
        action,
        model,
        attempt,
        reason: 'provider_status',
        ...retryFailure,
      })
      await wait(500 * attempt)
    }

    if (!response) throw new Error('Studio provider did not return a response')

    if (!response.ok) {
      const failure = await providerErrorDetails(response)
      log.error('studio.provider.failed', {
        action,
        model,
        durationMs: Math.round(performance.now() - startedAt),
        ...failure,
      })
      log.finish(502, { outcome: 'provider_error', providerStatus: response.status })
      await recordUsageEventSafe({
        requestId: log.requestId, route: '/api/studio', feature: `studio.${action}`,
        provider: 'openrouter', model, latencyMs: Math.round(performance.now() - startedAt),
        outcome: 'provider_error', metadata: { providerStatus: response.status },
      })
      return Response.json({
        error: 'Studio could not produce the campaign pack',
        requestId: log.requestId,
      }, { status: 502, headers: log.headers() })
    }

    const json = await response.json()
    const message = json.choices?.[0]?.message?.content
    const text = typeof message === 'string'
      ? message
      : Array.isArray(message)
        ? message.map((part: { text?: unknown }) => typeof part?.text === 'string' ? part.text : '').join('')
        : ''
    const result = parseJson(text)
    if (action === 'create' && !validPack(result)) {
      throw new Error('Studio provider returned an incomplete campaign structure')
    }
    if (action === 'create') {
      const annotationSources = citationSources(json.choices?.[0]?.message?.annotations)
      const suppliedSources = Array.isArray(result.sources)
        ? result.sources.filter(
            (source: unknown): source is { title: string; url: string } =>
              Boolean(source) &&
              typeof source === 'object' &&
              typeof (source as { title?: unknown }).title === 'string' &&
              typeof (source as { url?: unknown }).url === 'string',
          )
        : []
      result.sources = [...suppliedSources, ...researchSources, ...annotationSources]
        .filter(
          (source, index, sources) =>
            sources.findIndex((candidate) => candidate.url === source.url) === index,
        )
        .slice(0, 8)
    }
    const totalInputTokens = Number(json.usage?.prompt_tokens || 0) + Number(researchUsage?.prompt_tokens || 0)
    const totalOutputTokens = Number(json.usage?.completion_tokens || 0) + Number(researchUsage?.completion_tokens || 0)
    const totalCost = Number(json.usage?.cost || 0) + Number(researchUsage?.cost || 0)
    const latencyMs = Math.round(performance.now() - startedAt)
    await recordUsageEventSafe({
      requestId: log.requestId, route: '/api/studio', feature: `studio.${action}`,
      provider: 'openrouter', model, inputTokens: totalInputTokens, outputTokens: totalOutputTokens,
      actualCostUsd: totalCost, latencyMs, outcome: 'success',
      metadata: {
        researchUsed: Boolean(research),
        webSearchRequests: researchUsage?.server_tool_use?.web_search_requests || 0,
        assetCount: Array.isArray(result.assets) ? result.assets.length : action === 'regenerate' ? 1 : 0,
      },
    })
    log.finish(200, {
      outcome: 'success',
      action,
      model,
      durationMs: latencyMs,
      assetCount: Array.isArray(result.assets) ? result.assets.length : action === 'regenerate' ? 1 : 0,
      totalTokens: json.usage?.total_tokens,
      cost: json.usage?.cost,
      researchTokens: researchUsage?.total_tokens,
      researchCost: researchUsage?.cost,
      webSearchRequests: researchUsage?.server_tool_use?.web_search_requests,
      liveWebUsed: Array.isArray(result.sources) && result.sources.length > 0,
      sourceCount: Array.isArray(result.sources) ? result.sources.length : 0,
    })
    return Response.json({
      result,
      usage: {
        ...json.usage,
        total_tokens: Number(json.usage?.total_tokens || 0) + Number(researchUsage?.total_tokens || 0),
        cost: Number(json.usage?.cost || 0) + Number(researchUsage?.cost || 0),
        server_tool_use: researchUsage?.server_tool_use,
      },
      requestId: log.requestId,
    }, {
      headers: log.headers({ 'Cache-Control': 'no-store' }),
    })
  } catch (error) {
    log.error('studio.generation.failed', { action, ...errorDetails(error) })
    log.finish(500, { outcome: 'generation_error' })
    return Response.json({
      error: 'Studio could not finish this generation',
      requestId: log.requestId,
    }, { status: 500, headers: log.headers() })
  }
}
