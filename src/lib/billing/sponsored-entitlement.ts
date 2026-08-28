import 'server-only'

import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import type { WorkspaceAuthContext } from '@/lib/workspace'
import { BILLING_CATALOG_VERSION } from '@/lib/billing/catalog'
import { currentBillingPeriod } from '@/lib/billing/credits'
import { ensureCreditWorkspace } from '@/lib/billing/credit-repository'
import { scopedIdempotencyKey } from '@/lib/idempotency'
import {
  decideSponsoredEntitlement,
  DEFAULT_SPONSORED_DAYS,
  SPONSORED_PROVIDER,
  type ActiveSubscription,
  type SponsoredEntitlementRefusal,
} from '@/lib/billing/sponsored-entitlement-policy'

/**
 * Places a workspace on a real plan tier without a payment, for sponsored pilot
 * and programme seats.
 *
 * This deliberately mirrors the verified activation in
 * `payments/payment-repository.ts`: same allowance replacement, same ledger
 * shape, same single transaction. The only differences are the provider name
 * and that no money moved. Anything that diverges here would give sponsored
 * seats a subtly different credit history from paid ones, and the cohort report
 * reads both.
 *
 * The ledger entry keeps `source_type = 'sponsored_seat'` with the cohort as
 * `source_id`, which is exactly what `admin/cohorts.ts` groups on — so a
 * sponsored entitlement appears in the cohort report with no change there.
 */

export type SponsoredEntitlementResult =
  | {
      granted: true
      plan: string
      credits: number
      periodEnd: string
      balanceBefore: number
      balanceAfter: number
    }
  | { granted: false; reason: SponsoredEntitlementRefusal | 'database_not_configured' | 'already_granted' }

function subscriptionRowId(workspaceKey: string) {
  return `sub_sponsored_${workspaceKey}`.slice(0, 200)
}

