'use client'

import { FormEvent, useRef, useState } from 'react'
import Link from 'next/link'
import { findBillingPlan } from '@/lib/billing/catalog'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteNav } from '@/components/SiteNav'
import styles from '@/app/checkout/checkout.module.css'

type CheckoutState = 'ready' | 'starting' | 'redirecting' | 'error'

export function CheckoutExperience({ planSlug }: { planSlug: string }) {
  const plan = findBillingPlan(planSlug)
  const [phone, setPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'mobile_money' | 'card'>('mobile_money')
  const [state, setState] = useState<CheckoutState>('ready')
  const [error, setError] = useState('')
  const idempotencyKey = useRef(`checkout_${crypto.randomUUID()}`)

  if (!plan || plan.monthlyPriceGhs <= 0 || plan.assisted) {
    return (
      <main className={styles.shell}>
        <SiteNav current="pricing" />
        <section className={styles.missing}>
          <p>Checkout</p>
          <h1>Choose an available plan.</h1>
          <Link href="/pricing">Return to plans</Link>
        </section>
        <SiteFooter />
      </main>
    )
  }

  async function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState('starting')
    setError('')
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey.current,
        },
        body: JSON.stringify({
          plan: plan!.slug,
          cadence: 'monthly',
          paymentMethod,
          phone,
        }),
      })
      const result = await response.json() as { checkoutUrl?: string; error?: string }
      if (!response.ok || !result.checkoutUrl) {
        throw new Error(result.error || 'Checkout could not start.')
      }
      setState('redirecting')
      window.location.assign(result.checkoutUrl)
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Checkout could not start.')
      setState('error')
    }
  }

  const busy = state === 'starting' || state === 'redirecting'

  return (
    <main className={styles.shell}>
      <SiteNav current="pricing" />
      <div className={styles.layout}>
        <section className={styles.intro}>
          <p className={styles.kicker}>Secure checkout</p>
          <h1>Review it.<br />Then pay.</h1>
          <p>You will continue to ExpressPay to enter your Mobile Money or card details. AI360 never receives your wallet PIN, full card number or card security code.</p>
          <div className={styles.flow} aria-label="Payment flow">
            <span><b>01</b> Review</span>
            <span><b>02</b> Pay with ExpressPay</span>
            <span><b>03</b> We verify</span>
            <span><b>04</b> Credits appear</span>
          </div>
        </section>

        <form className={styles.review} onSubmit={startCheckout}>
          <div className={styles.reviewHead}><span>Due today</span><strong>GH₵{plan.monthlyPriceGhs.toLocaleString()}</strong></div>
          <dl>
            <div><dt>Plan</dt><dd>{plan.name}</dd></div>
            <div><dt>Credits</dt><dd>{plan.includedCredits.toLocaleString()} work credits</dd></div>
            <div><dt>Access</dt><dd>One month</dd></div>
            <div><dt>Renewal</dt><dd>Not automatic during the pilot</dd></div>
          </dl>

          <fieldset>
            <legend>How would you like to pay?</legend>
            <label className={paymentMethod === 'mobile_money' ? styles.selected : ''}>
              <input type="radio" name="method" value="mobile_money" checked={paymentMethod === 'mobile_money'} onChange={() => setPaymentMethod('mobile_money')} />
              <span><b>Mobile Money</b><small>MTN, Telecel or AT Money</small></span>
            </label>
            <label className={paymentMethod === 'card' ? styles.selected : ''}>
              <input type="radio" name="method" value="card" checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} />
              <span><b>Debit or credit card</b><small>Enter the card only on ExpressPay</small></span>
            </label>
          </fieldset>

          <label className={styles.phone}>
            <span>Phone number</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="024 000 0000"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
              disabled={busy}
            />
            <small>Used to prepare the payment and help match your receipt.</small>
          </label>

          {error && <div className={styles.error} role="alert">{error}</div>}
          <button type="submit" disabled={busy}>
            {state === 'starting' ? 'Preparing secure payment…' : state === 'redirecting' ? 'Opening ExpressPay…' : `Continue to ExpressPay · GH₵${plan.monthlyPriceGhs.toLocaleString()}`}
          </button>
          <p className={styles.terms}>By continuing, you agree to the <Link href="/terms">payment terms</Link> and acknowledge the <Link href="/privacy">privacy notice</Link>. Your plan activates only after ExpressPay confirms the payment.</p>
        </form>
      </div>
      <SiteFooter />
    </main>
  )
}
