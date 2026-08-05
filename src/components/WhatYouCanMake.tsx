'use client'

import Link from 'next/link'
import { useState } from 'react'
import { SiteNav } from '@/components/SiteNav'
import { FEATURE_WEIGHTS } from '@/lib/billing/credits'
import styles from '@/app/marketing.module.css'

/**
 * Costs are read from the credit engine rather than written into the copy, so
 * a change to a feature weight cannot leave this page advertising an old price.
 */
const COST = {
  chat: `${FEATURE_WEIGHTS.chat.floor} credit`,
  research: `${FEATURE_WEIGHTS['chat.research'].floor} credits`,
  document: `${FEATURE_WEIGHTS['chat.document'].floor} credits`,
  agent: `${FEATURE_WEIGHTS.agent.floor} to ${FEATURE_WEIGHTS.agent.ceiling} credits`,
  image: `${FEATURE_WEIGHTS.image.floor} to ${FEATURE_WEIGHTS.image.ceiling} credits`,
  video: `${FEATURE_WEIGHTS.video.floor} to ${FEATURE_WEIGHTS.video.ceiling} credits`,
}

type Scenario = { title: string; situation: string; result: string; cost: string }

const AUDIENCES: Array<{ id: string; label: string; intro: string; scenarios: Scenario[] }> = [
  {
    id: 'learning',
    label: 'Students and graduates',
    intro: 'For coursework you have to understand rather than copy, and for the applications that come after it.',
    scenarios: [
      {
        title: 'Understand something you are stuck on',
        situation: 'Ask for a topic in plain steps, then ask it to test you on what you just read.',
        result: 'An explanation at your level, plus practice questions with worked answers.',
        cost: COST.chat,
      },
      {
        title: 'Turn your notes into revision material',
        situation: 'Attach a lecture PDF, a document or a photograph of your handwritten notes.',
        result: 'A structured summary, the key points, and questions to test yourself before an exam.',
        cost: COST.document,
      },
      {
        title: 'Prepare properly for an interview',
        situation: 'Name the organisation and the role. It researches them using live sources before it advises you.',
        result: 'What they do now, likely questions, and answers built from your own experience.',
        cost: COST.agent,
      },
      {
        title: 'Write an application you can send',
        situation: 'Draft a cover letter or personal statement, revise it, then export the final version.',
        result: 'A finished Word or PDF document, formatted and ready to attach.',
        cost: COST.chat,
      },
    ],
  },
  {
    id: 'business',
    label: 'Small businesses',
    intro: 'For the work a small team has no time or budget to outsource, done to a standard you can put in front of a customer.',
    scenarios: [
      {
        title: 'Give a new venture a name and a look',
        situation: 'Describe what you sell and who buys it. Studio works through the brand with you.',
        result: 'A brand direction, voice, colours and a tagline you can actually use.',
        cost: COST.agent,
      },
      {
        title: 'Make a campaign graphic',
        situation: 'Approve the creative direction first. Nothing is generated until you say so.',
        result: 'An original image built for your brand, ready to post or print.',
        cost: COST.image,
      },
      {
        title: 'Check a decision against the market',
        situation: 'Ask about pricing, competitors or suppliers. It searches current sources rather than guessing.',
        result: 'A short brief with the reasoning and links to where each claim came from.',
        cost: COST.research,
      },
      {
        title: 'Produce a short promotional video',
        situation: 'You see the exact price before anything is made, and you accept it before it starts.',
        result: 'A four second vertical clip for social media, downloadable.',
        cost: COST.video,
      },
    ],
  },
  {
    id: 'community',
    label: 'NGOs and community teams',
    intro: 'For small teams carrying work that normally needs a grant writer, a researcher and a communications officer.',
    scenarios: [
      {
        title: 'Draft a funding proposal',
        situation: 'Describe the programme, who it serves and what it needs. Refine section by section.',
        result: 'A structured proposal you can export and adapt per funder.',
        cost: COST.agent,
      },
      {
        title: 'Evidence a need with real sources',
        situation: 'Ask what is known about the problem in your area or sector.',
        result: 'A summary with citations you can check, not unattributed claims.',
        cost: COST.research,
      },
      {
        title: 'Turn a long report into a short brief',
        situation: 'Attach the report and say who the brief is for.',
        result: 'A one page version in the register your audience actually reads.',
        cost: COST.document,
      },
      {
        title: 'Make outreach materials',
        situation: 'Approve the message, then generate the artwork for it.',
        result: 'Graphics for a community campaign, consistent with the rest of your materials.',
        cost: COST.image,
      },
    ],
  },
  {
    id: 'public',
    label: 'Public service',
    intro: 'For turning evidence and public need into documents that are clear enough to act on.',
    scenarios: [
      {
        title: 'Write a policy brief from evidence',
        situation: 'Give it the context and the question the brief has to answer.',
        result: 'A structured brief with the reasoning visible and sources attached.',
        cost: COST.agent,
      },
      {
        title: 'Compare how others have done it',
        situation: 'Ask how comparable programmes were designed and what happened.',
        result: 'A comparison with current sources rather than recalled examples.',
        cost: COST.research,
      },
      {
        title: 'Rewrite for the people it affects',
        situation: 'Attach the notice, form or guidance that nobody understands.',
        result: 'A plain language version that keeps the meaning intact.',
        cost: COST.document,
      },
      {
        title: 'Summarise a consultation',
        situation: 'Attach the responses and ask what people actually said.',
        result: 'The themes, the disagreements and what was raised most often.',
        cost: COST.document,
      },
    ],
  },
]

