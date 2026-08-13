'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import styles from './Settings.module.css'

/**
 * One honest money page.
 *
 * Balance, what work costs, the plan and payment history used to live in four
 * different places — the top bar popover, a dialog tab, the pricing page and the
 * payment status page. A person asking "what do I have and what did I spend it
 * on" should not have to visit four surfaces, so they are consolidated here.
 */

type CreditState = {
  available: number
  reserved: number
  allowance: number
  plan: string
  guide?: Array<{ task: string; credits: string }>
}

type SubscriptionState = {
  subscription: {
    planName: string
    monthlyPriceGhs: number
    includedCredits: number
    currentPeriodEnd: string
  } | null
  attempts: Array<{
    id: string
    planName: string
    paymentMethod: string
    amountGhs: number
    status: 'created' | 'initiating' | 'pending' | 'approved' | 'declined' | 'failed' | 'review'
    createdAt: string
  }>
  signedIn?: boolean
}

function statusClass(status: SubscriptionState['attempts'][number]['status']) {
  if (status === 'approved') return styles.statusApproved
  if (status === 'pending') return styles.statusPending
  if (status === 'failed' || status === 'declined') return styles.statusFailed
  return styles.statusDefault
}

export function BillingSettings() {
  const [credits, setCredits] = useState<CreditState | null>(null)
  const [billing, setBilling] = useState<SubscriptionState | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    // The balance is only available to a signed-in workspace; a 401 simply means
    // "guest", which the page renders as an invitation rather than an error.
    void Promise.allSettled([
      fetch('/api/credits', { cache: 'no-store', signal: controller.signal })
        .then((response) => (response.ok ? response.json() as Promise<CreditState> : null)),
      fetch('/api/billing/subscription', { cache: 'no-store', signal: controller.signal })
        .then((response) => (response.ok ? response.json() as Promise<SubscriptionState> : null)),
    ]).then(([creditResult, billingResult]) => {
      if (controller.signal.aborted) return
      if (creditResult.status === 'fulfilled' && creditResult.value) setCredits(creditResult.value)
      if (billingResult.status === 'fulfilled' && billingResult.value) setBilling(billingResult.value)
      setLoading(false)
    })
    return () => controller.abort()
  }, [])

  const subscription = billing?.subscription ?? null
  const attempts = billing?.attempts ?? []
  const signedIn = billing?.signedIn ?? Boolean(credits)

  return (
    <>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Your credits</h2>
          <p>Credits are the unit AI360 charges in. Failed work is never charged.</p>
        </div>

        {credits ? (
          <>
            <div className={styles.balanceRow}>
              <span className={styles.balanceValue}>{credits.available}</span>
              <span className={styles.balanceUnit}>
                credit{credits.available === 1 ? '' : 's'} available
              </span>
            </div>
            {credits.reserved > 0 ? (
              <p className={styles.balanceHold}>{credits.reserved} reserved for work in progress.</p>
            ) : null}
            {credits.allowance > 0 ? (
              <p className={styles.balanceHold}>
                {credits.allowance} of these come from this month&rsquo;s allowance and expire at the end of the period.
              </p>
            ) : null}
          </>
        ) : loading ? (
          <p className={styles.balanceHold}>Loading your balance…</p>
        ) : (
          <p className={styles.notice}>
            <Link href="/sign-in">Sign in</Link> to see your credit balance and keep your work across devices.
          </p>
        )}

        {credits?.guide?.length ? (
          <ul className={styles.guide}>
            {credits.guide.map((item) => (
              <li key={item.task}><span>{item.task}</span><b>{item.credits}</b></li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Plan</h2>
        </div>
        <div className={styles.planHeader}>
          <span className={styles.planBadge}>{subscription ? subscription.planName : 'Explorer (Free)'}</span>
          <span className={styles.statusActive}>
            <i className={styles.statusDot} aria-hidden="true" />
            {subscription ? 'Active' : 'Free tier'}
          </span>
        </div>
        <div className={styles.planGrid}>
          <div className={styles.planMetric}>
            <span>Monthly price</span>
            <strong>{subscription ? `GH₵${subscription.monthlyPriceGhs.toLocaleString()}` : 'GH₵0'}</strong>
          </div>
          <div className={styles.planMetric}>
            <span>Included credits</span>
            <strong>{subscription ? subscription.includedCredits : 5} / month</strong>
          </div>
          {subscription ? (
            <div className={styles.planMetric}>
              <span>Renews</span>
              <strong>{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</strong>
            </div>
          ) : null}
        </div>
        <Link href="/pricing" className={styles.primaryLink}>
          View plans and top up <span aria-hidden="true">→</span>
        </Link>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Payment history</h2>
        </div>
        {loading ? (
          <div className={styles.empty}>Loading payment history…</div>
        ) : !signedIn ? (
          <p className={styles.notice}>
            You are exploring in guest mode. <Link href="/sign-in">Sign in</Link> to keep a record of your payments.
          </p>
        ) : attempts.length ? (
          <ul className={styles.historyList}>
            {attempts.map((attempt) => (
              <li key={attempt.id} className={styles.historyItem}>
                <div className={styles.historyInfo}>
                  <span className={styles.historyPlan}>
                    {attempt.planName} · GH₵{attempt.amountGhs.toLocaleString()}
                  </span>
                  <span className={styles.historyMeta}>
                    {attempt.paymentMethod === 'mobile_money' ? 'Mobile Money' : 'Card'}
                    {' · '}{new Date(attempt.createdAt).toLocaleDateString()}
                    {' · '}Ref {attempt.id}
                  </span>
                </div>
                <span className={`${styles.historyStatus} ${statusClass(attempt.status)}`}>{attempt.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>No payments recorded yet.</div>
        )}
      </section>
    </>
  )
}
