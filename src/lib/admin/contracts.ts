export const ADMIN_RANGES = ['24h', '7d', '30d', '90d', 'all'] as const

export type AdminRange = (typeof ADMIN_RANGES)[number]
export type AdminUserStatus = 'active' | 'at_risk' | 'dormant'
export type AdminBalanceHealth = 'healthy' | 'low' | 'empty'
export type AdminSeverity = 's0' | 's1' | 's2' | 's3' | 's4'
export type AdminParticipationStatus = 'invited' | 'enrolled' | 'activated' | 'returning' | 'completed' | 'withdrawn'
export type AdminFeedbackStatus = 'not_requested' | 'requested' | 'received' | 'reviewed'
export type AdminEmailStatus = 'contactable' | 'unsubscribed' | 'suppressed'

export type AdminInviteStatus = 'pending' | 'sent' | 'accepted' | 'bounced' | 'revoked'

/**
 * Why an imported address will or will not become an invitation. Everything
 * except `new` is a reason the row is skipped, and the operator sees all of
 * them before anything is written.
 */
export type AdminImportDisposition =
  | 'new'
  | 'already_invited'
  | 'already_a_user'
  | 'invalid_email'
  | 'duplicate_in_file'
  | 'missing_email'

export type AdminCapabilities = {
  manageCredits: boolean
  managePrograms: boolean
  sendParticipantEmail: boolean
  /** Importing a list needs the invitation tables, not just program rights. */
  importParticipants: boolean
  /** Sending one additionally needs a mail provider and a service-role key. */
  sendInvitations: boolean
  runAiInsights: boolean
}

export type AdminInfrastructure = {
  auditTrailReady: boolean
  programOperationsReady: boolean
  invitationsReady: boolean
}

/**
 * A pending participant: an intent to enrol somebody who has no account yet.
 * Once claimed at sign-in this is superseded by an `AdminProgramMembership`.
 */
export type AdminInvitation = {
  id: string
  programKey: string
  email: string
  displayName: string | null
  cohortKey: string | null
  participationStatus: 'invited' | 'enrolled'
  startingCredits: number
  inviteStatus: AdminInviteStatus
  claimedUserId: string | null
  invitedBy: string | null
  importKey: string | null
  sentAt: string | null
  acceptedAt: string | null
  lastAttemptAt: string | null
  sendAttempts: number
  createdAt: string
  updatedAt: string
}

export type AdminImportPreviewRow = {
  email: string
  displayName: string | null
  cohortKey: string | null
  line: number
  disposition: AdminImportDisposition
}

export type AdminImportPreview = {
  format: 'csv' | 'list'
  truncated: boolean
  /** Rows that would create an invitation. */
  ready: AdminImportPreviewRow[]
  /** Rows that would not, each carrying the reason and its source line. */
  skipped: AdminImportPreviewRow[]
  counts: Record<AdminImportDisposition, number>
}

export type AdminProgramMembership = {
  programKey: string
  cohortKey: string | null
  participationStatus: AdminParticipationStatus
  feedbackStatus: AdminFeedbackStatus
  emailStatus: AdminEmailStatus
  assignedTo: string | null
  nextFollowUpAt: string | null
  internalNote: string | null
  invitedAt: string | null
  enrolledAt: string | null
  lastContactedAt: string | null
  contactCount: number
  updatedAt: string
}

export type AdminContactEvent = {
  id: string
  programKey: string
  userId: string
  actorId: string | null
  channel: 'email' | 'manual'
  templateKey: string
  subject: string
  deliveryStatus: 'prepared' | 'sent' | 'failed' | 'skipped'
  providerMessageId: string | null
  failureReason: string | null
  createdAt: string
}

export type AdminUser = {
  id: string
  workspaceKey: string
  email: string
  displayName: string | null
  createdAt: string
  status: AdminUserStatus
  balanceHealth: AdminBalanceHealth
  availableCredits: number
  reservedCredits: number
  allowanceCredits: number
  plan: string
  creditsSpent: number
  requests: number
  successfulRequests: number
  failedRequests: number
  providerCostUsd: number
  activeDays: number
  lastActiveAt: string | null
  recentErrorAt: string | null
  qualityReports: number
  projects: number
  cohorts: string[]
  features: string[]
  participation: AdminProgramMembership | null
}

