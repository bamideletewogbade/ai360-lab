'use client'

import Link from 'next/link'
import { useState } from 'react'
import { BILLING_PLANS, CREDIT_GUIDE, CREDIT_TOP_UPS, planPrice, type BillingCadence } from '@/lib/billing/catalog'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteNav } from '@/components/SiteNav'
import styles from '@/app/pricing/pricing.module.css'

const TEMPLATE_GROUPS = [
  { mark: '01', name: 'Learn and prepare', examples: 'Study coach, exam preparation, interview practice', access: 'Free + Everyday' },
  { mark: '02', name: 'Decide with evidence', examples: 'Market research, comparison, policy brief', access: 'Everyday + Builder' },
  { mark: '03', name: 'Create and launch', examples: 'Brand launch, campaign builder, event pack', access: 'Builder' },
  { mark: '04', name: 'Serve a community', examples: 'NGO proposal, outreach plan, impact report', access: 'Builder + Team' },
]

const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'

export function PricingExperience() {
  const [cadence, setCadence] = useState<BillingCadence>('monthly')

  return (
    <main className={styles.shell}>
      <SiteNav current="pricing" />

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}><span>✦</span> Simple plans · flexible payment</p>
          <h1>Start free.<br /><em>Pay your way.</em></h1>
          <p>{BILLING_ENABLED
            ? 'Get 5 credits every month to explore AI 360. When you need more, choose a plan and pay securely with Mobile Money or card. You will see the complete amount before you confirm.'
            : 'Get 5 credits every month to explore AI 360. Paid plans are shown for transparency and will open after payment verification for the private pilot is complete.'}</p>
          <div className={styles.paymentTrust}>
            <span><i className={styles.freeDot} /> 5 free credits monthly</span>
            <span><i className={styles.momoDot} /> {BILLING_ENABLED ? 'Mobile Money or card' : 'Payments opening after pilot verification'}</span>
            <span><i /> No surprise overage bills</span>
          </div>
        </div>
        <div className={styles.paymentScene} aria-label="Mobile Money and card payments become AI 360 work credits">
          <div className={styles.sceneGrid} />
          <div className={styles.paymentChoices}>
            <div className={styles.choiceCard}>
              <span className={styles.phoneGlyph}><i /><b>₵</b></span>
              <span><small>PAY WITH</small><b>Mobile Money</b><em>MTN · Telecel · AT</em></span>
              <i className={styles.choicePulse} />
            </div>
            <div className={styles.choiceCard}>
              <span className={styles.bankCardGlyph}><i /><i /></span>
              <span><small>OR USE</small><b>Debit or credit card</b><em>Local · International</em></span>
              <span className={styles.cardMarks}>● ●</span>
            </div>
          </div>
          <div className={styles.flowLine}><i /><i /><i /></div>
          <div className={styles.creditWallet}>
            <div><span>AI 360</span><small>WORK WALLET</small></div>
            <strong>120</strong>
            <p>credits ready</p>
            <div className={styles.walletMeter}><i /></div>
            <small>Use across chat, agents and creative work</small>
          </div>
          <div className={styles.outcomeStack}>
            <div><span>R</span><p><b>Research brief</b><small>Checked and ready</small></p><em>2 credits</em></div>
            <div><span>I</span><p><b>Campaign image</b><small>Generated for review</small></p><em>4 credits</em></div>
            <div><span>A</span><p><b>Agent workflow</b><small>Plan to completion</small></p><em>6 credits</em></div>
          </div>
          <span className={styles.sceneCaption}><i /> One balance. Many useful outcomes.</span>
        </div>
      </header>

      <section className={styles.pricingSection} aria-labelledby="plans-title">
        <div className={styles.sectionHead}>
          <div><p><span>✦</span> AI 360 plans</p><h2 id="plans-title">Choose the pace that fits.</h2></div>
          <div className={styles.cadence} role="group" aria-label="Billing period">
            <button className={cadence === 'monthly' ? styles.active : ''} onClick={() => setCadence('monthly')}>Monthly</button>
            <button className={cadence === 'annual' ? styles.active : ''} onClick={() => setCadence('annual')}>Annual <span>save up to 17%</span></button>
          </div>
        </div>

        <div className={styles.planGrid}>
          {BILLING_PLANS.map((plan) => {
            const price = planPrice(plan, cadence)
            const paid = price > 0
            return (
              <article className={`${styles.plan} ${plan.featured ? styles.featured : ''}`} key={plan.slug}>
                {plan.featured && <span className={styles.recommended}>Best place to begin</span>}
                <p className={styles.planEyebrow}>{plan.eyebrow}</p>
                <h3>{plan.name}</h3>
                <p className={styles.audience}>{plan.audience}</p>
                <div className={styles.price}><span>GH₵</span><b>{price}</b><small>{paid ? '/ month' : 'forever'}</small></div>
                {cadence === 'annual' && paid ? <p className={styles.billingNote}>GH₵{price * 12} billed yearly</p> : <p className={styles.billingNote}>Pay month to month</p>}
                <div className={styles.creditLine}><span>{plan.includedCredits.toLocaleString()}</span><span>{plan.slug === 'explorer' ? 'free credits, reset monthly' : 'work credits included monthly'}</span></div>
                <ul>{plan.features.map((feature) => <li key={feature}><span>✓</span>{feature}</li>)}</ul>
                <div className={styles.templates}><small>Example templates</small><p>{plan.templateExamples.join(' · ')}</p></div>
                <Link href={paid ? `/sign-up?plan=${plan.slug}&cadence=${cadence}` : '/app'} className={paid ? styles.choose : styles.start}>
                  {paid ? (BILLING_ENABLED ? `Choose ${plan.name}` : `Join the ${plan.name} pilot`) : 'Start free'} <span>↗</span>
                </Link>
              </article>
            )
          })}
        </div>
        <p className={styles.pilotNote}>{BILLING_ENABLED
          ? 'Prices are shown in Ghana cedis. Before payment, you will see the full amount due today, billing period, renewal terms and any applicable taxes or fees.'
          : 'Paid checkout is not open yet. Joining a paid-plan pilot does not charge you; payment will only open after the provider and webhook flow pass verification.'}</p>
      </section>

      <section className={styles.creditSection}>
        <div className={styles.creditIntro}>
          <p><span>✦</span> Why work credits?</p>
          <h2>Simple for people.<br />Measured underneath.</h2>
          <p>You should not have to calculate technical tokens. AI 360 uses one understandable credit balance and shows an estimate before more demanding work begins.</p>
        </div>
        <div className={styles.creditRules}>
          <article><span>01</span><b>Everyday work stays light</b><p>Writing, learning and short conversations use fewer credits.</p></article>
          <article><span>02</span><b>Deep work uses more</b><p>Long research, premium models and large files consume more capacity.</p></article>
          <article><span>03</span><b>Media is confirmed first</b><p>Images and video show an estimate before generation begins.</p></article>
          <article><span>04</span><b>Failed work returns held credits</b><p>If a task cannot complete, unused reserved credits return to your balance.</p></article>
        </div>
        <div className={styles.creditGuide}>
          <div><b>What might work cost?</b><small>Shown before a task begins. Final charges follow measured work.</small></div>
          {CREDIT_GUIDE.map((item) => <div key={item.task}><span>{item.task}</span><b>{item.credits} {item.credits === '1' ? 'credit' : 'credits'}</b></div>)}
        </div>
        <div className={styles.topups}>
          <span><b>Need a little more?</b><small>Optional one-time top-ups for paid plans</small></span>
          {CREDIT_TOP_UPS.map((topup) => <span key={topup.slug}><b>GH₵{topup.priceGhs}</b><small>{topup.credits} credits</small></span>)}
        </div>
      </section>

      <section className={styles.templatesSection}>
        <div className={styles.sectionHead}>
          <div><p><span>✦</span> More than model access</p><h2>Templates that help people finish.</h2></div>
          <p>Start with a ready-made path for the outcome you need. Each template guides the brief, the work, the checks and the expected credit range.</p>
        </div>
        <div className={styles.templateGrid}>
          {TEMPLATE_GROUPS.map((template) => (
            <article key={template.name}><span>{template.mark}</span><h3>{template.name}</h3><p>{template.examples}</p><small>{template.access}</small></article>
          ))}
        </div>
      </section>

      <section className={styles.paymentSection}>
        <div className={styles.paymentCopy}>
          <p><span>✦</span> Before you pay</p>
          <h2>{BILLING_ENABLED ? <>Review everything.<br />Then decide.</> : <>Payment is designed.<br />Verification comes first.</>}</h2>
          <p>{BILLING_ENABLED
            ? 'Checkout will repeat your selected plan, credits, billing period and complete amount. Nothing is charged until you choose a payment method and confirm.'
            : 'This is the checkout experience planned for launch. It remains disabled while signatures, retries, reversals and reconciliation are verified in the provider sandbox.'}</p>
          <div className={styles.methodRow}><span>MTN MoMo</span><span>Telecel Cash</span><span>AT Money</span><span>Visa</span><span>Mastercard</span></div>
        </div>
        <div className={styles.checkoutReview}>
          <div className={styles.reviewTop}><span>CHECKOUT PREVIEW</span><b>Clear before confirmation</b></div>
          <dl>
            <div><dt>Due today</dt><dd>Plan price plus clearly listed tax or fees</dd></div>
            <div><dt>Billing</dt><dd>Monthly or annual, with the next renewal date</dd></div>
            <div><dt>Included</dt><dd>Your plan features and monthly work credits</dd></div>
            <div><dt>Credits</dt><dd>Reset, rollover and top-up rules shown plainly</dd></div>
            <div><dt>Payment</dt><dd>Your selected Mobile Money wallet or card</dd></div>
            <div><dt>Control</dt><dd>Renewal, cancellation and refund terms before payment</dd></div>
          </dl>
          <p><span>✓</span> A receipt and updated credit balance appear after successful payment.</p>
        </div>
      </section>

      <section className={styles.faqSection}>
        <div><p><span>✦</span> Important questions</p><h2>Clear before checkout.</h2></div>
        <div className={styles.faqs}>
          <details><summary>Why not promise unlimited AI?<span>+</span></summary><p>Model, research, image and video costs vary. An allowance keeps entry prices low and prevents one unusually expensive workflow from raising prices for everyone.</p></details>
          <details><summary>Will Mobile Money renew automatically?<span>+</span></summary><p>Checkout will say clearly whether your payment can renew automatically. If your wallet requires approval for each payment, AI 360 will remind you and you will confirm the renewal yourself.</p></details>
          <details><summary>Will I see the complete price before paying?<span>+</span></summary><p>Yes. The final review shows the amount due today, billing period, renewal date and any applicable tax or payment fee before you confirm.</p></details>
          <details><summary>Can I cancel or change my plan?<span>+</span></summary><p>Yes. The account area will show your current plan, next renewal and cancellation options. Changing or cancelling a plan will not create a surprise charge.</p></details>
          <details><summary>Can a student or programme receive a discount?<span>+</span></summary><p>Yes. Sponsored seats and verified education or community programmes should receive controlled allowances rather than a permanent blanket discount with no funding source.</p></details>
          <details><summary>Do the five free credits roll over?<span>+</span></summary><p>No. They reset on the first day of each month and unused free credits expire. This keeps the free tier generous enough to test real work without creating an open-ended cost.</p></details>
          <details><summary>What happens when credits finish?<span>+</span></summary><p>People can wait for renewal, buy a top-up or move to a larger plan. AI 360 will not silently create an overage bill for individuals.</p></details>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
