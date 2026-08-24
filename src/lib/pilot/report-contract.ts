export type PilotCohortListItem = {
  cohort: string
  testers: number
  creditsGranted: number
  firstGrantAt: string
  latestGrantAt: string
}

export type PilotTesterMetrics = {
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

export type PilotFeatureMetrics = {
  feature: string
  requests: number
  successfulRequests: number
  failedRequests: number
  providerCostUsd: number
}

export type PilotCohortSummary = {
  testers: number
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

export type PilotCohortReport = {
  cohort: string
  generatedAt: string
  measurementNote: string
  summary: PilotCohortSummary
  features: PilotFeatureMetrics[]
  testers: PilotTesterMetrics[]
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}

export function summarizePilotCohort(
  testers: PilotTesterMetrics[],
  now = new Date(),
): PilotCohortSummary {
  const sevenDaysAgo = now.getTime() - (7 * 24 * 60 * 60 * 1_000)
  const totals = testers.reduce((summary, tester) => {
    const activated = tester.deliveredRequests > 0 ? 1 : 0
    const lastActive = tester.lastActiveAt ? new Date(tester.lastActiveAt).getTime() : 0
    return {
      activated: summary.activated + activated,
      activeLast7Days: summary.activeLast7Days + (lastActive >= sevenDaysAgo ? 1 : 0),
      returning: summary.returning + (tester.activeDays >= 2 ? 1 : 0),
      creditsGranted: summary.creditsGranted + tester.creditsGranted,
      creditsSpent: summary.creditsSpent + tester.creditsSpent,
      accountBalance: summary.accountBalance + tester.accountBalance,
      requests: summary.requests + tester.requests,
      successfulRequests: summary.successfulRequests + tester.successfulRequests,
      failedRequests: summary.failedRequests + tester.failedRequests,
      providerCostUsd: summary.providerCostUsd + tester.providerCostUsd,
    }
  }, {
    activated: 0,
    activeLast7Days: 0,
    returning: 0,
    creditsGranted: 0,
    creditsSpent: 0,
    accountBalance: 0,
    requests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    providerCostUsd: 0,
  })

  return {
    testers: testers.length,
    ...totals,
    providerCostUsd: Number(totals.providerCostUsd.toFixed(6)),
    activationRate: percentage(totals.activated, testers.length),
    returnRate: percentage(totals.returning, testers.length),
    requestSuccessRate: percentage(totals.successfulRequests, totals.requests),
  }
}
