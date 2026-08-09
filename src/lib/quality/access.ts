import type { WorkspaceAuthContext } from '@/lib/workspace'

function configuredReviewers() {
  return new Set(
    (process.env.AI360_QUALITY_REVIEWER_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

export function isQualityReviewer(context: WorkspaceAuthContext | null) {
  if (!context) return false
  if (configuredReviewers().has(context.userId)) return true
  return context.orgRole === 'org:admin' || context.orgRole === 'admin'
}

