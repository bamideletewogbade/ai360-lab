'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import styles from '@/app/payment/status/payment-status.module.css'

type PaymentRecord = {
  orderId: string
  plan: string
  amountGhs: number
  currency: string
  status: 'created' | 'initiating' | 'pending' | 'approved' | 'declined' | 'failed' | 'review'
  message: string | null
  activated: boolean
}

const STATUS_COPY: Record<PaymentRecord['status'], { title: string; body: string; step: number }> = {
  created: { title: 'Preparing your payment', body: 'The payment record is ready. Checkout has not opened yet.', step: 1 },
  initiating: { title: 'Preparing secure checkout', body: 'AI360 is requesting a secure payment page.', step: 1 },
  pending: { title: 'Waiting for confirmation', body: 'Complete the request on your phone or payment page. Mobile Money can take a few minutes.', step: 2 },
  approved: { title: 'Payment confirmed', body: 'Your plan is active and your credits are ready.', step: 4 },
  declined: { title: 'Payment was not approved', body: 'No plan was activated and no AI360 credits were added.', step: 2 },
  failed: { title: 'Payment could not be completed', body: 'No plan was activated. You can return to plans and try again.', step: 2 },
  review: { title: 'A person is checking this payment', body: 'The provider response did not match the order. Nothing was activated automatically.', step: 3 },
}

export function PaymentStatus({ orderId, check }: { orderId: string; check?: string }) {
  const [record, setRecord] = useState<PaymentRecord | null>(null)
  const [error, setError] = useState(orderId ? '' : 'This payment link is incomplete.')

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    let polls = 0
    async function read() {
      try {
        const response = await fetch(`/api/billing/payments/${encodeURIComponent(orderId)}`, { cache: 'no-store' })
        const result = await response.json() as PaymentRecord & { error?: string }
        if (!response.ok) throw new Error(result.error || 'Payment status could not be loaded.')
        if (cancelled) return
        setRecord(result)
        setError('')
        polls += 1
        if (['created', 'initiating', 'pending'].includes(result.status) && polls < 24) {
          timeout = setTimeout(read, 5_000)
        }
      } catch (readError) {
        if (!cancelled) setError(readError instanceof Error ? readError.message : 'Payment status could not be loaded.')
      }
    }
    void read()
    return () => {
      cancelled = true
      if (timeout) clearTimeout(timeout)
    }
  }, [orderId])

  const copy = record ? STATUS_COPY[record.status] : null
  const step = copy?.step || 1

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-live="polite">
        <Link className={styles.brand} href="/">AI360 <span>PAYMENT</span></Link>
        <p className={styles.kicker}>Payment status</p>
        <h1>{copy?.title || 'Checking your payment'}</h1>
        <p className={styles.lead}>{copy?.body || 'AI360 is loading the verified payment record.'}</p>
        {check === 'retry' && !record?.activated && <div className={styles.notice}>The first verification did not complete. Your payment remains unchanged while we check again.</div>}
        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.progress} aria-label={`Payment step ${step} of 4`}>
          {['Order', 'Pay', 'Verify', 'Ready'].map((label, index) => (
            <div key={label} className={index + 1 <= step ? styles.done : ''}><span>{String(index + 1).padStart(2, '0')}</span><b>{label}</b></div>
          ))}
        </div>
        {record && <dl><div><dt>Reference</dt><dd>{record.orderId}</dd></div><div><dt>Plan</dt><dd>{record.plan}</dd></div><div><dt>Amount</dt><dd>GH₵{record.amountGhs.toLocaleString()}</dd></div></dl>}
        <div className={styles.actions}>
          {record?.activated ? <Link href="/app">Open AI360</Link> : <Link href="/pricing">Return to plans</Link>}
          <button type="button" onClick={() => window.location.reload()}>Check again</button>
        </div>
        <p className={styles.safety}>A return page or notification cannot activate a plan by itself. AI360 checks the transaction directly with ExpressPay first.</p>
      </section>
    </main>
  )
}
