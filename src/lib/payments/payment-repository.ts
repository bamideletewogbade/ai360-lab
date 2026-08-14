import { createHash } from 'node:crypto'
import type { TransactionSql } from 'postgres'
import { BILLING_CATALOG_VERSION, findBillingPlan, type BillingPlan } from '@/lib/billing/catalog'
import { currentBillingPeriod } from '@/lib/billing/credits'
import { getPostgres, isPostgresConfigured } from '@/lib/postgres'
import { scopedIdempotencyKey } from '@/lib/idempotency'
import type { PaymentMethod, VerifiedPayment } from '@/lib/payments/contracts'
import type { WorkspaceAuthContext } from '@/lib/workspace'
import { ensureWorkspaceRecord } from '@/lib/workspace-db'

export type PaymentStatus =
  | 'created' | 'initiating' | 'pending' | 'approved'
  | 'declined' | 'failed' | 'review'

export type PaymentAttempt = {
  id: string
  workspaceKey: string
  ownerId: string
  provider: 'expresspay'
  providerReference: string | null
  providerTransactionId: string | null
  planSlug: string
  paymentMethod: PaymentMethod
  amountMinor: number
  currency: 'GHS'
  status: PaymentStatus
  checkoutUrl: string | null
  providerStatusText: string | null
  activatedAt: string | null
  lastCheckedAt: string | null
  createdAt: string
}

type AttemptRow = {
  id: string
  workspace_key: string
  owner_id: string
  provider: string
  provider_reference: string | null
  provider_transaction_id: string | null
  plan_slug: string
  payment_method: string
  amount_minor: string
  currency: string
  status: string
  checkout_url: string | null
  provider_status_text: string | null
  activated_at: Date | null
  last_checked_at: Date | null
  created_at: Date
}

function attemptFromRow(row: AttemptRow): PaymentAttempt {
  return {
    id: row.id,
    workspaceKey: row.workspace_key,
    ownerId: row.owner_id,
    provider: 'expresspay',
    providerReference: row.provider_reference,
    providerTransactionId: row.provider_transaction_id,
    planSlug: row.plan_slug,
    paymentMethod: row.payment_method as PaymentMethod,
    amountMinor: Number(row.amount_minor),
    currency: 'GHS',
    status: row.status as PaymentStatus,
    checkoutUrl: row.checkout_url,
    providerStatusText: row.provider_status_text,
    activatedAt: row.activated_at?.toISOString() ?? null,
    lastCheckedAt: row.last_checked_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  }
}

async function ensureBillingIdentity(sql: TransactionSql, context: WorkspaceAuthContext) {
  await ensureWorkspaceRecord(sql, context)
  await sql`
    insert into public.lab_credit_accounts (workspace_key) values (${context.workspace.key})
    on conflict (workspace_key) do nothing`
}

export async function readBillingProfile(context: WorkspaceAuthContext) {
  if (!isPostgresConfigured()) return null
  const profile = await getPostgres().begin(async (tx) => {
    await ensureBillingIdentity(tx, context)
    const [row] = await tx<{
      email: string | null
      display_name: string | null
    }[]>`
      select email, display_name from public.lab_users
       where clerk_user_id = ${context.userId} and deleted_at is null`
    return row ?? null
  })
  if (!profile?.email) return null
  const parts = (profile.display_name || 'AI360 Customer').trim().split(/\s+/)
  return {
    email: profile.email,
    firstName: (parts.shift() || 'AI360').slice(0, 32),
    lastName: (parts.join(' ') || 'Customer').slice(0, 64),
  }
}

