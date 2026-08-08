'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

const VISIONS = [
  {
    person: 'New graduate',
    goal: 'Help me prepare for my first interview.',
    outcome: 'Interview confidence kit',
    detail: 'Role research, practice answers and a focused seven-day plan.',
    deliverables: ['Research', 'Practice', 'Action plan'],
  },
  {
    person: 'Student',
    goal: 'Make this difficult topic finally make sense.',
    outcome: 'Personal learning path',
    detail: 'A simple explanation, local examples and a short knowledge check.',
    deliverables: ['Explain', 'Examples', 'Quiz'],
  },
  {
    person: 'Parent',
    goal: 'Help me organise our family’s busy week.',
    outcome: 'A calmer week',
    detail: 'Priorities, a shared schedule and clear reminders for everyone.',
    deliverables: ['Organise', 'Schedule', 'Share'],
  },
  {
    person: 'Community team',
    goal: 'Turn our youth programme idea into a real plan.',
    outcome: 'Programme starter pack',
    detail: 'Needs research, an action plan and materials ready to present.',
    deliverables: ['Discover', 'Plan', 'Present'],
  },
  {
    person: 'Public servant',
    goal: 'Make this policy easier for citizens to understand.',
    outcome: 'Citizen-ready brief',
    detail: 'The evidence, plain-language guidance and a communication pack.',
    deliverables: ['Evidence', 'Simplify', 'Communicate'],
  },
]

export function HeroVision() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const vision = VISIONS[active]

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % VISIONS.length)
    }, 4400)
    return () => window.clearInterval(timer)
  }, [paused])

  return (
    <div
      className="hero-vision"
      aria-label="AI 360 helps different people turn goals into real momentum"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="vision-orbit" aria-hidden="true"><i /><i /><i /><i /></div>

      <div className="vision-stage">
        <header className="vision-header">
          <span><i /> AI 360 · LIVE</span>
          <b>ONE GOAL → REAL MOMENTUM</b>
          <small>{String(active + 1).padStart(2, '0')} / {String(VISIONS.length).padStart(2, '0')}</small>
        </header>

        <div className="vision-canvas">
          <span className="vision-coordinate coordinate-one">01° 16&apos; W</span>
          <span className="vision-coordinate coordinate-two">05° 36&apos; N</span>
          <div className="vision-crosshair" aria-hidden="true" />

          <article className="vision-goal" key={`goal-${active}`}>
            <div><span>FROM</span><b>{vision.person}</b></div>
            <p>“{vision.goal}”</p>
            <small>Say it in your own words</small>
          </article>

          <div className="vision-link link-in" aria-hidden="true"><i /></div>
          <div className="vision-link link-out" aria-hidden="true"><i /></div>

          <div className="vision-core" aria-hidden="true">
            <span className="core-ring ring-one" />
            <span className="core-ring ring-two" />
            <span className="core-pulse" />
            <div className="core-mark"><Image src="/icon-white.png" width={48} height={48} alt="" /></div>
            <small>AI 360</small>
          </div>

          <article className="vision-outcome" key={`outcome-${active}`}>
            <div className="outcome-status"><span>READY TO USE</span><i>✓</i></div>
            <h3>{vision.outcome}</h3>
            <p>{vision.detail}</p>
            <div className="outcome-parts">
              {vision.deliverables.map((item, index) => <span key={item}><i>{index + 1}</i>{item}</span>)}
            </div>
          </article>

          <div className="vision-thinking" aria-hidden="true">
            <span>UNDERSTAND</span><i /><span>RESEARCH</span><i /><span>CREATE</span><i /><span>CHECK</span>
          </div>
        </div>

        <footer className="vision-footer">
          <p><span>✦</span><b>Intelligence should meet you where you are.</b></p>
          <div className="vision-selector" role="group" aria-label="Explore AI 360 stories">
            {VISIONS.map((item, index) => (
              <button
                type="button"
                key={item.person}
                className={active === index ? 'active' : ''}
                onClick={() => setActive(index)}
                aria-label={`Show ${item.person} example`}
                aria-pressed={active === index}
              ><span>{item.person}</span></button>
            ))}
          </div>
        </footer>
      </div>

      <div className="vision-float vision-float-one"><span>∞</span><p><b>Built for real life</b><small>Many starting points, one place</small></p></div>
      <div className="vision-float vision-float-two"><span>✦</span><p><b>Human in control</b><small>You review the important parts</small></p></div>
    </div>
  )
}
