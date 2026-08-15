'use client'

import Link from 'next/link'
import { BILLING_PLANS, CREDIT_GUIDE } from '@/lib/billing/catalog'
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
  return (
    <main className={styles.shell}>
      <SiteNav current="pricing" />

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Simple plans · flexible payment</p>
          <h1>Start free.<br /><em>Pay your way.</em></h1>
          <p>{BILLING_ENABLED
            ? 'Get 5 credits every month to explore AI360. When you need more, choose a plan and pay securely with Mobile Money or card. You will see the complete amount before you confirm.'
            : 'Get 5 credits every month to explore AI360. Paid plans are shown for transparency and will open after payment verification for the private pilot is complete.'}</p>
          <div className={styles.paymentTrust}>
            <span><i className={styles.freeDot} /> 5 free credits monthly</span>
            <span><i className={styles.momoDot} /> {BILLING_ENABLED ? 'Mobile Money or card' : 'Payments opening after pilot verification'}</span>
            <span><i /> No surprise overage bills</span>
          </div>
        </div>
        <div className={styles.paymentScene} aria-label="Mobile Money and card payments become AI360 work credits">
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
            <div><span>AI360</span><small>WORK WALLET</small></div>
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
          <div><p>AI360 plans</p><h2 id="plans-title">Choose the pace that fits.</h2></div>
          <div className={styles.pricingDecision}>
            <span>One-month pilot access</span>
            <p>Pay for one month at a time. Automatic renewal and annual billing stay off until renewal and refund operations are proven.</p>
          </div>
        </div>

        <div className={styles.planGrid}>
          {BILLING_PLANS.map((plan) => {
            const price = plan.monthlyPriceGhs
            const paid = price > 0
            const checkoutHref = `/checkout?plan=${plan.slug}`
            return (
              <article className={`${styles.plan} ${plan.featured ? styles.featured : ''}`} key={plan.slug}>
                {plan.featured && <span className={styles.recommended}>Best place to begin</span>}
                <p className={styles.planEyebrow}>{plan.eyebrow}</p>
                <h3>{plan.name}</h3>
                <p className={styles.audience}>{plan.audience}</p>
                <div className={styles.price}><span>GH₵</span><b>{price.toLocaleString()}</b><small>{paid ? '/ one month' : 'forever'}</small></div>
                <p className={styles.billingNote}>{plan.assisted ? 'Five people included · assisted pilot' : paid ? 'One month of access · renew only when you choose' : 'No payment method required'}</p>
                <div className={styles.creditLine}><span>{plan.includedCredits.toLocaleString()}</span><span>{plan.slug === 'explorer' ? 'free credits, reset monthly' : 'work credits for one month'}</span></div>
                <ul>{plan.features.map((feature) => <li key={feature}><span>✓</span>{feature}</li>)}</ul>
                <div className={styles.templates}><small>Example templates</small><p>{plan.templateExamples.join(' · ')}</p></div>
                {plan.assisted ? (
                  <a href="mailto:info@accrainnovationcentre.com?subject=AI360%20Team%20pilot" className={styles.choose}>
                    Request Team pilot
                  </a>
                ) : (
                  <Link href={paid && BILLING_ENABLED ? checkoutHref : paid ? `/sign-up?plan=${plan.slug}&cadence=monthly` : '/app'} className={paid ? styles.choose : styles.start}>
                    {paid ? (BILLING_ENABLED ? `Choose ${plan.name}` : `Join the ${plan.name} pilot`) : 'Start free'}
                  </Link>
                )}
              </article>
            )
          })}
        </div>
        <p className={styles.pilotNote}>{BILLING_ENABLED
          ? 'Prices are shown in Ghana cedis. Each successful payment buys one month of access and does not renew automatically during the pilot. Team onboarding is assisted.'
          : 'Paid checkout is not open yet. Joining a paid-plan pilot does not charge you; payment will only open after the payment and reconciliation flow passes verification. Team onboarding is assisted.'}</p>
      </section>

      <section className={styles.creditSection}>
        <div className={styles.creditIntro}>
          <p>Why work credits?</p>
          <h2>Simple for people.<br />Measured underneath.</h2>
          <p>You should not have to calculate technical tokens. Everyday chat is included with your plan, and heavier work draws from one understandable credit balance with an estimate shown before it runs.</p>
        </div>
        <div className={styles.creditRules}>
          <article><span>01</span><b>Everyday chat is included</b><p>Writing, learning and short conversations come with your plan, up to a fair daily limit that resets at midnight UTC. Extra messages after that cost 1 credit each.</p></article>
          <article><span>02</span><b>Deep work uses credits</b><p>Live research, premium models, agents, images and video draw from your balance.</p></article>
          <article><span>03</span><b>Media is confirmed first</b><p>Images and video show an estimate before generation begins.</p></article>
          <article><span>04</span><b>Failed work returns held credits</b><p>If a task cannot complete, unused reserved credits return to your balance.</p></article>
        </div>
        <div className={styles.creditGuide}>
          <div><b>What might work cost?</b><small>Shown before a task begins. Final charges follow measured work.</small></div>
          {CREDIT_GUIDE.map((item) => <div key={item.task}><span>{item.task}</span><b>{item.credits}</b></div>)}
        </div>
      </section>

      <section className={styles.templatesSection}>
        <div className={styles.sectionHead}>
          <div><p>More than model access</p><h2>Templates that help people finish.</h2></div>
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
          <p>Before you pay</p>
          <h2>{BILLING_ENABLED ? <>Review everything.<br />Then decide.</> : <>Payment is designed.<br />Verification comes first.</>}</h2>
          <p>{BILLING_ENABLED
            ? 'Checkout will repeat your selected plan, credits, billing period and complete amount. Nothing is charged until you choose a payment method and confirm.'
            : 'This is the checkout experience planned for launch. It remains disabled while delayed payments, repeat notifications, reversals and reconciliation are verified in the provider sandbox.'}</p>
          <div className={styles.methodRow}><span>MTN MoMo</span><span>Telecel Cash</span><span>AT Money</span><span>Visa</span><span>Mastercard</span></div>
        </div>
        <div className={styles.checkoutReview}>
          <div className={styles.reviewTop}><span>CHECKOUT PREVIEW</span><b>Clear before confirmation</b></div>
          <dl>
            <div><dt>Due today</dt><dd>Plan price plus clearly listed tax or fees</dd></div>
            <div><dt>Access</dt><dd>One month during the pilot, with no automatic renewal</dd></div>
            <div><dt>Included</dt><dd>Your plan features and monthly work credits</dd></div>
            <div><dt>Credits</dt><dd>Included allowance and expiry rules shown plainly</dd></div>
            <div><dt>Payment</dt><dd>Your selected Mobile Money wallet or card</dd></div>
            <div><dt>Control</dt><dd>Pay again only when you choose; refund terms shown before payment</dd></div>
          </dl>
          <p><span>✓</span> A receipt and updated credit balance appear after successful payment.</p>
        </div>
      </section>

      <section className={styles.faqSection}>
        <div><p>Important questions</p><h2>Clear before checkout.</h2></div>
        <div className={styles.faqs}>
          <details><summary>Why not promise unlimited AI?<span>+</span></summary><p>Model, research, image and video costs vary. An allowance keeps entry prices low and prevents one unusually expensive workflow from raising prices for everyone.</p></details>
          <details><summary>Will Mobile Money renew automatically?<span>+</span></summary><p>No. During the pilot, every payment buys one month of access. AI360 will not charge the wallet or card again unless you start and confirm another payment.</p></details>
          <details><summary>Will I see the complete price before paying?<span>+</span></summary><p>Yes. The final review shows the amount due today, one-month access period and any applicable tax or payment fee before you confirm.</p></details>
          <details><summary>Can I pay annually?<span>+</span></summary><p>Not during the first pilot. AI360 will prove repeat payments, reversals and refunds before asking anyone to make a longer commitment.</p></details>
          <details><summary>Can I stop or change my plan?<span>+</span></summary><p>Yes. There is nothing to cancel during the pilot because access does not renew automatically. You can choose a different plan when you make your next payment.</p></details>
          <details><summary>Can a student or programme receive a discount?<span>+</span></summary><p>Yes. Sponsored seats and verified education or community programmes should receive controlled allowances rather than a permanent blanket discount with no funding source.</p></details>
          <details><summary>Do the five free credits roll over?<span>+</span></summary><p>No. They reset on the first day of each month and unused free credits expire. This keeps the free tier generous enough to test real work without creating an open-ended cost.</p></details>
          <details><summary>What happens when credits finish?<span>+</span></summary><p>You can buy a one-time top-up of 40, 90 or 185 credits from your credit page whenever you need more. Top-ups cost more per credit than a plan, so a monthly plan is better value when you use AI360 regularly. AI360 will never create a silent overage bill.</p></details>
          <details><summary>What counts toward the daily chat limit?<span>+</span></summary><p>Everyday chat is included up to a daily fair-use limit (Explorer 10, Everyday 60, Builder 120, Team 150) that resets at midnight UTC. Past the limit, extra messages cost 1 credit each — the price is shown before the message runs. Paid work like research, files and premium models never counts toward the free limit, because it already draws from your credits.</p></details>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