export async function createPaymentAttempt(input: {
  context: WorkspaceAuthContext
  plan: BillingPlan
  paymentMethod: PaymentMethod
  idempotencyKey: string
}) {
  if (!isPostgresConfigured()) throw new Error('AI360_POSTGRES_NOT_CONFIGURED')
  const sql = getPostgres()
  const id = `pay_${crypto.randomUUID().replaceAll('-', '')}`
  const amountMinor = input.plan.monthlyPriceGhs * 100
  const legacyKey = input.idempotencyKey.slice(0, 160)
  const paymentKey = scopedIdempotencyKey('payment', input.context.workspace.key, legacyKey)

  return sql.begin(async (tx) => {
    await ensureBillingIdentity(tx, input.context)
    // Reuse both new scoped keys and legacy rows owned by this workspace.
    const [existing] = await tx<AttemptRow[]>`
      select * from public.lab_payment_attempts
       where workspace_key = ${input.context.workspace.key}
         and idempotency_key in (${paymentKey}, ${legacyKey})
       order by created_at desc limit 1`
    if (existing) {
      if (
        existing.plan_slug !== input.plan.slug ||
        Number(existing.amount_minor) !== amountMinor ||
        existing.payment_method !== input.paymentMethod
      ) throw new Error('PAYMENT_IDEMPOTENCY_MISMATCH')
      return { attempt: attemptFromRow(existing), reused: true }
    }

    const inserted = await tx<AttemptRow[]>`
      insert into public.lab_payment_attempts
        (id, workspace_key, owner_id, provider, idempotency_key, plan_slug,
         cadence, payment_method, amount_minor, currency, status, metadata)
      values
        (${id}, ${input.context.workspace.key}, ${input.context.userId}, 'expresspay',
         ${paymentKey}, ${input.plan.slug}, 'monthly',
         ${input.paymentMethod}, ${amountMinor}, 'GHS', 'created',
         ${tx.json({ catalogVersion: BILLING_CATALOG_VERSION })})
      on conflict (idempotency_key) do nothing
      returning *`
    if (inserted[0]) return { attempt: attemptFromRow(inserted[0]), reused: false }

    const [concurrent] = await tx<AttemptRow[]>`
      select * from public.lab_payment_attempts
       where idempotency_key = ${paymentKey}
         and workspace_key = ${input.context.workspace.key}`
    if (!concurrent) throw new Error('PAYMENT_IDEMPOTENCY_CONFLICT')
    if (
      concurrent.plan_slug !== input.plan.slug ||
      Number(concurrent.amount_minor) !== amountMinor ||
      concurrent.payment_method !== input.paymentMethod
    ) throw new Error('PAYMENT_IDEMPOTENCY_MISMATCH')
    return { attempt: attemptFromRow(concurrent), reused: true }
  }) as Promise<{ attempt: PaymentAttempt; reused: boolean }>
}

export async function markPaymentInitiating(id: string, workspaceKey: string) {
  const rows = await getPostgres()<AttemptRow[]>`
    update public.lab_payment_attempts
       set status = 'initiating', updated_at = now()
     where id = ${id} and workspace_key = ${workspaceKey} and status = 'created'
    returning *`
  return rows[0] ? attemptFromRow(rows[0]) : null
}

export async function markPaymentReady(input: {
  id: string
  workspaceKey: string
  providerReference: string
  checkoutUrl: string
}) {
  const [row] = await getPostgres()<AttemptRow[]>`
    update public.lab_payment_attempts
       set provider_reference = ${input.providerReference}, checkout_url = ${input.checkoutUrl},
           status = 'pending', updated_at = now()
     where id = ${input.id} and workspace_key = ${input.workspaceKey} and status = 'initiating'
    returning *`
  if (!row) throw new Error('PAYMENT_ATTEMPT_NOT_INITIATING')
  return attemptFromRow(row)
}

export async function markPaymentFailed(id: string, workspaceKey: string, code: string) {
  await getPostgres()`
    update public.lab_payment_attempts
       set status = 'failed', failure_code = ${code.slice(0, 80)}, updated_at = now()
     where id = ${id} and workspace_key = ${workspaceKey} and status in ('created', 'initiating')`
}

