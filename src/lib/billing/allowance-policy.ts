export type AllowanceAction = 'keep' | 'refresh_free' | 'invalid_paid_state'

/**
 * Decide whether a workspace allowance should move without touching storage.
 *
 * Paid pilot access is prepaid and manually renewed. A verified payment grants
 * its credits inside the payment transaction, so a calendar boundary must not
 * grant that paid allowance again. Calendar refreshes belong only to Explorer.
 */
export function allowanceAction(input: {
  entitledPlan: string
  accountPlan: string | null
  accountPeriod: string | null
  currentPeriod: string
}): AllowanceAction {
  if (input.entitledPlan !== 'explorer') {
    return input.accountPlan === input.entitledPlan ? 'keep' : 'invalid_paid_state'
  }

  if (input.accountPlan === 'explorer' && input.accountPeriod === input.currentPeriod) {
    return 'keep'
  }

  return 'refresh_free'
}
