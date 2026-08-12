import Link from 'next/link'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteNav } from '@/components/SiteNav'
import { WorkflowDemo } from '@/components/WorkflowDemo'
import styles from '@/app/marketing.module.css'

const STEPS = [
  {
    mark: '01',
    title: 'Say what you need',
    copy: 'In your own words. There is nothing to learn and no special phrasing that works better.',
    detail: [
      'Type it, or record a voice note if that is faster',
      'Attach a document, a photograph of notes, or an image',
      'A half formed idea is a fine place to start',
    ],
  },
  {
    mark: '02',
    title: 'It picks the approach',
    copy: 'You are not asked to choose a model. AI360 reads what the task needs and routes it, using a faster model for a quick answer and a stronger one where the work justifies it.',
    detail: [
      'Current information triggers a live search',
      'A long document is read before it answers',
      'If one provider fails, it moves to another rather than giving up',
    ],
  },
  {
    mark: '03',
    title: 'You stay in the decisions',
    copy: 'Progress is visible while it works, and anything that costs real money waits for you.',
    detail: [
      'Images and video are only made once you approve them',
      'Video shows its exact price and waits for you to accept',
      'Credits are held, not spent, until the work succeeds',
    ],
  },
  {
    mark: '04',
    title: 'Take the work with you',
    copy: 'The point is the finished thing, not the conversation that produced it.',
    detail: [
      'Export to Word or PDF, formatted',
      'Download generated images and video',
      'Sign in and keep every project with your account',
    ],
  },
]

const LIMITS = [
  {
    title: 'It can be confidently wrong',
    copy: 'Every AI system can produce something that reads well and is not true. When a claim matters, check it. This is why research answers carry links to their sources.',
  },
  {
    title: 'It is not a professional adviser',
    copy: 'It can help you understand a medical, legal, financial or employment question and prepare for the conversation. It cannot replace a qualified person, and it will say so.',
  },
  {
    title: 'It does not act on the world',
    copy: 'It writes, researches and creates. It does not send your emails, move your money, or sign anything on your behalf. Every action outside the Lab stays yours.',
  },
  {
    title: 'Video is short, and silent',
    copy: 'Four seconds, vertical, no audio. It is built for a social post, not a film. We would rather be plain about that than let you spend credits finding out.',
  },
]

export function HowItWorks() {
  return (
    <main className={styles.page}>
      <SiteNav current="how" />

      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>How it works</p>
          <h1>You stay in<br /><em>control of it.</em></h1>
          <p className={styles.lead}>
            AI is easy to sell and hard to trust. So here is exactly what happens between the moment you
            ask for something and the moment you have it, including what it costs and what it will not do.
          </p>
        </div>
        <div className={styles.heroAside}>
          <div className={styles.heroStat}>
            <b>Nothing expensive is a surprise</b>
            <small>Costly work is quoted and approved before it starts, and refunded if it fails.</small>
          </div>
          <div className={styles.heroStat}>
            <b>Your access stays protected</b>
            <small>Sensitive credentials remain secured while AI360 handles the work.</small>
          </div>
          <div className={styles.heroStat}>
            <b>Try it without an account</b>
            <small>Start as a guest, then create an account whenever you want to keep your work.</small>
          </div>
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Four steps, no jargon.</h2>
          <p>The same shape whether you are asking a question, researching a decision or producing a campaign.</p>
        </div>
        <WorkflowDemo />
        <div className={styles.steps}>
          {STEPS.map((step) => (
            <article className={styles.step} key={step.mark}>
              <span className={styles.stepMark}>{step.mark}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </div>
              <div className={styles.stepDetail}>
                {step.detail.map((line) => (
                  <span key={line}><i aria-hidden="true">✓</i>{line}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.dark}>
        <div className={styles.sectionHead}>
          <h2>What a credit actually buys.</h2>
          <p>One balance covers chat, research, documents, images and video. You are never asked to think about tokens.</p>
        </div>
        <div className={styles.darkGrid}>
          <div className={styles.darkCell}>
            <b>Held before, charged after</b>
            <p>Credits are reserved when work begins and settled against what it actually used. Anything unused returns to your balance.</p>
          </div>
          <div className={styles.darkCell}>
            <b>Never more than you saw</b>
            <p>A task cannot cost more than the amount reserved in front of you, even if it turns out to be more expensive to run.</p>
          </div>
          <div className={styles.darkCell}>
            <b>Five free every month</b>
            <p>They arrive automatically and reset at the start of each month. No card, and no bill for going over.</p>
          </div>
          <div className={styles.darkCell}>
            <b>Failed work is free</b>
            <p>If something cannot be completed, the entire hold is returned. You are only charged for work you received.</p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>What it will not do.</h2>
          <p>Every product like this has limits. Most of them are discovered by users after they have paid. Here are ours, in advance.</p>
        </div>
        <div className={styles.limits}>
          {LIMITS.map((limit) => (
            <article className={styles.limit} key={limit.title}>
              <b>{limit.title}</b>
              <p>{limit.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.cta}>
        <h2>The only way to judge it is to use it.</h2>
        <p>Five credits a month, free, no card. Bring something real and see how far it gets.</p>
        <div className={styles.ctaRow}>
          <Link href="/app" className={styles.primary}>Start now <span aria-hidden="true">↗</span></Link>
          <Link href="/what-you-can-make" className={styles.secondary}>See what people make</Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
