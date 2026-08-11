'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import styles from './SettingsModal.module.css'

type TabType = 'general' | 'billing' | 'account'

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
  signedIn?: boolean
}

export function SettingsModal({
  isOpen,
  onClose,
  initialTab = 'billing',
}: {
  isOpen: boolean
  onClose: () => void
  initialTab?: TabType
}) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [preferredLang, setPreferredLang] = useState('en')

  useEffect(() => {
    if (!isOpen) return
    const savedLang = localStorage.getItem('ai360_preferred_lang') || 'en'
    // Deferred so the two updates do not cascade synchronously in the effect.
    queueMicrotask(() => {
      setActiveTab(initialTab)
      setPreferredLang(savedLang)
    })
  }, [isOpen, initialTab])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    queueMicrotask(() => setLoading(true))

    fetch('/api/billing/subscription', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((resData: SubscriptionData | null) => {
        if (!cancelled) {
          setData(resData || { subscription: null, attempts: [], billingEnabled: true, signedIn: false })
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData({ subscription: null, attempts: [], billingEnabled: true, signedIn: false })
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isOpen])

  function handleLanguageChange(lang: string) {
    setPreferredLang(lang)
    localStorage.setItem('ai360_preferred_lang', lang)
  }

  if (!isOpen) return null

  const sub = data?.subscription
  const attempts = data?.attempts ?? []
  const signedIn = data?.signedIn ?? false

  return (
    <div className={styles.overlay} onClick={onClose} aria-modal="true" role="dialog">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Settings & Workspace</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        <div className={styles.layout}>
          <nav className={styles.nav}>
            <button
              type="button"
              className={`${styles.tabButton} ${activeTab === 'general' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('general')}
            >
              <span>⚙️</span> General & AI
            </button>
            <button
              type="button"
              className={`${styles.tabButton} ${activeTab === 'billing' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('billing')}
            >
              <span>💳</span> Billing & Plan
            </button>
            <button
              type="button"
              className={`${styles.tabButton} ${activeTab === 'account' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('account')}
            >
              <span>🔒</span> Account & Data
            </button>
          </nav>

          <div className={styles.content}>
            {activeTab === 'general' && (
              <>
                <div>
                  <h3 className={styles.sectionTitle}>Language & Voice Context</h3>
                  <div className={styles.fieldGroup}>
                    <label htmlFor="pref-lang">Preferred Spoken Language</label>
                    <select
                      id="pref-lang"
                      className={styles.select}
                      value={preferredLang}
                      onChange={(e) => handleLanguageChange(e.target.value)}
                    >
                      <option value="en">English (Ghana)</option>
                      <option value="ak">Akan / Twi</option>
                      <option value="ee">Ewe</option>
                      <option value="ga">Ga</option>
                      <option value="pcm">Ghanaian Pidgin</option>
                    </select>
                  </div>
                </div>

                <div>
                  <h3 className={styles.sectionTitle}>Workspace Behavior</h3>
                  <p className={styles.guestNotice}>
                    AI360 automatically estimates credit usage before running intensive tasks and saves project drafts locally on your device.
                  </p>
                </div>
              </>
            )}

            {activeTab === 'billing' && (
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

                {!signedIn && (
                  <div className={styles.guestNotice}>
                    You are currently exploring in <b>Guest mode</b>. <Link href="/sign-in">Sign in</Link> to save payment history and upgrade to Everyday or Builder plans.
                  </div>
                )}

                <div>
                  <h3 className={styles.sectionTitle}>Payment History</h3>
                  {loading ? (
                    <div className={styles.emptyHistory}>Loading payment history…</div>
                  ) : attempts.length > 0 ? (
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
                    <div className={styles.emptyHistory}>No paid transaction attempts recorded yet.</div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'account' && (
              <>
                <div>
                  <h3 className={styles.sectionTitle}>Identity & Security</h3>
                  <div className={styles.guestNotice}>
                    {signedIn ? (
                      'Your workspace is protected by Clerk identity synchronization and Supabase Postgres row-level security.'
                    ) : (
                      <>
                        You are in Guest mode. <Link href="/sign-in">Sign in</Link> or <Link href="/sign-up">Create an account</Link> to sync projects across devices.
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className={styles.sectionTitle}>Privacy & Terms</h3>
                  <p className={styles.guestNotice}>
                    Review our <Link href="/privacy">Privacy Notice</Link> and <Link href="/terms">Terms of Service</Link>.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          {activeTab === 'billing' ? (
            <Link href="/pricing" className={styles.upgradeLink} onClick={onClose}>
              View All Plans & Upgrades ↗
            </Link>
          ) : (
            <span />
          )}
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export function BillingSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return <SettingsModal isOpen={isOpen} onClose={onClose} initialTab="billing" />
}
