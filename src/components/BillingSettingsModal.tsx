'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import styles from './BillingSettingsModal.module.css'

type SubscriptionData = {
  subscription: {
    id: string
    planSlug: string
    planName: string
    status: string
    cadence: string
    currentPeriodStart: string
    currentPeriodEnd: string
    cancelAtPeriodEnd: boolean
    includedCredits: number
    monthlyPriceGhs: number
  } | null
  attempts: Array<{
    id: string
    planSlug: string
    planName: string
    paymentMethod: string
    amountGhs: number
    status: 'created' | 'initiating' | 'pending' | 'approved' | 'declined' | 'failed' | 'review'
    createdAt: string
    activatedAt: string | null
  }>
  billingEnabled: boolean
}

export function BillingSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    setError('')

    fetch('/api/billing/subscription', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('Could not fetch billing details.')
        return res.json()
      })
      .then((resData: SubscriptionData) => {
        if (!cancelled) {
          setData(resData)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error loading billing.')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isOpen])

  if (!isOpen) return null

  const sub = data?.subscription
  const attempts = data?.attempts ?? []

  return (
    <div className={styles.overlay} onClick={onClose} aria-modal="true" role="dialog">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Billing & Subscriptions</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.emptyHistory}>Loading billing information…</div>
          ) : error ? (
            <div className={styles.emptyHistory}>{error}</div>
          ) : (
            <>
              <div>
                <h3 className={styles.sectionTitle}>Current Plan</h3>
                <div className={styles.planCard}>
                  <div className={styles.planHeader}>
                    <span className={styles.planBadge}>{sub ? sub.planName : 'Explorer Plan (Free)'}</span>
                    <span className={styles.statusActive}>
                      <i className={styles.statusActiveDot} /> {sub ? 'Active Subscription' : 'Free Tier'}
                    </span>
                  </div>
                  <div className={styles.planGrid}>
                    <div className={styles.planMetric}>
                      <label>Monthly Price</label>
                      <strong>{sub ? `GH₵${sub.monthlyPriceGhs.toLocaleString()}` : 'GH₵0 / mo'}</strong>
                    </div>
                    <div className={styles.planMetric}>
                      <label>Included Credits</label>
                      <strong>{sub ? `${sub.includedCredits} credits/mo` : '5 credits/mo'}</strong>
                    </div>
                    {sub ? (
                      <div className={styles.planMetric}>
                        <label>Renewal Date</label>
                        <strong>{new Date(sub.currentPeriodEnd).toLocaleDateString()}</strong>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div>
                <h3 className={styles.sectionTitle}>Payment History</h3>
                {attempts.length > 0 ? (
                  <ul className={styles.historyList}>
                    {attempts.map((attempt) => (
                      <li key={attempt.id} className={styles.historyItem}>
                        <div className={styles.historyInfo}>
                          <span className={styles.historyPlan}>{attempt.planName} · GH₵{attempt.amountGhs.toLocaleString()}</span>
                          <span className={styles.historyMeta}>
                            Ref: {attempt.id} · {attempt.paymentMethod === 'mobile_money' ? 'Mobile Money' : 'Card'} · {new Date(attempt.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <span className={`${styles.historyStatus} ${
                          attempt.status === 'approved' ? styles.statusApproved :
                          attempt.status === 'pending' ? styles.statusPending :
                          attempt.status === 'failed' || attempt.status === 'declined' ? styles.statusFailed :
                          styles.statusDefault
                        }`}>
                          {attempt.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={styles.emptyHistory}>No payment attempts recorded yet.</div>
                )}
              </div>
            </>
          )}
        </div>

        <div className={styles.footer}>
          <Link href="/pricing" className={styles.upgradeLink} onClick={onClose}>
            Upgrade or Change Plan ↗
          </Link>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