export async function readPaymentAttempt(context: WorkspaceAuthContext, id: string) {
  if (!isPostgresConfigured()) return null
  const [row] = await getPostgres()<AttemptRow[]>`
    select * from public.lab_payment_attempts
     where id = ${id} and workspace_key = ${context.workspace.key} and owner_id = ${context.userId}`
  return row ? attemptFromRow(row) : null
}

export type WorkspaceSubscription = {
  id: string
  planSlug: string
  status: string
  cadence: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
}

export async function readWorkspaceSubscription(context: WorkspaceAuthContext): Promise<WorkspaceSubscription | null> {
  if (!isPostgresConfigured()) return null
  const [row] = await getPostgres()<{
    id: string
    plan_slug: string
    status: string
    cadence: string
    current_period_start: Date
    current_period_end: Date
    cancel_at_period_end: boolean
  }[]>`
    select id, plan_slug, status, cadence, current_period_start, current_period_end, cancel_at_period_end
      from public.lab_subscriptions
     where workspace_key = ${context.workspace.key} and status = 'active'
       and current_period_end > now()`
  if (!row) return null
  return {
    id: row.id,
    planSlug: row.plan_slug,
    status: row.status,
    cadence: row.cadence,
    currentPeriodStart: row.current_period_start.toISOString(),
    currentPeriodEnd: row.current_period_end.toISOString(),
    cancelAtPeriodEnd: row.cancel_at_period_end,
  }
}

export async function listWorkspacePaymentAttempts(context: WorkspaceAuthContext, limit = 15): Promise<PaymentAttempt[]> {
  if (!isPostgresConfigured()) return []
  const rows = await getPostgres()<AttemptRow[]>`
    select * from public.lab_payment_attempts
     where workspace_key = ${context.workspace.key} and owner_id = ${context.userId}
     order by created_at desc
     limit ${limit}`
  return rows.map(attemptFromRow)
}

/**
 * Claims a pending payment for one provider query. The timestamp update makes
 * browser polling safe across multiple application instances without holding
 * a database transaction open during the external HTTP request.
 */
export async function claimPaymentReconciliation(
  context: WorkspaceAuthContext,
  id: string,
  minimumAgeSeconds = 10,
) {
  if (!isPostgresConfigured()) return null
  const [row] = await getPostgres()<AttemptRow[]>`
    update public.lab_payment_attempts
       set last_checked_at = now(), updated_at = now()
     where id = ${id}
       and workspace_key = ${context.workspace.key}
       and owner_id = ${context.userId}
       and status = 'pending'
       and provider_reference is not null
       and (last_checked_at is null or last_checked_at < now() - (${minimumAgeSeconds} * interval '1 second'))
    returning *`
  return row ? attemptFromRow(row) : null
}

export async function recordPaymentNotification(input: {
  orderId: string
  providerReference: string
}) {
  if (!isPostgresConfigured()) return { accepted: false, duplicate: false }
  const [known] = await getPostgres()<{
    id: string
  }[]>`
    select id from public.lab_payment_attempts
     where id = ${input.orderId}
       and provider = 'expresspay'
       and provider_reference = ${input.providerReference}
     limit 1`
  if (!known) return { accepted: false, duplicate: false }

  const eventId = createHash('sha256')
    .update(`expresspay:${input.orderId}:${input.providerReference}`)
    .digest('hex')
  const payloadHash = createHash('sha256')
    .update(`${input.orderId}\n${input.providerReference}`)
    .digest('hex')
  const result = await getPostgres()`
    insert into public.lab_billing_webhook_events
      (provider, event_id, event_type, payload_hash)
    values ('expresspay', ${eventId}, 'payment.status', ${payloadHash})
    on conflict (provider, event_id) do nothing`
  return { accepted: true, duplicate: result.count === 0 }
}