export type AdminSummary = {
  users: number
  activeUsers: number
  atRiskUsers: number
  dormantUsers: number
  availableCredits: number
  reservedCredits: number
  creditsSpent: number
  requests: number
  successfulRequests: number
  failedRequests: number
  requestSuccessRate: number
  providerCostUsd: number
  lowBalanceUsers: number
  openQualityReports: number
  heldReservations: number
  staleReservations: number
}

export type AdminFeatureMetric = {
  feature: string
  requests: number
  successfulRequests: number
  failedRequests: number
  successRate: number
  affectedUsers: number
  averageLatencyMs: number
  providerCostUsd: number
}

export type AdminMediaFinanceMetric = {
  mediaType: 'image' | 'video'
  settledJobs: number
  chargedJobs: number
  chargedCredits: number
  averageCreditsCharged: number
  providerCharges: number
  providerCostUsd: number
  averageProviderCostUsd: number
  landedCostGhs: number
  averageLandedCostGhs: number
  referenceBilledGhs: number
  grossProfitGhs: number
  grossMarginPercent: number | null
}

export type AdminMediaFinanceLine = {
  id: string
  userId: string | null
  email: string | null
  displayName: string | null
  mediaType: 'image' | 'video'
  model: string | null
  status: string
  chargedCredits: number
  providerCostUsd: number
  landedCostGhs: number
  referenceBilledGhs: number
  grossProfitGhs: number
  grossMarginPercent: number | null
  occurredAt: string
}

export type AdminCreditRate = {
  id: string
  name: string
  kind: 'free' | 'plan' | 'top_up'
  priceGhs: number
  credits: number
  pricePerCreditGhs: number | null
  fullUseCostGhs: number
  grossProfitGhs: number | null
  grossMarginPercent: number | null
}

export type AdminFinance = {
  cashCollectedGhs: number
  approvedPayments: number
  chargedCredits: number
  providerCostUsd: number
  landedCostGhs: number
  referenceBilledGhs: number
  grossProfitGhs: number
  grossMarginPercent: number | null
  cashGrossProfitGhs: number
  cashGrossMarginPercent: number | null
  media: AdminMediaFinanceMetric[]
  recentMedia: AdminMediaFinanceLine[]
  creditRates: AdminCreditRate[]
  calculation: {
    referencePlanName: string
    referencePlanPriceGhs: number
    referencePlanCredits: number
    referenceCreditPriceGhs: number
    costBudgetPerCreditGhs: number
    unitGrossProfitGhs: number
    unitGrossMarginPercent: number
    targetProviderCostPercent: number
    usdToGhs: number
    providerFeePercent: number
    fxBufferPercent: number
    imageFloorCredits: number
    videoFloorCredits: number
  }
}

export type AdminErrorGroup = {
  id: string
  source: 'technical' | 'customer'
  userId: string | null
  email: string | null
  displayName: string | null
  feature: string
  route: string | null
  provider: string | null
  model: string | null
  code: string
  message: string
  severity: AdminSeverity
  status: string
  requestId: string | null
  occurrences: number
  firstSeenAt: string
  lastSeenAt: string
}

export type AdminCreditLedgerEntry = {
  id: string
  userId: string | null
  email: string | null
  displayName: string | null
  entryType: string
  creditsDelta: number
  balanceAfter: number
  sourceType: string
  sourceId: string
  createdAt: string
}

export type AdminAuditEvent = {
  id: string
  actorId: string | null
  actorEmail: string | null
  targetUserId: string | null
  targetEmail: string | null
  action: string
  creditsDelta: number
  balanceBefore: number
  balanceAfter: number
  reason: string
  requestId: string
  createdAt: string
}

export type AdminCohortListItem = {
  cohort: string
  users: number
  creditsGranted: number
  firstGrantAt: string
  latestGrantAt: string
}

export type AdminCohortUserMetrics = {
  userId: string
  email: string
  displayName: string | null
  grantAt: string
  creditsGranted: number
  creditsSpent: number
  accountBalance: number
  activeDays: number
  firstActiveAt: string | null
  lastActiveAt: string | null
  conversations: number
  messages: number
  userMessages: number
  projects: number
  agentRuns: number
  mediaJobs: number
  images: number
  videos: number
  files: number
  requests: number
  deliveredRequests: number
  successfulRequests: number
  failedRequests: number
  providerCostUsd: number
}

