import { rateLimit, rejectLargeRequest, resolveRequester } from '@/lib/guardrails'
import { providerPreferences, routeFor } from '@/lib/models'
import { requestLogger } from '@/lib/observability'
import { isPackId } from '@/lib/studio/packs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'packId', 'ready', 'missing', 'intake'],
  properties: {
    reply: { type: 'string' },
    packId: { type: 'string', enum: ['launch', 'marketing', 'ads', 'naming', 'pitch', 'calendar'] },
    ready: { type: 'boolean' },
    missing: { type: 'array', items: { type: 'string' } },
    intake: {
      type: 'object',
      additionalProperties: false,
      required: ['businessName', 'industry', 'offer', 'audience', 'goal', 'location', 'channels', 'notes'],
      properties: {
        businessName: { type: 'string' },
        industry: { type: 'string' },
        offer: { type: 'string' },
        audience: { type: 'string' },
        goal: { type: 'string' },
        location: { type: 'string' },
        channels: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
    },
  },
} as const

function clean(value: unknown, max = 12_000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/studio/brief')
  const tooLarge = rejectLargeRequest(request, 200_000)
  if (tooLarge) return new Response(tooLarge.body, { status: tooLarge.status, headers: log.headers(tooLarge.headers) })

  const requester = await resolveRequester(request)
  const limited = rateLimit(request, 'chat', { minute: 12, daily: 120 }, requester)
  if (limited) return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })

  let body: { message?: unknown; intake?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Tell AI360 what you want to build.' }, { status: 400, headers: log.headers() })
  }
  const message = clean(body.message)
  if (!message) return Response.json({ error: 'Tell AI360 what you want to build.' }, { status: 400, headers: log.headers() })

  const key = process.env.OPENROUTER_API_KEY
  if (!key) return Response.json({ error: 'Project setup is not configured.' }, { status: 503, headers: log.headers() })

  const { model, models } = routeFor('auto', { workload: 'studio' })
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(45_000),
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://lab.aithreesixty.tech',
        'X-Title': process.env.OPENROUTER_SITE_NAME || 'AI360 Lab',
      },
      body: JSON.stringify({
        model,
        models,
        messages: [
          {
            role: 'system',
            content: `You are the project guide inside AI360. Turn an ordinary conversation into a useful project brief.
Keep every fact already present in the current brief. Add facts from the new message. Do not invent names, prices, audiences or channels.
Choose the internal route silently: launch for a new business or full launch, marketing for a campaign, ads for paid ads, naming for names/domains, pitch for a pitch or proposal, calendar for a content schedule.
A brief is ready only when businessName, offer, audience and goal are specific and at least one channel is known. If it is not ready, ask one short natural question that gathers the most important missing details together. Never mention packs, modes, specialists, schemas or required fields.
If ready, reply with a concise summary and say the person can review the brief and start the build. Use plain language. Do not use em dashes.`,
          },
          { role: 'user', content: `Current brief:\n${JSON.stringify(body.intake || {})}\n\nNew message:\n${message}` },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'project_brief', strict: true, schema: BRIEF_SCHEMA } },
        provider: providerPreferences('studio'),
        max_tokens: 1_100,
        temperature: 0.2,
      }),
    })
    if (!response.ok) throw new Error(`Provider returned ${response.status}`)
    const data = await response.json()
    const raw = data.choices?.[0]?.message?.content
    const parsed = JSON.parse(typeof raw === 'string' ? raw : '{}')
    if (!isPackId(parsed.packId) || !parsed.intake || typeof parsed.reply !== 'string') throw new Error('Invalid project brief')
    log.finish(200, { outcome: 'success', model, packId: parsed.packId, ready: Boolean(parsed.ready) })
    return Response.json(parsed, { headers: log.headers() })
  } catch (error) {
    log.error('studio.brief.failed', { message: error instanceof Error ? error.message : 'unknown' })
    log.finish(502, { outcome: 'provider_failed' })
    return Response.json({ error: 'AI360 could not update the brief. Please try again.' }, { status: 502, headers: log.headers() })
  }
}
