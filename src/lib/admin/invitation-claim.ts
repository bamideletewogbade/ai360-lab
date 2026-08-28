import 'server-only'

import { claimInvitationForUser, isMissingAdminInvitationTables } from '@/lib/admin/invitations'
import { grantCredits } from '@/lib/billing/credit-repository'
import { grantSponsoredEntitlement } from '@/lib/billing/sponsored-entitlement'
import { PILOT_INITIAL_CREDITS } from '@/lib/billing/pilot-policy'
import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import { createWorkspaceAuthContext } from '@/lib/workspace'
import { ensureWorkspaceRecord } from '@/lib/workspace-db'
import { errorDetails, logEvent } from '@/lib/observability'

/**
 * Redeems a pending invitation the first time its recipient signs in.
 *
 * This runs in the auth callback rather than in `ensureWorkspaceRecord`, which
 * was the obvious-looking home for it. Two reasons: that function runs on every
 * authenticated write across fifteen call sites, so a lookup there would be
 * paid forever for something that can only happen once; and the starting credit
 * grant opens its own transaction, which cannot be nested inside the one those
 * callers already hold.
 *
 * Nothing here may prevent someone signing in. Every failure is logged and
 * swallowed — an unclaimed invitation can be fixed by an operator, a blocked
 * sign-in cannot be fixed by the person it happened to.
 */
/**
 * The plan an invited participant is placed on.
 *
 * Everyday deliberately: its 120-credit allowance is the exact figure the pilot
 * is testing ("is 120 credits credible at GH₵125?"), so granting the same
 * number makes participants' utilisation directly comparable to the plan being
 * priced. Any other number produces data that answers nothing.
 */
const PILOT_ENTITLEMENT_PLAN = 'everyday'

export async function claimInvitationOnSignIn(input: {
  userId: string
  email: string | null
  displayName: string | null
  imageUrl: string | null
}) {
  if (!isPostgresConfigured() || !input.email) return null

  try {
    const context = createWorkspaceAuthContext({
      userId: input.userId,
      email: input.email,
      displayName: input.displayName,
      imageUrl: input.imageUrl,
    })

    // The membership and the claim both carry foreign keys to `lab_users`, so
    // the identity row has to exist before either is written. On a normal
    // sign-in this is the upsert that would have happened on the first write
    // anyway; here it simply happens a moment earlier.
    const sql = getPostgres()
    await sql.begin(async (tx) => { await ensureWorkspaceRecord(tx, context) })

    const claimed = await claimInvitationForUser({
      email: input.email,
      userId: input.userId,
      displayName: input.displayName,
    })
    if (!claimed) return null

    const cohort = claimed.cohortKey || claimed.programKey

    /**
     * The plan comes first, and it is what carries the allowance.
     *
     * Granting credits alone leaves the person on Explorer, whose fair-use cap
     * is ten chat messages a day. Past that, every further message costs one
     * credit — so a participant's allowance drains on the cheapest thing in the
     * product and never reaches the research, agent and media work the pilot
     * exists to measure. The CLI path was fixed for this; the invitation path,
     * which is the one participants actually arrive through, was not.
     */
    let entitlement: Awaited<ReturnType<typeof grantSponsoredEntitlement>> | null = null
    try {
      entitlement = await grantSponsoredEntitlement({
        context,
        cohort,
        planSlug: PILOT_ENTITLEMENT_PLAN,
        allowanceCredits: PILOT_INITIAL_CREDITS,
      })
    } catch (cause) {
      // Never block a sign-in over this. An operator can grant the seat by
      // hand; a person locked out cannot fix it themselves.
      logEvent('error', 'admin.invitation_entitlement_failed', {
        invitationId: claimed.invitationId,
        ...errorDetails(cause),
      })
    }

    let creditsGranted = entitlement?.granted ? entitlement.credits : 0

    /**
     * `startingCredits` is a top-up *on top of* the plan allowance, not a
     * replacement for it. For this pilot it stays at zero because the sponsored
     * entitlement already grants the deliberately bounded 10-credit allowance.
     * The separate 5-credit follow-up is granted later only to active testers.
     */
    if (claimed.startingCredits > 0) {
      const result = await grantCredits({
        context,
        credits: claimed.startingCredits,
        sourceType: 'sponsored_seat',
        sourceId: cohort,
        // Scoped to the invitation, so a second sign-in cannot double-grant
        // even if the claim itself were somehow replayed.
        idempotencyKey: `invitation:${claimed.invitationId}`,
      })
      if (result.granted) creditsGranted += claimed.startingCredits
    }

    logEvent('info', 'admin.invitation_claimed', {
      invitationId: claimed.invitationId,
      programKey: claimed.programKey,
      cohortKey: claimed.cohortKey,
      creditsGranted,
      plan: entitlement?.granted ? entitlement.plan : 'explorer',
      entitlementRefused: entitlement && !entitlement.granted ? entitlement.reason : null,
    })
    return { ...claimed, creditsGranted }
  } catch (error) {
    logEvent(
      isMissingAdminInvitationTables(error) ? 'warn' : 'error',
      'admin.invitation_claim_failed',
      errorDetails(error),
    )
    return null
  }
}
