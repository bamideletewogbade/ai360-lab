import type {
  FeedbackRequest,
  QualityActionType,
  QualityCategory,
  QualitySeverity,
  QualityStatus,
} from '@/lib/quality/contracts'

export type QualityActionProposal = {
  type: QualityActionType
  summary: string
  requiresHuman: boolean
}

export type QualityTriage = {
  severity: QualitySeverity
  status: QualityStatus
  summary: string
  actions: QualityActionProposal[]
}

const RISK_CATEGORIES: ReadonlySet<QualityCategory> = new Set([
  'unsafe_or_harmful',
  'security_or_privacy',
])

const EVAL_CATEGORIES: ReadonlySet<QualityCategory> = new Set([
  'wrong_or_outdated',
  'bad_sources',
  'misunderstood',
  'broken_action',
  'bias_or_disrespect',
])

export const SEVERITY_RANK: Record<QualitySeverity, number> = {
  s0: 0,
  s1: 1,
  s2: 2,
  s3: 3,
  s4: 4,
}

export function moreUrgentSeverity(left: QualitySeverity, right: QualitySeverity) {
  return SEVERITY_RANK[left] <= SEVERITY_RANK[right] ? left : right
}

export function triageFeedback(input: FeedbackRequest): QualityTriage {
  if (input.sentiment === 'helpful') {
    return {
      severity: 's4',
      status: 'closed',
      summary: 'The customer marked this result as helpful.',
      actions: [],
    }
  }

  const risky = RISK_CATEGORIES.has(input.category)
  const severity: QualitySeverity = input.immediateRisk && risky
    ? 's0'
    : risky || input.sentiment === 'serious'
      ? 's1'
      : EVAL_CATEGORIES.has(input.category)
        ? 's2'
        : 's3'
  const status: QualityStatus = severity === 's0' || severity === 's1' ? 'human_review' : 'evaluating'
  const actions: QualityActionProposal[] = []

  if (severity === 's0' || severity === 's1') {
    actions.push({
      type: 'alert_human',
      summary: severity === 's0' ? 'Ask a human to review this now.' : 'Ask a human to review this urgently.',
      requiresHuman: false,
    })
  }
  if (EVAL_CATEGORIES.has(input.category)) {
    actions.push({
      type: 'create_eval_case',
      summary: 'Prepare a private test case so this failure can be checked before future releases.',
      requiresHuman: false,
    })
  }
  if (input.category === 'feature_request' || input.category === 'slow_or_confusing') {
    actions.push({
      type: 'product_review',
      summary: 'Add this signal to the product review queue.',
      requiresHuman: true,
    })
  }
  if (severity === 's0' && (input.category === 'security_or_privacy' || input.category === 'broken_action')) {
    actions.push({
      type: 'contain_capability',
      summary: 'Consider pausing the affected capability while a human investigates.',
      requiresHuman: true,
    })
  }

  return {
    severity,
    status,
    summary: input.comment || 'The customer reported a problem without adding more detail.',
    actions,
  }
}

export function qualityBenchmark(category: QualityCategory) {
  if (category === 'bad_sources') return 'source support'
  if (category === 'wrong_or_outdated') return 'accuracy and freshness'
  if (category === 'misunderstood') return 'instruction understanding'
  if (category === 'broken_action') return 'tool and action correctness'
  if (category === 'bias_or_disrespect') return 'fair and respectful treatment'
  if (category === 'unsafe_or_harmful' || category === 'security_or_privacy') return 'safety and trust'
  return 'product experience'
}
