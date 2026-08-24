export const ADMIN_RANGES = ['24h', '7d', '30d', '90d', 'all'] as const

export type AdminRange = (typeof ADMIN_RANGES)[number]
export type AdminUserStatus = 'active' | 'at_risk' | 'dormant'
export type AdminBalanceHealth = 'healthy' | 'low' | 'empty'
export type AdminSeverity = 's0' | 's1' | 's2' | 's3' | 's4'

export type AdminCapabilities = {
  manageCredits: boolean
  runAiInsights: boolean
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
  summary: AdminSummary
  users: AdminUser[]
  features: AdminFeatureMetric[]
  errors: AdminErrorGroup[]
  creditLedger: AdminCreditLedgerEntry[]
  auditEvents: AdminAuditEvent[]
  cohorts: AdminCohortListItem[]
  insights: AdminInsight[]
}

export type AdminUserDetail = {
  user: AdminUser
  creditLedger: AdminCreditLedgerEntry[]
  errors: AdminErrorGroup[]
  auditEvents: AdminAuditEvent[]
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
