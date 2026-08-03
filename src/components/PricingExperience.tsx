'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { BILLING_PLANS, BILLING_CATALOG_VERSION, CREDIT_TOP_UPS, planPrice, type BillingCadence } from '@/lib/billing/catalog'
import styles from '@/app/pricing/pricing.module.css'

const TEMPLATE_GROUPS = [
  { mark: '01', name: 'Learn and prepare', examples: 'Study coach, exam preparation, interview practice', access: 'Free + Everyday' },
  { mark: '02', name: 'Decide with evidence', examples: 'Market research, comparison, policy brief', access: 'Everyday + Builder' },
  { mark: '03', name: 'Create and launch', examples: 'Brand launch, campaign builder, event pack', access: 'Builder' },
  { mark: '04', name: 'Serve a community', examples: 'NGO proposal, outreach plan, impact report', access: 'Builder + Team' },
]

const REVENUE_STREAMS = [
  ['Subscriptions', 'Predictable access for individuals and teams.'],
  ['Credit top-ups', 'Occasional extra capacity without forcing a plan upgrade.'],
  ['Organization plans', 'Shared workspaces, governance, reporting and support.'],
  ['Template packs', 'Expert workflows for careers, education, business and public impact.'],
  ['Implementation services', 'Onboarding, training, brand setup and workflow design.'],
  ['Sponsored access', 'Employers, programmes and donors fund credits for a defined group.'],
]