/** Public redirects are untrusted; only query ExpressPay for a token we issued. */
export async function isKnownPaymentReference(orderId: string, providerReference: string) {
  if (!isPostgresConfigured()) return false
  const [known] = await getPostgres()<{
    id: string
  }[]>`
    select id from public.lab_payment_attempts
     where id = ${orderId}
       and provider = 'expresspay'
       and provider_reference = ${providerReference}
     limit 1`
  return Boolean(known)
}

/**
 * The data a payment receipt email needs, resolved from the order alone.
 *
 * The payment callback is a server-to-server request with no workspace context,
 * so the recipient is looked up from the attempt's owner. Returns null when the
 * order or the owner's email is missing, which a caller treats as "no receipt",
 * never as a failure.
 */
export async function readPaymentReceipt(orderId: string) {
  if (!isPostgresConfigured()) return null
  const [row] = await getPostgres()<{
    plan_slug: string
    amount_minor: string
    email: string | null
    display_name: string | null
  }[]>`
    select a.plan_slug, a.amount_minor, u.email, u.display_name
      from public.lab_payment_attempts a
      join public.lab_users u on u.clerk_user_id = a.owner_id
     where a.id = ${orderId} and a.provider = 'expresspay'`
  if (!row?.email) return null
  const plan = findBillingPlan(row.plan_slug)
  return {
    email: row.email,
    name: row.display_name,
    planName: plan?.name ?? row.plan_slug,
    amountGhs: Number(row.amount_minor) / 100,
    credits: plan?.includedCredits ?? 0,
    orderId,
  }
}

function subscriptionId(workspaceKey: string) {
  return `sub_${createHash('sha256').update(`expresspay:${workspaceKey}`).digest('hex').slice(0, 32)}`
}

export type ApplyPaymentResult = {
  status: PaymentStatus
  activated: boolean
  duplicate: boolean
  orderId: string
}

