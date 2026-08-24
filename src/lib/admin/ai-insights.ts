import 'server-only'

import type { AdminAiBriefing, AdminDashboardPayload } from '@/lib/admin/contracts'
import { providerPreferences, routeFor } from '@/lib/models'

const BRIEFING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'summary', 'priorities'],
  properties: {
    headline: { type: 'string', minLength: 3, maxLength: 120 },
    summary: { type: 'string', minLength: 10, maxLength: 700 },
    priorities: {
      type: 'array', minItems: 1, maxItems: 4,
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'evidence', 'action'],
        properties: {
          title: { type: 'string', minLength: 3, maxLength: 100 },
          evidence: { type: 'string', minLength: 3, maxLength: 240 },
          action: { type: 'string', minLength: 3, maxLength: 240 },
        },
      },
    },
  },
} as const

export async function generateAdminAiBriefing(
  dashboard: Omit<AdminDashboardPayload, 'capabilities'>,
): Promise<AdminAiBriefing & { usage: { inputTokens: number; outputTokens: number; costUsd: number } }> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('AI_INSIGHTS_NOT_CONFIGURED')
  const { model, models } = routeFor('auto', { workload: 'studio' })
  const safeEvidence = {
    range: dashboard.range,
    summary: dashboard.summary,
    features: dashboard.features.slice(0, 12),
    errorGroups: dashboard.errors.slice(0, 20).map((error) => ({
      source: error.source, feature: error.feature, route: error.route, provider: error.provider,
      model: error.model, code: error.code, severity: error.severity,
      occurrences: error.occurrences, lastSeenAt: error.lastSeenAt,
    })),
    cohorts: dashboard.cohorts.slice(0, 10),
    deterministicSignals: dashboard.insights,
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(45_000),
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://ai360.africa',
      'X-Title': process.env.OPENROUTER_SITE_NAME || 'AI360',
    },
    body: JSON.stringify({
      model, models,
      messages: [
        {
          role: 'system',
          content: `You are the private operations analyst for AI360. Analyse only the aggregate, metadata-only evidence provided. Never infer private conversation content or invent causes. Lead with the operational conclusion. Prioritize user harm, stuck credits, repeat failures, and provider cost. Every recommendation must cite a number or named error group from the evidence. Keep the briefing concise and practical.`,
        },
        { role: 'user', content: JSON.stringify(safeEvidence) },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'admin_briefing', strict: true, schema: BRIEFING_SCHEMA } },
      provider: providerPreferences('studio'), max_tokens: 1_000, temperature: 0.1,
    }),
  })
  if (!response.ok) throw new Error(`AI_INSIGHTS_PROVIDER_${response.status}`)
  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  }
  const raw = data.choices?.[0]?.message?.content
  const parsed = JSON.parse(typeof raw === 'string' ? raw : '{}') as Omit<AdminAiBriefing, 'generatedAt' | 'model'>
  if (!parsed.headline || !parsed.summary || !Array.isArray(parsed.priorities)) throw new Error('AI_INSIGHTS_INVALID_RESPONSE')
  return {
    generatedAt: new Date().toISOString(), model, headline: parsed.headline,
    summary: parsed.summary, priorities: parsed.priorities,
    usage: {
      inputTokens: Number(data.usage?.prompt_tokens || 0),
      outputTokens: Number(data.usage?.completion_tokens || 0),
      costUsd: Number(data.usage?.cost || 0),
    },
  }
}