export function PricingExperience() {
  const [cadence, setCadence] = useState<BillingCadence>('monthly')

  return (
    <main className={styles.shell}>
      <nav className={styles.nav} aria-label="Pricing navigation">
        <Link href="/" className={styles.logo} aria-label="AI 360 Lab home">
          <Image src="/logo-black.png" width={180} height={44} alt="AI Three Sixty" priority />
          <span>LAB</span>
        </Link>
        <div className={styles.navLinks}>
          <Link href="/#outcomes">What you can make</Link>
          <Link href="/pricing" aria-current="page">Pricing</Link>
          <a href="https://aithreesixty.tech">AI 360 home</a>
        </div>
        <Link href="/app" className={styles.open}>Try AI 360 free <span>↗</span></Link>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}><span>✦</span> Fair access, sustainable intelligence</p>
          <h1>Powerful AI.<br /><em>Priced for real life.</em></h1>
          <p>Start free, pay in Ghana cedis and use Mobile Money without needing a card. Paid plans combine useful access with a clear allowance so AI 360 can stay affordable as people create more.</p>
          <div className={styles.paymentTrust}>
            <span><i className={styles.momoDot} /> Mobile Money first</span>
            <span><i /> Local and international cards</span>
            <span><i /> Cancel between billing periods</span>
          </div>
        </div>
        <div className={styles.priceSignal} aria-hidden="true">
          <div className={styles.signalOrbit}><i /><i /><i /><span>GH₵</span></div>
          <div className={styles.signalCard}><small>LOCAL ACCESS</small><b>Start at GH₵0</b><span>Move up only when the work needs it.</span></div>
          <div className={styles.signalCard}><small>PAY YOUR WAY</small><b>MoMo · Card</b><span>One checkout, familiar payment choices.</span></div>
        </div>
      </header>

      <section className={styles.pricingSection} aria-labelledby="plans-title">
        <div className={styles.sectionHead}>
          <div><p><span>✦</span> Proposed pilot pricing</p><h2 id="plans-title">Choose the pace that fits.</h2></div>
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
                <div className={styles.creditLine}><span>{plan.includedCredits.toLocaleString()}</span><span>work credits included monthly</span></div>
                <ul>{plan.features.map((feature) => <li key={feature}><span>✓</span>{feature}</li>)}</ul>
                <div className={styles.templates}><small>Example templates</small><p>{plan.templateExamples.join(' · ')}</p></div>
                <Link href={paid ? `/sign-up?plan=${plan.slug}` : '/app'} className={paid ? styles.choose : styles.start}>
                  {paid ? 'Join the pricing pilot' : 'Start free'} <span>↗</span>
                </Link>
              </article>
            )
          })}
        </div>
        <p className={styles.pilotNote}>Pilot proposal {BILLING_CATALOG_VERSION}. Final allowances, taxes and provider fees will be confirmed from measured usage before checkout opens.</p>
      </section>

      <section className={styles.creditSection}>
        <div className={styles.creditIntro}>
          <p><span>✦</span> Why work credits?</p>
          <h2>Simple for people.<br />Measured underneath.</h2>
          <p>Tokens are a provider measurement, not a useful price tag. AI 360 credits turn different kinds of work into one understandable allowance and show an estimate before expensive tasks begin.</p>
        </div>
        <div className={styles.creditRules}>
          <article><span>01</span><b>Everyday work stays light</b><p>Writing, learning and short conversations use fewer credits.</p></article>
          <article><span>02</span><b>Deep work uses more</b><p>Long research, premium models and large files consume more capacity.</p></article>
          <article><span>03</span><b>Media is confirmed first</b><p>Images and video show an estimate before generation begins.</p></article>
          <article><span>04</span><b>Unused money is never guessed</b><p>Failed work releases reserved credits and every charge enters a ledger.</p></article>
        </div>
        <div className={styles.topups}>
          <span><b>Need a little more?</b><small>One-time top-ups proposed for paid plans</small></span>
          {CREDIT_TOP_UPS.map((topup) => <span key={topup.slug}><b>GH₵{topup.priceGhs}</b><small>{topup.credits} credits</small></span>)}
        </div>
      </section>

      <section className={styles.templatesSection}>
        <div className={styles.sectionHead}>
          <div><p><span>✦</span> More than model access</p><h2>Templates that help people finish.</h2></div>
          <p>Plans become valuable when they package AI into repeatable outcomes. Each template carries a brief, steps, expected deliverables, checks and a cost envelope.</p>
        </div>
        <div className={styles.templateGrid}>
          {TEMPLATE_GROUPS.map((template) => (
            <article key={template.name}><span>{template.mark}</span><h3>{template.name}</h3><p>{template.examples}</p><small>{template.access}</small></article>
          ))}
        </div>
      </section>

      <section className={styles.businessSection}>
        <div className={styles.businessLead}>
          <p><span>✦</span> A business that can keep serving</p>
          <h2>Several revenue streams.<br />One trusted product.</h2>
          <p>Subscriptions fund continuity. Credits control variable AI cost. Services, organizations and sponsored access grow revenue without raising the entry price for everyone.</p>
        </div>
        <div className={styles.revenueGrid}>
          {REVENUE_STREAMS.map(([title, copy], index) => <article key={title}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{title}</b><p>{copy}</p></div></article>)}
        </div>
      </section>

      <section className={styles.paymentSection}>
        <div className={styles.paymentCopy}>
          <p><span>✦</span> Ghana-first checkout</p>
          <h2>MojoPay at the edge.<br />AI 360 owns the truth.</h2>
          <p>MojoPay will collect Mobile Money and card payments. AI 360 will keep the plan, entitlement, payment attempt, credit reservation and audit records so we can change providers without losing customer history.</p>
          <div className={styles.methodRow}><span>MTN MoMo</span><span>Telecel Cash</span><span>AT Money</span><span>Visa</span><span>Mastercard</span></div>
        </div>
        <ol className={styles.paymentFlow}>
          <li><span>01</span><div><b>Choose a plan</b><small>Price and expected allowance are recorded.</small></div></li>
          <li><span>02</span><div><b>Open MojoPay checkout</b><small>MoMo is shown first, cards remain available.</small></div></li>
          <li><span>03</span><div><b>Verify server to server</b><small>A signed webhook confirms the provider result.</small></div></li>
          <li><span>04</span><div><b>Activate entitlement</b><small>Only verified payment updates access and credits.</small></div></li>
        </ol>
      </section>

      <section className={styles.faqSection}>
        <div><p><span>✦</span> Important questions</p><h2>Clear before checkout.</h2></div>
        <div className={styles.faqs}>
          <details><summary>Why not promise unlimited AI?<span>+</span></summary><p>Model, research, image and video costs vary. An allowance keeps entry prices low and prevents one unusually expensive workflow from raising prices for everyone.</p></details>
          <details><summary>Will Mobile Money renew automatically?<span>+</span></summary><p>Only if MojoPay confirms a compliant recurring authorization flow. Otherwise AI 360 will send a renewal reminder and let the customer approve each monthly payment.</p></details>
          <details><summary>Can a student or programme receive a discount?<span>+</span></summary><p>Yes. Sponsored seats and verified education or community programmes should receive controlled allowances rather than a permanent blanket discount with no funding source.</p></details>
          <details><summary>What happens when credits finish?<span>+</span></summary><p>People can wait for renewal, buy a small top-up or move to a larger plan. AI 360 will not silently create an overage bill for individuals.</p></details>
        </div>
      </section>

      <footer className={styles.footer}>
        <Image src="/logo-black.png" width={146} height={36} alt="AI Three Sixty" />
        <p>Fair access needs clear limits, familiar payments and useful outcomes.</p>
        <div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/app">Try AI 360</Link></div>
      </footer>
    </main>
  )
}