export async function applyVerifiedPayment(payment: VerifiedPayment): Promise<ApplyPaymentResult> {
  if (!isPostgresConfigured()) throw new Error('AI360_POSTGRES_NOT_CONFIGURED')
  const sql = getPostgres()

  return sql.begin(async (tx) => {
    const [attempt] = await tx<AttemptRow[]>`
      select * from public.lab_payment_attempts
       where id = ${payment.orderId} and provider = 'expresspay'
       for update`
    if (!attempt || attempt.provider_reference !== payment.providerReference) {
      throw new Error('PAYMENT_ATTEMPT_NOT_FOUND')
    }
    if (attempt.activated_at) {
      return { status: 'approved', activated: false, duplicate: true, orderId: attempt.id }
    }

    if (
      payment.currency !== attempt.currency ||
      payment.amountMinor !== Number(attempt.amount_minor)
    ) {
      await tx`
        update public.lab_payment_attempts
           set status = 'review', failure_code = 'verified_details_mismatch',
               provider_status_text = ${payment.statusText}, last_checked_at = now(), updated_at = now()
         where id = ${attempt.id}`
      return { status: 'review', activated: false, duplicate: false, orderId: attempt.id }
    }

    if (payment.status !== 'approved') {
      const status: PaymentStatus = payment.status === 'pending'
        ? 'pending'
        : payment.status === 'declined'
          ? 'declined'
          : 'failed'
      await tx`
        update public.lab_payment_attempts
           set status = ${status}, provider_transaction_id = ${payment.providerTransactionId},
               provider_status_text = ${payment.statusText}, verified_at = now(),
               last_checked_at = now(), updated_at = now()
         where id = ${attempt.id}`
      return { status, activated: false, duplicate: false, orderId: attempt.id }
    }

    const plan = findBillingPlan(attempt.plan_slug)
    if (!plan || plan.monthlyPriceGhs <= 0) {
      await tx`
        update public.lab_payment_attempts
           set status = 'review', failure_code = 'unknown_paid_plan',
               provider_status_text = ${payment.statusText}, last_checked_at = now(), updated_at = now()
         where id = ${attempt.id}`
      return { status: 'review', activated: false, duplicate: false, orderId: attempt.id }
    }

    const providerSubscriptionId = `manual:${attempt.workspace_key}`
    await tx`
      insert into public.lab_subscriptions
        (id, workspace_key, provider, provider_subscription_id, plan_slug,
         catalog_version, cadence, status, current_period_start, current_period_end)
      values
        (${subscriptionId(attempt.workspace_key)}, ${attempt.workspace_key}, 'expresspay',
         ${providerSubscriptionId}, ${plan.slug}, ${BILLING_CATALOG_VERSION}, 'monthly',
         'active', now(), now() + interval '1 month')
      on conflict (provider, workspace_key) do update
        set plan_slug = excluded.plan_slug,
            catalog_version = excluded.catalog_version,
            cadence = 'monthly',
            status = 'active',
            current_period_start = now(),
            current_period_end = greatest(coalesce(lab_subscriptions.current_period_end, now()), now()) + interval '1 month',
            cancel_at_period_end = false,
            updated_at = now()`

    const [account] = await tx<{
      available_credits: string
      allowance_credits: string
    }[]>`
      select available_credits, allowance_credits from public.lab_credit_accounts
       where workspace_key = ${attempt.workspace_key} for update`
    if (!account) throw new Error('PAYMENT_CREDIT_ACCOUNT_NOT_FOUND')
    const oldAllowance = Math.max(0, Number(account.allowance_credits))

    if (oldAllowance > 0) {
      await tx`
        update public.lab_credit_accounts
           set available_credits = greatest(available_credits - ${oldAllowance}, 0),
               allowance_credits = 0, allowance_grant_id = null,
               version = version + 1, updated_at = now()
         where workspace_key = ${attempt.workspace_key}`
      await tx`
        insert into public.lab_credit_ledger
          (workspace_key, entry_type, credits_delta, balance_after, source_type,
           source_id, idempotency_key, metadata)
        select ${attempt.workspace_key}, 'expiry', ${-oldAllowance}, available_credits,
               'plan_replacement', ${attempt.id}, ${`payment-expiry:${attempt.id}`},
               ${tx.json({ previousAllowance: oldAllowance })}
          from public.lab_credit_accounts where workspace_key = ${attempt.workspace_key}
        on conflict (idempotency_key) do nothing`
    }

    await tx`
      update public.lab_credit_accounts
         set available_credits = available_credits + ${plan.includedCredits},
             allowance_credits = ${plan.includedCredits}, allowance_period = ${currentBillingPeriod()},
             allowance_plan = ${plan.slug}, allowance_grant_id = ${`payment-grant:${attempt.id}`},
             version = version + 1, updated_at = now()
       where workspace_key = ${attempt.workspace_key}`
    await tx`
      insert into public.lab_credit_ledger
        (workspace_key, entry_type, credits_delta, balance_after, source_type,
         source_id, idempotency_key, metadata)
      select ${attempt.workspace_key}, 'grant', ${plan.includedCredits}, available_credits,
             'subscription_payment', ${attempt.id}, ${`payment-grant:${attempt.id}`},
             ${tx.json({ plan: plan.slug, catalogVersion: BILLING_CATALOG_VERSION, amountMinor: payment.amountMinor })}
        from public.lab_credit_accounts where workspace_key = ${attempt.workspace_key}
      on conflict (idempotency_key) do nothing`

    await tx`
      update public.lab_payment_attempts
         set status = 'approved', provider_transaction_id = ${payment.providerTransactionId},
             provider_status_text = ${payment.statusText}, verified_at = now(), activated_at = now(),
             last_checked_at = now(), updated_at = now()
       where id = ${attempt.id} and activated_at is null`

    return { status: 'approved', activated: true, duplicate: false, orderId: attempt.id }
  }) as Promise<ApplyPaymentResult>
}