export async function grantSponsoredEntitlement(input: {
  context: WorkspaceAuthContext
  /** Stable cohort label, e.g. `pilot-2026-09-pro`. Also the ledger source id. */
  cohort: string
  planSlug?: string
  periodDays?: number
  /** Optional programme allowance while preserving the selected plan's access. */
  allowanceCredits?: number
  operatorAudit?: {
    actorId: string
    reason: string
    requestId: string
  }
}): Promise<SponsoredEntitlementResult> {
  if (!isPostgresConfigured()) return { granted: false, reason: 'database_not_configured' }

  const planSlug = input.planSlug ?? 'everyday'
  const periodDays = input.periodDays ?? DEFAULT_SPONSORED_DAYS
  const workspaceKey = input.context.workspace.key
  const key = scopedIdempotencyKey('sponsored-entitlement', workspaceKey, input.cohort)
  const sql = getPostgres()

  return sql.begin(async (tx) => {
    await ensureCreditWorkspace(tx, input.context)

    const active = await tx<{ provider: string; plan_slug: string }[]>`
      select provider, plan_slug from public.lab_subscriptions
       where workspace_key = ${workspaceKey} and status in ('active', 'trialing')
         and current_period_end > now()`
    const activeSubscriptions: ActiveSubscription[] = active.map((row) => ({
      provider: row.provider,
      planSlug: row.plan_slug,
    }))

    const decision = decideSponsoredEntitlement({
      planSlug,
      periodDays,
      allowanceCredits: input.allowanceCredits,
      activeSubscriptions,
    })
    if (!decision.ok) return { granted: false as const, reason: decision.reason }

    // The ledger is checked before anything moves, for the same reason
    // `ensureAllowance` checks it: a balance may only change if the append-only
    // record of that change is written in the same transaction.
    const [existing] = await tx<{ id: string }[]>`
      select id from public.lab_credit_ledger
       where workspace_key = ${workspaceKey} and idempotency_key = ${key} limit 1`
    if (existing) return { granted: false as const, reason: 'already_granted' as const }

    const plan = decision.plan
    const allowanceCredits = decision.allowanceCredits

    const [subscription] = await tx<{ current_period_end: Date }[]>`
      insert into public.lab_subscriptions
        (id, workspace_key, provider, provider_subscription_id, plan_slug,
         catalog_version, cadence, status, current_period_start, current_period_end)
      values
        (${subscriptionRowId(workspaceKey)}, ${workspaceKey}, ${SPONSORED_PROVIDER},
         ${`${SPONSORED_PROVIDER}:${workspaceKey}`}, ${plan.slug}, ${BILLING_CATALOG_VERSION},
         'monthly', 'active', now(), now() + make_interval(days => ${decision.periodDays}::int))
      on conflict (provider, workspace_key) do update
        set plan_slug = excluded.plan_slug,
            catalog_version = excluded.catalog_version,
            status = 'active',
            current_period_start = now(),
            current_period_end = now() + make_interval(days => ${decision.periodDays}::int),
            cancel_at_period_end = false,
            updated_at = now()
      returning current_period_end`
    if (!subscription) throw new Error('SPONSORED_SUBSCRIPTION_NOT_WRITTEN')

    const [account] = await tx<{ available_credits: string; allowance_credits: string }[]>`
      select available_credits, allowance_credits from public.lab_credit_accounts
       where workspace_key = ${workspaceKey} for update`
    if (!account) throw new Error('SPONSORED_CREDIT_ACCOUNT_NOT_FOUND')

    const balanceBefore = Math.max(0, Number(account.available_credits))
    const oldAllowance = Math.max(0, Number(account.allowance_credits))

    // The outgoing allowance is withdrawn before the new one lands, exactly as
    // a paid activation does. Without this a participant keeps their Explorer
    // credits on top of the sponsored allowance and the utilisation figure the
    // pilot is measuring no longer means anything.
    if (oldAllowance > 0) {
      await tx`
        update public.lab_credit_accounts
           set available_credits = greatest(available_credits - ${oldAllowance}, 0),
               allowance_credits = 0, allowance_grant_id = null,
               version = version + 1, updated_at = now()
         where workspace_key = ${workspaceKey}`
      await tx`
        insert into public.lab_credit_ledger
          (workspace_key, entry_type, credits_delta, balance_after, source_type,
           source_id, idempotency_key, metadata)
        select ${workspaceKey}, 'expiry', ${-oldAllowance}, available_credits,
               'plan_replacement', ${input.cohort}, ${`sponsored-expiry:${key}`},
               ${tx.json({ previousAllowance: oldAllowance, cohort: input.cohort })}
          from public.lab_credit_accounts where workspace_key = ${workspaceKey}
        on conflict (idempotency_key) do nothing`
    }

    await tx`
      update public.lab_credit_accounts
         set available_credits = available_credits + ${allowanceCredits},
             allowance_credits = ${allowanceCredits},
             allowance_period = ${currentBillingPeriod()},
             allowance_plan = ${plan.slug},
             allowance_grant_id = ${key},
             version = version + 1, updated_at = now()
       where workspace_key = ${workspaceKey}`
    await tx`
      insert into public.lab_credit_ledger
        (workspace_key, entry_type, credits_delta, balance_after, source_type,
         source_id, idempotency_key, metadata)
      select ${workspaceKey}, 'grant', ${allowanceCredits}, available_credits,
             'sponsored_seat', ${input.cohort}, ${key},
             ${tx.json({
               plan: plan.slug,
               allowanceCredits,
               catalogAllowanceCredits: plan.includedCredits,
               catalogVersion: BILLING_CATALOG_VERSION,
               periodDays: decision.periodDays,
               cohort: input.cohort,
             })}
        from public.lab_credit_accounts where workspace_key = ${workspaceKey}
      on conflict (idempotency_key) do nothing`

    const balanceAfter = Math.max(0, balanceBefore - oldAllowance) + allowanceCredits

    if (input.operatorAudit) {
      const audit = input.operatorAudit
      await tx`
        insert into public.lab_admin_audit_events
          (id, actor_id, target_workspace_key, action, credits_delta, balance_before,
           balance_after, reason, request_id, idempotency_key, metadata)
        values (${`adm_${crypto.randomUUID()}`}, ${audit.actorId}, ${workspaceKey},
                'credit_grant', ${allowanceCredits}, ${balanceBefore}, ${balanceAfter},
                ${audit.reason.slice(0, 240)}, ${audit.requestId.slice(0, 80)}, ${key},
                ${tx.json({ sponsoredPlan: plan.slug, allowanceCredits, cohort: input.cohort })})
        on conflict (idempotency_key) do nothing`
    }

    return {
      granted: true as const,
      plan: plan.slug,
      credits: allowanceCredits,
      periodEnd: new Date(subscription.current_period_end).toISOString(),
      balanceBefore,
      balanceAfter,
    }
  }) as Promise<SponsoredEntitlementResult>
}

/**
 * Ends sponsored access. The workspace falls back to Explorer on its next touch
 * because `resolvePlan` only reads subscriptions that are active and unexpired.
 *
 * Credits already granted are left alone deliberately — they were given, and
 * clawing them back at the end of a pilot would be a hostile way to thank
 * somebody. What stops is the entitlement, and with it the higher daily chat
 * cap and any further allowance refresh.
 */
export async function revokeSponsoredEntitlement(workspaceKey: string) {
  if (!isPostgresConfigured()) return { revoked: false as const, reason: 'database_not_configured' as const }
  const sql = getPostgres()
  const [row] = await sql<{ id: string }[]>`
    update public.lab_subscriptions
       set status = 'canceled', cancel_at_period_end = true, updated_at = now()
     where workspace_key = ${workspaceKey} and provider = ${SPONSORED_PROVIDER}
       and status in ('active', 'trialing')
    returning id`
  return row ? { revoked: true as const, id: row.id } : { revoked: false as const, reason: 'not_found' as const }
}