export type AdminCohortSummary = {
  users: number
  activated: number
  activeLast7Days: number
  returning: number
  creditsGranted: number
  creditsSpent: number
  accountBalance: number
  requests: number
  successfulRequests: number
  failedRequests: number
  providerCostUsd: number
  activationRate: number
  returnRate: number
  requestSuccessRate: number
}

export type AdminCohortReport = {
  cohort: string
  generatedAt: string
  measurementNote: string
  summary: AdminCohortSummary
  features: AdminFeatureMetric[]
  users: AdminCohortUserMetrics[]
}

export type AdminInsight = {
  id: string
  tone: 'critical' | 'watch' | 'opportunity' | 'healthy'
  title: string
  summary: string
  evidence: string
  suggestedAction: string
}

export type AdminDashboardPayload = {
  generatedAt: string
  range: AdminRange
  capabilities: AdminCapabilities
  infrastructure: AdminInfrastructure
  summary: AdminSummary
  users: AdminUser[]
  features: AdminFeatureMetric[]
  finance: AdminFinance
  errors: AdminErrorGroup[]
  creditLedger: AdminCreditLedgerEntry[]
  auditEvents: AdminAuditEvent[]
  cohorts: AdminCohortListItem[]
  invitations: AdminInvitation[]
  insights: AdminInsight[]
}

export type AdminUserDetail = {
  user: AdminUser
  creditLedger: AdminCreditLedgerEntry[]
  errors: AdminErrorGroup[]
  auditEvents: AdminAuditEvent[]
  contactEvents: AdminContactEvent[]
}

export type AdminAiBriefing = {
  generatedAt: string
  model: string
  headline: string
  summary: string
  priorities: Array<{
    title: string
    evidence: string
    action: string
  }>
}

export function parseAdminRange(value: string | null | undefined): AdminRange {
  return ADMIN_RANGES.includes(value as AdminRange) ? value as AdminRange : '30d'
}

export function adminRangeStart(range: AdminRange, now = new Date()) {
  if (range === 'all') return null
  const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : range === '30d' ? 24 * 30 : 24 * 90
  return new Date(now.getTime() - hours * 60 * 60 * 1_000)
}

export function adminUserStatus(lastActiveAt: string | null, now = new Date()): AdminUserStatus {
  if (!lastActiveAt) return 'dormant'
  const ageDays = (now.getTime() - new Date(lastActiveAt).getTime()) / (24 * 60 * 60 * 1_000)
  if (ageDays <= 7) return 'active'
  if (ageDays <= 30) return 'at_risk'
  return 'dormant'
}

export function adminBalanceHealth(available: number): AdminBalanceHealth {
  if (available <= 0) return 'empty'
  if (available <= 10) return 'low'
  return 'healthy'
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}

export function summarizeAdminCohort(users: AdminCohortUserMetrics[], now = new Date()): AdminCohortSummary {
  const sevenDaysAgo = now.getTime() - (7 * 24 * 60 * 60 * 1_000)
  const totals = users.reduce((summary, user) => ({
    activated: summary.activated + (user.deliveredRequests > 0 ? 1 : 0),
    activeLast7Days: summary.activeLast7Days + (user.lastActiveAt && new Date(user.lastActiveAt).getTime() >= sevenDaysAgo ? 1 : 0),
    returning: summary.returning + (user.activeDays >= 2 ? 1 : 0),
    creditsGranted: summary.creditsGranted + user.creditsGranted,
    creditsSpent: summary.creditsSpent + user.creditsSpent,
    accountBalance: summary.accountBalance + user.accountBalance,
    requests: summary.requests + user.requests,
    successfulRequests: summary.successfulRequests + user.successfulRequests,
    failedRequests: summary.failedRequests + user.failedRequests,
    providerCostUsd: summary.providerCostUsd + user.providerCostUsd,
  }), {
    activated: 0, activeLast7Days: 0, returning: 0, creditsGranted: 0, creditsSpent: 0,
    accountBalance: 0, requests: 0, successfulRequests: 0, failedRequests: 0, providerCostUsd: 0,
  })

  return {
    users: users.length,
    ...totals,
    providerCostUsd: Number(totals.providerCostUsd.toFixed(6)),
    activationRate: percentage(totals.activated, users.length),
    returnRate: percentage(totals.returning, users.length),
    requestSuccessRate: percentage(totals.successfulRequests, totals.requests),
  }
}
