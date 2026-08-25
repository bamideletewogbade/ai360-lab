import type { WorkspaceAuthContext } from '@/lib/workspace'

function configuredValues(name: string, normalize = (value: string) => value) {
  return new Set(
    (process.env[name] || '')
      .split(',')
      .map((value) => normalize(value.trim()))
      .filter(Boolean),
  )
}

function matchesIdentity(context: WorkspaceAuthContext, idNames: string[], emailNames: string[]) {
  if (idNames.some((name) => configuredValues(name).has(context.userId))) return true
  const email = context.profile.email?.trim().toLowerCase()
  return Boolean(email && emailNames.some((name) => configuredValues(name, (value) => value.toLowerCase()).has(email)))
}

function isOrganizationAdmin(context: WorkspaceAuthContext) {
  return context.orgRole === 'org:admin' || context.orgRole === 'admin'
}

/** Read access to private, account-level operational data. */
export function isAdminOperator(context: WorkspaceAuthContext | null) {
  if (!context) return false
  return isOrganizationAdmin(context) || matchesIdentity(
    context,
    ['AI360_ADMIN_OPERATOR_IDS', 'AI360_PILOT_OPERATOR_IDS', 'AI360_QUALITY_REVIEWER_IDS'],
    ['AI360_ADMIN_OPERATOR_EMAILS', 'AI360_PILOT_OPERATOR_EMAILS'],
  )
}

/** Mutating balances is deliberately narrower than viewing the console. */
export function canManageAdminCredits(context: WorkspaceAuthContext | null) {
  if (!context) return false
  return isOrganizationAdmin(context) || matchesIdentity(
    context,
    ['AI360_CREDIT_OPERATOR_IDS', 'AI360_ADMIN_OPERATOR_IDS', 'AI360_PILOT_OPERATOR_IDS'],
    ['AI360_CREDIT_OPERATOR_EMAILS', 'AI360_ADMIN_OPERATOR_EMAILS', 'AI360_PILOT_OPERATOR_EMAILS'],
  )
}

/** Cohort and participation changes are separate from financial authority. */
export function canManageAdminPrograms(context: WorkspaceAuthContext | null) {
  if (!context) return false
  return isOrganizationAdmin(context) || matchesIdentity(
    context,
    ['AI360_PROGRAM_OPERATOR_IDS', 'AI360_ADMIN_OPERATOR_IDS', 'AI360_PILOT_OPERATOR_IDS'],
    ['AI360_PROGRAM_OPERATOR_EMAILS', 'AI360_ADMIN_OPERATOR_EMAILS', 'AI360_PILOT_OPERATOR_EMAILS'],
  )
}

/** External communication is deliberately narrower than read access. */
export function canSendAdminEmail(context: WorkspaceAuthContext | null) {
  if (!context) return false
  return isOrganizationAdmin(context) || matchesIdentity(
    context,
    ['AI360_EMAIL_OPERATOR_IDS', 'AI360_ADMIN_OPERATOR_IDS'],
    ['AI360_EMAIL_OPERATOR_EMAILS', 'AI360_ADMIN_OPERATOR_EMAILS'],
  )
}
