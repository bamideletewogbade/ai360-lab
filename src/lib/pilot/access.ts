import type { WorkspaceAuthContext } from '@/lib/workspace'

function configuredValues(name: string, normalize = (value: string) => value) {
  return new Set(
    (process.env[name] || '')
      .split(',')
      .map((value) => normalize(value.trim()))
      .filter(Boolean),
  )
}

/**
 * Cohort reporting contains customer email addresses and account-level usage,
 * so access is an explicit server-side allowlist rather than a public flag.
 */
export function isPilotOperator(context: WorkspaceAuthContext | null) {
  if (!context) return false

  const operatorIds = configuredValues('AI360_PILOT_OPERATOR_IDS')
  const reviewerIds = configuredValues('AI360_QUALITY_REVIEWER_IDS')
  if (operatorIds.has(context.userId) || reviewerIds.has(context.userId)) return true

  const email = context.profile.email?.trim().toLowerCase()
  const operatorEmails = configuredValues('AI360_PILOT_OPERATOR_EMAILS', (value) => value.toLowerCase())
  if (email && operatorEmails.has(email)) return true

  return context.orgRole === 'org:admin' || context.orgRole === 'admin'
}