export function WhatYouCanMake() {
  const [active, setActive] = useState(AUDIENCES[0].id)
  const audience = AUDIENCES.find((item) => item.id === active) ?? AUDIENCES[0]

  return (
    <main className={styles.page}>
      <SiteNav current="what" />

      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}><span>✦</span> What you can make</p>
          <h1>Not a chatbot.<br /><em>Finished work.</em></h1>
          <p className={styles.lead}>
            Most AI tools hand you text and leave the rest to you. AI 360 is built around the thing you
            were actually trying to produce: the brief, the application, the artwork, the plan you can
            act on.
          </p>
        </div>
        <div className={styles.heroAside}>
          <div className={styles.heroStat}>
            <b>You approve the expensive parts</b>
            <small>Images and video are never generated until you say so, and video shows its price first.</small>
          </div>
          <div className={styles.heroStat}>
            <b>Sources you can check</b>
            <small>When current information matters, it searches and links what it used.</small>
          </div>
          <div className={styles.heroStat}>
            <b>Work you can take away</b>
            <small>Export to Word or PDF. It belongs to you, not to a chat window.</small>
          </div>
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Start from who you are.</h2>
          <p>The same tools, pointed at the work in front of you. Every example below is something the Lab does today.</p>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Choose who you are">
          {AUDIENCES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === active}
              className={`${styles.tab} ${item.id === active ? styles.tabActive : ''}`}
              onClick={() => setActive(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <p className={styles.audienceIntro}>{audience.intro}</p>

        <div className={styles.scenarios}>
          {audience.scenarios.map((scenario, index) => (
            <article className={styles.scenario} key={scenario.title}>
              <div className={styles.scenarioTop}>
                <span className={styles.scenarioMark}>{String(index + 1).padStart(2, '0')}</span>
                <span className={styles.cost}>{scenario.cost}</span>
              </div>
              <h3>{scenario.title}</h3>
              <p>{scenario.situation}</p>
              <div className={styles.result}>
                <small>What you end up with</small>
                <span>{scenario.result}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.dark}>
        <div className={styles.sectionHead}>
          <h2>Why credits, and not a word count.</h2>
          <p>A short question and a four second video cost very different amounts to produce. One balance covers everything, and the harder work is where more of it goes.</p>
        </div>
        <div className={styles.darkGrid}>
          <div className={styles.darkCell}>
            <b>Everyday questions stay cheap</b>
            <p>Writing help, explanations and short conversations use the least. That is deliberate, because it is most of what people need.</p>
          </div>
          <div className={styles.darkCell}>
            <b>Research and files cost a little more</b>
            <p>Reading the live web or a long document is genuinely more work, so it draws more from your balance.</p>
          </div>
          <div className={styles.darkCell}>
            <b>Media is quoted before it runs</b>
            <p>Video shows you its price and waits for you to accept it. Nothing expensive happens without a decision from you.</p>
          </div>
          <div className={styles.darkCell}>
            <b>If it fails, you keep the credits</b>
            <p>Credits are held while work runs and only charged once it succeeds. Failed work returns the whole amount.</p>
          </div>
        </div>
      </section>

      <section className={styles.cta}>
        <h2>Bring the thing you have been putting off.</h2>
        <p>Five credits every month, free, no card. Enough to finish something real before you decide anything.</p>
        <div className={styles.ctaRow}>
          <Link href="/app" className={styles.primary}>Try it now <span aria-hidden="true">↗</span></Link>
          <Link href="/how-it-works" className={styles.secondary}>See how it works</Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>AI 360 Lab <span>·</span> Intelligence that helps you finish the work.</p>
        <div>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </footer>
    </main>
  )
}
