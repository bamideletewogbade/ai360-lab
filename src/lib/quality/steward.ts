import 'server-only'

import { z } from 'zod'
import { providerPreferences, REASONING_BUDGET } from '@/lib/models'
import { QUALITY_CATEGORIES, type QualityCategory, type QualitySeverity } from '@/lib/quality/contracts'
import { moreUrgentSeverity, qualityBenchmark } from '@/lib/quality/triage'
import {
  getQualityReportForEvaluation,
  recordHumanAlertResult,
  recordQualityEvaluation,
} from '@/lib/quality/repository'

const evaluationSchema = z.object({
  category: z.enum(QUALITY_CATEGORIES),
  severity: z.enum(['s0', 's1', 's2', 's3', 's4']),
  confidence: z.number().min(0).max(1),
  summary: z.string().trim().min(1).max(500),
  recommendedAction: z.string().trim().min(1).max(500),
  createEvalCase: z.boolean(),
})

function redactForEvaluation(value: string | null) {
  if (!value) return ''
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/(?:\+?233|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, '[phone removed]')
    .replace(/\b(?:sk-or-v1-|sk-)[A-Za-z0-9_-]{12,}\b/gi, '[secret removed]')
    .slice(0, 12_000)
}

function fallbackEvaluation(report: NonNullable<Awaited<ReturnType<typeof getQualityReportForEvaluation>>>) {
  const summary = report.comment
    ? redactForEvaluation(report.comment).slice(0, 500)
    : `A customer reported a ${qualityBenchmark(report.category)} problem.`
  return {
    category: report.category,
    severity: report.severity,
    confidence: 1,
    summary,
    recommendedAction: report.severity === 's0' || report.severity === 's1'
      ? 'A human should review the evidence and decide the next step.'
      : 'Reproduce the issue, confirm the cause and add a regression check before release.',
    createEvalCase: ['wrong_or_outdated', 'bad_sources', 'misunderstood', 'broken_action', 'bias_or_disrespect'].includes(report.category),
  }
}

async function modelEvaluation(report: NonNullable<Awaited<ReturnType<typeof getQualityReportForEvaluation>>>) {
  const key = process.env.OPENROUTER_API_KEY
  if (!key || (!report.comment && !report.evidence_excerpt)) return null
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(25_000),
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://ai360.africa',
      'X-Title': 'AI360 Quality Steward',
    },
    body: JSON.stringify({
      model: process.env.AI360_QUALITY_EVALUATOR_MODEL || 'openai/gpt-5.6-luna',
      provider: providerPreferences('chat'),
      reasoning: { ...REASONING_BUDGET, max_tokens: 128 },
      response_format: { type: 'json_object' },
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: `You are the AI360 Quality Steward. Evaluate a customer report, not the customer. Use plain language. Never dismiss a safety or privacy concern. Return JSON only with category, severity, confidence, summary, recommendedAction and createEvalCase. Severity is s0 immediate danger or likely active breach, s1 urgent harm or privacy concern, s2 quality failure, s3 product experience, s4 positive signal. You may recommend action but never claim to have contacted anyone, changed production or resolved the case.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            reportedCategory: report.category,
            rulesSeverity: report.severity,
            surface: report.source_surface,
            comment: redactForEvaluation(report.comment),
            evidence: redactForEvaluation(report.evidence_excerpt),
          }),
        },
      ],
    }),
  })
  if (!response.ok) return null
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = body.choices?.[0]?.message?.content
  if (!content) return null
  try {
    return evaluationSchema.parse(JSON.parse(content))
  } catch {
    return null
  }
}

async function alertHuman(input: {
  id: string
  severity: QualitySeverity
  category: QualityCategory
  summary: string
}) {
  const url = process.env.AI360_QUALITY_ALERT_WEBHOOK_URL
  if (!url) {
    await recordHumanAlertResult(input.id, false)
    return
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'quality.human_attention_needed',
        reportId: input.id,
        severity: input.severity,
        category: input.category,
        summary: input.summary,
        reviewUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://ai360.africa'}/quality`,
      }),
    })
    await recordHumanAlertResult(input.id, response.ok)
  } catch {
    await recordHumanAlertResult(input.id, false)
  }
}

export async function evaluateQualityReport(id: string) {
  const report = await getQualityReportForEvaluation(id)
  if (!report || report.status === 'closed') return
  const fallback = fallbackEvaluation(report)
  const model = await modelEvaluation(report).catch(() => null)
  const evaluation = model ?? fallback
  const severity = moreUrgentSeverity(report.severity, evaluation.severity)
  const category = evaluation.category

  await recordQualityEvaluation({
    id,
    severity,
    category,
    summary: evaluation.summary,
    confidence: evaluation.confidence,
    recommendedAction: evaluation.recommendedAction,
    createEvalCase: evaluation.createEvalCase,
    proposeFix: severity === 's2',
  })
  if (severity === 's0' || severity === 's1') {
    await alertHuman({ id, severity, category, summary: evaluation.summary })
  }
}

