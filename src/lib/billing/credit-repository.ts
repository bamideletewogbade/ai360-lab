import type { TransactionSql } from 'postgres'
import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import type { WorkspaceAuthContext } from '@/lib/workspace'
import {
  allocateCreditRelease,
  currentBillingPeriod,
  reservationTtlSeconds,
  type CreditEstimate,
  type CreditFeature,
  settleCredits,
} from '@/lib/billing/credits'
import { findBillingPlan } from '@/lib/billing/catalog'
import { allowanceAction } from '@/lib/billing/allowance-policy'
import { scopedIdempotencyKey } from '@/lib/idempotency'
import { ensureWorkspaceRecord } from '@/lib/workspace-db'

/**
 * Durable side of the credit engine, on Supabase Postgres.
 *
 * `credits.ts` decides what work costs. This module is the only place that
 * moves a balance, and every movement is written twice: once to the account
 * row the request path reads, and once to the append-only ledger that billing
 * disputes are settled from.
 *
 * Reservations expire. If a process dies mid-task the held credits would
 * otherwise be stranded forever, so a held reservation past `expires_at` is
 * reclaimed on the next touch of that workspace.
 */

export type CreditBalance = {
  available: number
  reserved: number
  /** How much of `available` is this month's allowance and will expire. */
  allowance: number
  plan: string
  period: string
}

export type ReservationResult =
  | { ok: true; reservationId: string; reserved: number; balance: CreditBalance }
  | { ok: false; reason: 'insufficient_credits'; required: number; balance: CreditBalance }
  | { ok: false; reason: 'database_not_configured' }
  | { ok: false; reason: 'already_reserved'; reservationId: string }

export type SettlementResult =
  | { ok: true; charged: number; released: number; expired: number; balance: CreditBalance }
  | { ok: false; reason: 'unknown_reservation' | 'not_held' | 'database_not_configured' }

