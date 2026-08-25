import 'server-only'

import { claimInvitationForUser, isMissingAdminInvitationTables } from '@/lib/admin/invitations'
import { grantCredits } from '@/lib/billing/credit-repository'
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

    let creditsGranted = 0
    if (claimed.startingCredits > 0) {
      const result = await grantCredits({
        context,
        credits: claimed.startingCredits,
        sourceType: 'sponsored_seat',
        sourceId: claimed.cohortKey || claimed.programKey,
        // Scoped to the invitation, so a second sign-in cannot double-grant
        // even if the claim itself were somehow replayed.
        idempotencyKey: `invitation:${claimed.invitationId}`,
      })
      if (result.granted) creditsGranted = claimed.startingCredits
    }

    logEvent('info', 'admin.invitation_claimed', {
      invitationId: claimed.invitationId,
      programKey: claimed.programKey,
      cohortKey: claimed.cohortKey,
      creditsGranted,
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
