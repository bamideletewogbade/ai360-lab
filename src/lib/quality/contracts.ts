import { z } from 'zod'

export const QUALITY_CATEGORIES = [
  'wrong_or_outdated',
  'bad_sources',
  'misunderstood',
  'broken_action',
  'bias_or_disrespect',
  'unsafe_or_harmful',
  'security_or_privacy',
  'slow_or_confusing',
  'feature_request',
  'other',
] as const

export type QualityCategory = typeof QUALITY_CATEGORIES[number]

export const QUALITY_CATEGORY_LABELS: Record<QualityCategory, string> = {
  wrong_or_outdated: 'Wrong or out of date',
  bad_sources: 'Sources do not support the answer',
  misunderstood: 'Did not understand me',
  broken_action: 'An action failed or did the wrong thing',
  bias_or_disrespect: 'Biased or disrespectful',
  unsafe_or_harmful: 'Unsafe or harmful',
  security_or_privacy: 'Privacy or security concern',
  slow_or_confusing: 'Slow or confusing to use',
  feature_request: 'I need a missing feature',
  other: 'Something else',
}

export type QualitySeverity = 's0' | 's1' | 's2' | 's3' | 's4'
export type QualityStatus = 'received' | 'evaluating' | 'human_review' | 'fix_planned' | 'verified' | 'closed'
export type QualityActionType =
  | 'alert_human'
  | 'request_clarification'
  | 'create_eval_case'
  | 'product_review'
  | 'propose_fix'
  | 'contain_capability'

const boundedId = z.string().trim().min(1).max(256).regex(/^[A-Za-z0-9._:-]+$/)

export const feedbackRequestSchema = z.object({
  reportKind: z.enum(['reaction', 'quality', 'safety', 'product']),
  sentiment: z.enum(['helpful', 'needs_work', 'serious']).nullable().optional(),
  category: z.enum(QUALITY_CATEGORIES),
  sourceSurface: z.enum(['quick', 'research', 'studio', 'global', 'other']),
  conversationId: boundedId.nullable().optional(),
  messageId: boundedId.nullable().optional(),
  requestId: boundedId.nullable().optional(),
  runId: boundedId.nullable().optional(),
  comment: z.string().trim().max(2_000).nullable().optional(),
  evidenceScope: z.enum(['none', 'response', 'conversation']).default('none'),
  evidenceExcerpt: z.string().trim().max(12_000).nullable().optional(),
  immediateRisk: z.boolean().default(false),
  contactAllowed: z.boolean().default(false),
  contactEmail: z.string().trim().email().max(254).nullable().optional(),
  clientRelease: z.string().trim().max(120).nullable().optional(),
}).transform((value) => ({
  ...value,
  sentiment: value.sentiment ?? null,
  conversationId: value.conversationId ?? null,
  messageId: value.messageId ?? null,
  requestId: value.requestId ?? null,
  runId: value.runId ?? null,
  comment: value.comment || null,
  evidenceExcerpt: value.evidenceScope === 'none' ? null : value.evidenceExcerpt || null,
  contactEmail: value.contactAllowed ? value.contactEmail || null : null,
  clientRelease: value.clientRelease || null,
}))

export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>

export const qualityReviewUpdateSchema = z.object({
  status: z.enum(['human_review', 'fix_planned', 'verified', 'closed']),
  note: z.string().trim().min(2).max(2_000),
})