export function isCreditLedgerConfigured() {
  return isPostgresConfigured()
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Values a ledger entry may record. Kept scalar so the row stays queryable. */
type LedgerMetadata = Record<string, string | number | boolean | null>

/** Identity rows must exist before anything can reference the workspace. */
async function ensureWorkspace(sql: TransactionSql, context: WorkspaceAuthContext) {
  await ensureWorkspaceRecord(sql, context)
  await sql`
    insert into public.lab_credit_accounts (workspace_key) values (${context.workspace.key})
    on conflict (workspace_key) do nothing`
}

async function writeLedger(sql: TransactionSql, entry: {
  workspaceKey: string
  entryType: 'grant' | 'reservation' | 'settlement' | 'release' | 'top_up' | 'refund' | 'adjustment' | 'expiry'
  creditsDelta: number
  sourceType: string
  sourceId: string
  idempotencyKey: string
  metadata?: LedgerMetadata
}) {
  await sql`
    insert into public.lab_credit_ledger
      (workspace_key, entry_type, credits_delta, balance_after, source_type, source_id, idempotency_key, metadata)
    select ${entry.workspaceKey}, ${entry.entryType}, ${entry.creditsDelta}, a.available_credits,
           ${entry.sourceType.slice(0, 60)}, ${entry.sourceId.slice(0, 160)}, ${entry.idempotencyKey.slice(0, 160)},
           ${entry.metadata ? sql.json(entry.metadata) : null}
      from public.lab_credit_accounts a
     where a.workspace_key = ${entry.workspaceKey}
    on conflict (idempotency_key) do nothing`
}

/** The plan a workspace is entitled to right now. Expired prepaid access is free. */
async function resolvePlan(sql: TransactionSql, workspaceKey: string) {
  const [subscription] = await sql<{ plan_slug: string }[]>`
    select plan_slug from public.lab_subscriptions
     where workspace_key = ${workspaceKey} and status in ('active', 'trialing')
       and current_period_end > now()
     order by current_period_end desc limit 1`
  const plan = findBillingPlan(subscription?.plan_slug ?? 'explorer') ?? findBillingPlan('explorer')
  return { slug: plan?.slug ?? 'explorer', credits: plan?.includedCredits ?? 0 }
}

/**
 * Grants Explorer's monthly allowance on first touch and expires the previous
 * allowance. Paid allowances are granted only by a verified payment.
 *
 * Explorer refresh is lazy rather than scheduled, so it cannot silently fail
 * because a cron job did not run. A dormant workspace refreshes on its next
 * visit. Manual paid access never refreshes from this path.
 */
async function ensureAllowance(sql: TransactionSql, context: WorkspaceAuthContext) {
  const period = currentBillingPeriod()
  const workspaceKey = context.workspace.key
  const plan = await resolvePlan(sql, workspaceKey)

  const [account] = await sql<{
    allowance_credits: string
    allowance_period: string | null
    allowance_plan: string | null
  }[]>`
    select allowance_credits, allowance_period, allowance_plan
      from public.lab_credit_accounts where workspace_key = ${workspaceKey} for update`
  const action = allowanceAction({
    entitledPlan: plan.slug,
    accountPlan: account?.allowance_plan ?? null,
    accountPeriod: account?.allowance_period ?? null,
    currentPeriod: period,
  })
  if (action === 'keep') return
  if (action === 'invalid_paid_state') {
    // Payment activation grants paid credits atomically. Manufacturing a paid
    // allowance here would hide a broken payment transaction and give away
    // work that has not been reconciled.
    throw new Error('PAID_ALLOWANCE_STATE_MISMATCH')
  }

  // Credits may only move if the ledger records the movement. Checking the
  // ledger first keeps the two in step: without this, a grant whose ledger row
  // was already present would still top up the account, and the audit trail
  // would no longer reproduce the balance.
  const grantKey = `allowance:${workspaceKey}:${period}`
  const [alreadyGranted] = await sql<{ id: string }[]>`
    select id from public.lab_credit_ledger where idempotency_key = ${grantKey}`
  if (alreadyGranted) {
    await sql`
      update public.lab_credit_accounts
         set allowance_period = ${period}, allowance_grant_id = ${grantKey}, updated_at = now()
       where workspace_key = ${workspaceKey}`
    return
  }

  const unspent = account?.allowance_period ? toNumber(account.allowance_credits) : 0

  await sql`
    update public.lab_credit_accounts
       set available_credits = greatest(available_credits - ${unspent}, 0) + ${plan.credits},
           allowance_credits = ${plan.credits},
           allowance_period = ${period},
           allowance_plan = ${plan.slug},
           allowance_grant_id = ${grantKey},
           version = version + 1,
           updated_at = now()
     where workspace_key = ${workspaceKey}`

  if (unspent > 0) {
    await writeLedger(sql, {
      workspaceKey,
      entryType: 'expiry',
      creditsDelta: -unspent,
      sourceType: 'allowance_expiry',
      sourceId: account?.allowance_period ?? 'unknown',
      idempotencyKey: `allowance-expiry:${workspaceKey}:${account?.allowance_period}`,
      metadata: { expiredPeriod: account?.allowance_period ?? null },
    })
  }
  if (plan.credits > 0) {
    await writeLedger(sql, {
      workspaceKey,
      entryType: 'grant',
      creditsDelta: plan.credits,
      sourceType: 'plan_allowance',
      sourceId: plan.slug,
      idempotencyKey: grantKey,
      metadata: { plan: plan.slug, period },
    })
  }
}

/** Reclaims expired holds so a crashed task cannot strand someone's credits. */
async function expireStaleReservations(sql: TransactionSql, workspaceKey: string) {
  const stale = await sql<{
    id: string
    credits: string
    allowance_drawn: string
    allowance_grant_id: string | null
  }[]>`
    update public.lab_credit_reservations
       set status = 'expired', updated_at = now()
     where workspace_key = ${workspaceKey} and status = 'held' and expires_at < now()
    returning id, credits, allowance_drawn, allowance_grant_id`

  for (const row of stale) {
    const credits = toNumber(row.credits)
    const [account] = await sql<{ allowance_grant_id: string | null }[]>`
      select allowance_grant_id from public.lab_credit_accounts
       where workspace_key = ${workspaceKey} for update`
    const allocation = allocateCreditRelease({
      held: credits,
      charged: 0,
      allowanceDrawn: toNumber(row.allowance_drawn),
      restoreAllowance: row.allowance_grant_id !== null
        && row.allowance_grant_id === account?.allowance_grant_id,
    })
    await sql`
      update public.lab_credit_accounts
         set available_credits = available_credits + ${allocation.availableReturned},
             reserved_credits = greatest(reserved_credits - ${credits}, 0),
             allowance_credits = allowance_credits + ${allocation.allowanceReturned},
             version = version + 1,
             updated_at = now()
       where workspace_key = ${workspaceKey}`
    await writeLedger(sql, {
      workspaceKey,
      entryType: 'release',
      creditsDelta: allocation.availableReturned,
      sourceType: 'reservation_expiry',
      sourceId: row.id,
      idempotencyKey: `expire:${row.id}`,
      metadata: {
        heldCredits: credits,
        returnedCredits: allocation.availableReturned,
        allowanceReturned: allocation.allowanceReturned,
        expiredCredits: allocation.expired,
      },
    })
  }
}

export async function readBalance(context: WorkspaceAuthContext): Promise<CreditBalance | null> {
  if (!isPostgresConfigured()) return null
  const sql = getPostgres()

  return sql.begin(async (tx) => {
    await ensureWorkspace(tx, context)
    await ensureAllowance(tx, context)
    await expireStaleReservations(tx, context.workspace.key)
    const [account] = await tx<{
      available_credits: string
      reserved_credits: string
      allowance_credits: string
      allowance_plan: string | null
      allowance_period: string | null
    }[]>`
      select available_credits, reserved_credits, allowance_credits, allowance_plan, allowance_period
        from public.lab_credit_accounts where workspace_key = ${context.workspace.key}`
    return {
      available: toNumber(account?.available_credits),
      reserved: toNumber(account?.reserved_credits),
      allowance: toNumber(account?.allowance_credits),
      plan: account?.allowance_plan ?? 'explorer',
      period: account?.allowance_period ?? currentBillingPeriod(),
    }
  }) as Promise<CreditBalance>
}

/**
 * Hold credits before expensive work starts.
 *
 * `idempotencyKey` makes a retried request reuse its existing hold rather than
 * reserving twice, which is what stops a flaky mobile connection from charging
 * someone for one task two or three times.
 *
 * The balance update carries its own `available_credits >= required` guard, so
 * two concurrent tasks cannot both spend the last credit even if they read the
 * same balance.
 */
export async function reserveCredits(input: {
  context: WorkspaceAuthContext
  estimate: CreditEstimate
  requestId: string
  idempotencyKey: string
  /** Temporary lookup path for reservations made before scoped keys shipped. */
  legacyIdempotencyKey?: string
}): Promise<ReservationResult> {
  if (!isPostgresConfigured()) return { ok: false, reason: 'database_not_configured' }
  const sql = getPostgres()
  const workspaceKey = input.context.workspace.key
  const required = input.estimate.reserve
  const rawKey = input.idempotencyKey.slice(0, 160)
  const reservationKey = scopedIdempotencyKey('credit', workspaceKey, rawKey)

  return sql.begin(async (tx) => {
    await ensureWorkspace(tx, input.context)

    const legacyKey = input.legacyIdempotencyKey?.slice(0, 160) ?? rawKey
    const [existing] = await tx<{ id: string }[]>`
      select id from public.lab_credit_reservations
       where workspace_key = ${workspaceKey}
         and (idempotency_key = ${reservationKey}
              or (${legacyKey}::text is not null and idempotency_key = ${legacyKey}))
       order by created_at desc limit 1`
    if (existing) {
      return { ok: false as const, reason: 'already_reserved' as const, reservationId: existing.id }
    }

    await ensureAllowance(tx, input.context)
    await expireStaleReservations(tx, workspaceKey)

    const [account] = await tx<{
      available_credits: string
      reserved_credits: string
      allowance_credits: string
      allowance_grant_id: string | null
      allowance_plan: string | null
      allowance_period: string | null
      version: string
    }[]>`
      select available_credits, reserved_credits, allowance_credits, allowance_grant_id,
             allowance_plan, allowance_period, version
        from public.lab_credit_accounts where workspace_key = ${workspaceKey} for update`
    const available = toNumber(account?.available_credits)
    const reserved = toNumber(account?.reserved_credits)
    const allowance = toNumber(account?.allowance_credits)
    const balance: CreditBalance = {
      available,
      reserved,
      allowance,
      plan: account?.allowance_plan ?? 'explorer',
      period: account?.allowance_period ?? currentBillingPeriod(),
    }

    if (available < required) {
      return { ok: false as const, reason: 'insufficient_credits' as const, required, balance }
    }

    // Spend the expiring allowance before permanent purchased credits.
    const allowanceDrawn = Math.min(required, allowance)
    const allowanceGrantId = allowanceDrawn > 0 ? account?.allowance_grant_id ?? null : null
    const ttlSeconds = reservationTtlSeconds(input.estimate.feature)

    const reservationId = `res_${input.requestId.slice(0, 40)}_${toNumber(account?.version)}`.slice(0, 64)
    await tx`
      insert into public.lab_credit_reservations
        (id, workspace_key, owner_id, request_id, feature, credits, allowance_drawn,
         allowance_grant_id, idempotency_key, expires_at)
      values (${reservationId}, ${workspaceKey}, ${input.context.userId}, ${input.requestId.slice(0, 64)},
              ${input.estimate.feature}, ${required}, ${allowanceDrawn}, ${allowanceGrantId},
              ${reservationKey}, now() + make_interval(secs => ${ttlSeconds}))`

    const moved = await tx`
      update public.lab_credit_accounts
         set available_credits = available_credits - ${required},
             allowance_credits = greatest(allowance_credits - ${allowanceDrawn}, 0),
             reserved_credits = reserved_credits + ${required},
             version = version + 1,
             updated_at = now()
       where workspace_key = ${workspaceKey} and available_credits >= ${required}`
    if (moved.count === 0) {
      return { ok: false as const, reason: 'insufficient_credits' as const, required, balance }
    }

    await writeLedger(tx, {
      workspaceKey,
      entryType: 'reservation',
      creditsDelta: -required,
      sourceType: 'reservation',
      sourceId: reservationId,
      idempotencyKey: `reserve:${reservationKey}`,
      metadata: {
        feature: input.estimate.feature,
        quotedUsd: input.estimate.quotedUsd,
        allowanceDrawn,
        allowanceGrantId,
        expiresInSeconds: ttlSeconds,
      },
    })

    return {
      ok: true as const,
      reservationId,
      reserved: required,
      balance: {
        ...balance,
        available: available - required,
        reserved: reserved + required,
        allowance: allowance - allowanceDrawn,
      },
    }
  }) as Promise<ReservationResult>
}

/**
 * Convert a finished task into a charge and return whatever was not used.
 *
 * The charge decision lives in `settleCredits`, so the rule that a task can
 * never exceed what the person saw reserved is enforced in one place.
 */
export async function settleReservation(input: {
  context: WorkspaceAuthContext
  reservationId: string
  estimate: CreditEstimate
  measuredUsd?: number | null
  outcome: 'success' | 'failure'
}): Promise<SettlementResult> {
  if (!isPostgresConfigured()) return { ok: false, reason: 'database_not_configured' }
  const sql = getPostgres()
  const workspaceKey = input.context.workspace.key

  return sql.begin(async (tx) => {
    const [reservation] = await tx<{
      id: string
      credits: string
      status: string
      allowance_drawn: string
      allowance_grant_id: string | null
    }[]>`
      select id, credits, status, allowance_drawn, allowance_grant_id
        from public.lab_credit_reservations
       where id = ${input.reservationId} and workspace_key = ${workspaceKey} for update`
    if (!reservation) return { ok: false as const, reason: 'unknown_reservation' as const }
    if (reservation.status !== 'held') return { ok: false as const, reason: 'not_held' as const }

    const held = toNumber(reservation.credits)
    const settlement = settleCredits({
      estimate: { ...input.estimate, reserve: held },
      measuredUsd: input.measuredUsd,
      outcome: input.outcome,
    })

    // Refunds go back to the exact grant they came from. A plan can be
    // replaced within a calendar month, so comparing periods is insufficient.
    const [current] = await tx<{ allowance_grant_id: string | null }[]>`
      select allowance_grant_id from public.lab_credit_accounts
       where workspace_key = ${workspaceKey} for update`
    const allocation = allocateCreditRelease({
      held,
      charged: settlement.charged,
      allowanceDrawn: toNumber(reservation.allowance_drawn),
      restoreAllowance: reservation.allowance_grant_id !== null
        && reservation.allowance_grant_id === current?.allowance_grant_id,
    })

    await tx`
      update public.lab_credit_reservations
         set status = 'settled', settled_credits = ${settlement.charged},
             settled_at = now(), updated_at = now()
       where id = ${input.reservationId} and status = 'held'`
    await tx`
      update public.lab_credit_accounts
         set reserved_credits = greatest(reserved_credits - ${held}, 0),
             available_credits = available_credits + ${allocation.availableReturned},
             allowance_credits = allowance_credits + ${allocation.allowanceReturned},
             version = version + 1,
             updated_at = now()
       where workspace_key = ${workspaceKey}`
    // `credits_delta` tracks the available balance, and the reservation entry
    // already removed the full hold. Settlement therefore records what came
    // back, so summing the ledger always reproduces the balance. What was
    // actually charged is `held - released`, kept explicitly in metadata.
    await writeLedger(tx, {
      workspaceKey,
      entryType: 'settlement',
      creditsDelta: allocation.availableReturned,
      sourceType: 'reservation_settlement',
      sourceId: input.reservationId,
      idempotencyKey: `settle:${input.reservationId}`,
      metadata: {
        feature: settlement.feature,
        outcome: input.outcome,
        heldCredits: held,
        chargedCredits: settlement.charged,
        measuredUsd: settlement.measuredUsd,
        cappedByCeiling: settlement.cappedByCeiling,
        releasedCredits: allocation.released,
        returnedCredits: allocation.availableReturned,
        allowanceReturned: allocation.allowanceReturned,
        expiredCredits: allocation.expired,
      },
    })

    const [account] = await tx<{
      available_credits: string
      reserved_credits: string
      allowance_credits: string
      allowance_plan: string | null
      allowance_period: string | null
    }[]>`
      select available_credits, reserved_credits, allowance_credits, allowance_plan, allowance_period
        from public.lab_credit_accounts where workspace_key = ${workspaceKey}`
    return {
      ok: true as const,
      charged: settlement.charged,
      released: allocation.availableReturned,
      expired: allocation.expired,
      balance: {
        available: toNumber(account?.available_credits),
        reserved: toNumber(account?.reserved_credits),
        allowance: toNumber(account?.allowance_credits),
        plan: account?.allowance_plan ?? 'explorer',
        period: account?.allowance_period ?? currentBillingPeriod(),
      },
    }
  }) as Promise<SettlementResult>
}

/** Grants an operator-approved allowance, purchased top-up or adjustment. */
export async function grantCredits(input: {
  context: WorkspaceAuthContext
  credits: number
  sourceType: 'plan_allowance' | 'top_up' | 'sponsored_seat' | 'adjustment' | 'refund'
  sourceId: string
  idempotencyKey: string
  operatorAudit?: {
    actorId: string
    action: 'credit_grant' | 'credit_refund'
    reason: string
    requestId: string
  }
}) {
  if (!isPostgresConfigured()) return { granted: false as const, reason: 'database_not_configured' as const }
  if (!Number.isFinite(input.credits) || input.credits <= 0) {
    return { granted: false as const, reason: 'invalid_amount' as const }
  }
  const sql = getPostgres()
  const credits = Math.floor(input.credits)
  const legacyKey = `grant:${input.idempotencyKey}`.slice(0, 160)
  const key = scopedIdempotencyKey('grant', input.context.workspace.key, input.idempotencyKey)

  return sql.begin(async (tx) => {
    await ensureWorkspace(tx, input.context)

    const [existing] = await tx<{ id: string }[]>`
      select id from public.lab_credit_ledger
       where workspace_key = ${input.context.workspace.key}
         and idempotency_key in (${key}, ${legacyKey})
       limit 1`
    if (existing) return { granted: false as const, reason: 'already_granted' as const }

    const [beforeAccount] = await tx<{ available_credits: string }[]>`
      select available_credits from public.lab_credit_accounts
       where workspace_key = ${input.context.workspace.key} for update`
    const balanceBefore = toNumber(beforeAccount?.available_credits)

    await tx`
      update public.lab_credit_accounts
         set available_credits = available_credits + ${credits},
             version = version + 1,
             updated_at = now()
       where workspace_key = ${input.context.workspace.key}`
    await writeLedger(tx, {
      workspaceKey: input.context.workspace.key,
      entryType: input.sourceType === 'top_up'
        ? 'top_up'
        : input.sourceType === 'refund'
          ? 'refund'
        : input.sourceType === 'adjustment'
          ? 'adjustment'
          : 'grant',
      creditsDelta: credits,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      idempotencyKey: key,
    })
    if (input.operatorAudit) {
      const audit = input.operatorAudit
      await tx`
        insert into public.lab_admin_audit_events
          (id, actor_id, target_workspace_key, action, credits_delta, balance_before,
           balance_after, reason, request_id, idempotency_key)
        values (${`adm_${crypto.randomUUID()}`}, ${audit.actorId}, ${input.context.workspace.key},
                ${audit.action}, ${credits}, ${balanceBefore}, ${balanceBefore + credits},
                ${audit.reason.slice(0, 240)}, ${audit.requestId.slice(0, 80)}, ${key})`
    }
    return { granted: true as const, balanceBefore, balanceAfter: balanceBefore + credits }
  }) as Promise<{
    granted: boolean
    reason?: string
    balanceBefore?: number
    balanceAfter?: number
  }>
}

export type { CreditFeature }
