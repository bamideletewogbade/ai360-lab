import { createHash } from 'node:crypto'
import { rateLimit, rejectLargeRequest, resolveRequester } from '@/lib/guardrails'
import { providerPreferences, routeFor } from '@/lib/models'
import { routeIntentDeterministically, type IntentRoute } from '@/lib/intent-router'
import { requestLogger } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ROUTER_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['route', 'reason'],
  properties: {
    route: { type: 'string', enum: ['chat', 'research', 'project'] },
    reason: { type: 'string', enum: ['answer_or_write', 'needs_current_evidence', 'durable_multi_step_outcome'] },
  },
} as const

function isIntentRoute(value: unknown): value is IntentRoute {
  return value === 'chat' || value === 'research' || value === 'project'
}

export async function POST(request: Request) {
  const log = requestLogger(request, '/api/route-intent')
  const tooLarge = rejectLargeRequest(request, 60_000)
  if (tooLarge) return new Response(tooLarge.body, { status: tooLarge.status, headers: log.headers(tooLarge.headers) })
  const requester = await resolveRequester(request)
  const limited = rateLimit(request, 'chat', { minute: 30, daily: 300 }, requester)
  if (limited) return new Response(limited.body, { status: limited.status, headers: log.headers(limited.headers) })

  const body = await request.json().catch(() => null) as { prompt?: unknown } | null
  const prompt = typeof body?.prompt === 'string' ? body.prompt.replace(/\s+/g, ' ').trim().slice(0, 20_000) : ''
  if (!prompt) return Response.json({ error: 'A request is required.' }, { status: 400, headers: log.headers() })

  const fallback = routeIntentDeterministically(prompt)
  const rollout = process.env.AI360_ROUTER_MODE === 'active'
    ? 'active'
    : process.env.AI360_ROUTER_MODE === 'shadow' ? 'shadow' : 'off'
  let candidate: IntentRoute | null = null

  if (fallback.ambiguous && rollout !== 'off' && process.env.OPENROUTER_API_KEY) {
    try {
      const { model, models } = routeFor('auto', { workload: 'chat' })
      const provider = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://lab.aithreesixty.tech',
          'X-Title': process.env.OPENROUTER_SITE_NAME || 'AI360',
        },
        body: JSON.stringify({
          model, models,
          messages: [{
            role: 'system',
            content: `Route the person's first request to one AI360 capability.
chat: a direct answer, explanation, rewriting, brainstorming or ordinary file help.
research: the answer depends on current public evidence, multiple sources, comparison or verification.
project: the person wants a durable multi-step business outcome with a brief, staged production, review and reusable deliverables.
Classify intent, not keywords. Work with Ghanaian English, code-switching and imperfect spelling. Do not assume a project only because the request is long.`,
          }, { role: 'user', content: prompt }],
          response_format: { type: 'json_schema', json_schema: { name: 'intent_route', strict: true, schema: ROUTER_SCHEMA } },
          provider: providerPreferences('chat'), temperature: 0, max_tokens: 120,
        }),
      })
      if (provider.ok) {
        const data = await provider.json()
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}')
        if (isIntentRoute(parsed.route)) candidate = parsed.route
      }
    } catch {
      // Provider failure leaves the deterministic route in control.
    }
  }

  const chosen = rollout === 'active' && candidate ? candidate : fallback.route
  log.info('intent.routed', {
    promptHash: createHash('sha256').update(prompt).digest('hex').slice(0, 16),
    fallback: fallback.route, candidate, chosen, rollout,
    reason: fallback.reason, signals: fallback.signals,
  })
  log.finish(200, { outcome: 'success', chosen, rollout })
  return Response.json({
    route: chosen,
    source: rollout === 'active' && candidate ? 'model' : 'fallback',
    evaluation: candidate ? { candidate, agreed: candidate === fallback.route } : null,
  }, { headers: log.headers({ 'Cache-Control': 'no-store' }) })
}
