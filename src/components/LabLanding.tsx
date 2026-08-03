'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Show, UserButton } from '@clerk/nextjs'
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { HeroVision } from '@/components/HeroVision'

const AUTH_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

const STARTERS = [
  { mark: '01', label: 'Understand a topic', mode: 'chat', prompt: 'Teach me this topic in simple steps, then help me test what I understand: ' },
  { mark: '02', label: 'Plan my next step', mode: 'agent', prompt: 'Help me understand my options and create a practical next-step plan for: ' },
  { mark: '03', label: 'Create something', mode: 'studio', prompt: 'Help me turn this idea into useful, ready-to-share materials: ' },
  { mark: '04', label: 'Research a decision', mode: 'agent', prompt: 'Research this decision using reliable current sources and recommend practical next steps: ' },
]

const OUTPUTS = [
  { number: '01', title: 'Learn and study', copy: 'Understand difficult topics, practise what you know and turn notes into useful study material.' },
  { number: '02', title: 'Grow your career', copy: 'Prepare applications, interviews, presentations and practical plans for your next move.' },
  { number: '03', title: 'Organise everyday life', copy: 'Plan family tasks, important decisions, events and personal projects with less stress.' },
  { number: '04', title: 'Build an idea', copy: 'Create a brand, proposal, campaign, image or video for a new or growing venture.' },
  { number: '05', title: 'Support a community', copy: 'Help an NGO or community team research needs, plan programmes and communicate impact.' },
  { number: '06', title: 'Improve public service', copy: 'Turn evidence and public needs into clearer briefs, programmes and citizen communication.' },
]

export function LabLanding() {
  const router = useRouter()
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState('auto')
  const [selectedStarter, setSelectedStarter] = useState<string | null>(null)

  function begin(event?: FormEvent) {
    event?.preventDefault()
    const value = prompt.trim()
    const query = new URLSearchParams()
    if (value) query.set('prompt', value)
    if (mode !== 'auto') query.set('mode', mode)
    router.push(`/app${query.size ? `?${query}` : ''}`)
  }

  function chooseStarter(starter: (typeof STARTERS)[number]) {
    setPrompt(starter.prompt)
    setMode(starter.mode)
    setSelectedStarter(starter.label)
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  function submitWithKeyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') begin()
  }

  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Lab navigation">
        <Link href="/" className="landing-logo" aria-label="AI 360 Lab home">
          <Image src="/logo-black.png" width={180} height={44} alt="AI Three Sixty" priority />
          <span>LAB</span>
        </Link>
        <div className="landing-links">
          <a href="#outcomes">What you can make</a>
          <a href="#how">Simple process</a>
          <Link href="/pricing">Pricing</Link>
          <a href="https://aithreesixty.tech">AI 360 home</a>
        </div>
        <LandingAccountActions />
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="landing-kicker"><span>✦</span> AI 360 Lab</p>
          <h1>Turn your idea into<br /><em>useful work.</em></h1>
          <p className="landing-lead">Tell AI 360 what you want to understand, decide, create or complete. It helps you move from a first thought to useful work.</p>

          <form className="landing-composer" action="/app" method="get" onSubmit={begin}>
            <label htmlFor="landing-goal">What are you working on?</label>
            <textarea
              ref={composerRef}
              id="landing-goal"
              name="prompt"
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value)
                setMode('auto')
                setSelectedStarter(null)
              }}
              onKeyDown={submitWithKeyboard}
              placeholder="Example: Help me prepare for an interview, understand a topic or plan a community project..."
              rows={3}
            />
            <input type="hidden" name="mode" value={mode} />
            <div className="composer-actions">
              <span><b>✦</b> AI 360 chooses the best way to help</span>
              <button type="submit">Start with AI 360 <b aria-hidden="true">↗</b></button>
            </div>
          </form>

          <div className="landing-starters" aria-label="Popular starting points">
            {STARTERS.map((starter) => (
              <button
                type="button"
                className={selectedStarter === starter.label ? 'selected' : ''}
                key={starter.label}
                onClick={() => chooseStarter(starter)}
              >
                <span>{starter.mark}</span>{starter.label}
              </button>
            ))}
          </div>
          <p className="landing-guest-note"><i /> Try it without an account. <Link href="/sign-up">Create one</Link> when you want to save your work across devices.</p>
        </div>

        <HeroVision />
      </section>

      <section className="landing-proof" aria-label="AI 360 capabilities">
        <span><b>Current research</b><small>Live sources when accuracy depends on today</small></span>
        <span><b>Uses what you share</b><small>Brand guides, documents, images and voice</small></span>
        <span><b>Progress you can see</b><small>Know what is done, being made and ready to check</small></span>
        <span><b>Ready to use</b><small>Study aids, plans, documents, images and video</small></span>
      </section>

      <section className="landing-section outcomes" id="outcomes">
        <div className="landing-section-head">
          <p><span>✦</span> What you can make</p>
          <h2>Whatever your goal,<br />start where you are.</h2>
          <span>No special words or technical experience needed. Explain what matters to you and AI 360 helps you take the next useful step.</span>
        </div>
        <div className="outcome-grid">
          {OUTPUTS.map((output) => (
            <Link href="/app" className="outcome-card" key={output.number}>
              <span>{output.number}</span>
              <div><h3>{output.title}</h3><p>{output.copy}</p></div>
              <i aria-hidden="true">↗</i>
            </Link>
          ))}
        </div>
      </section>

      <section className="landing-process" id="how">
        <div className="process-copy">
          <p><span>✦</span> A simple process</p>
          <h2>You bring the goal.<br />AI 360 helps you move.</h2>
          <Link href="/app">Start your first project <span aria-hidden="true">↗</span></Link>
        </div>
        <ol className="process-list">
          <li><span>01</span><div><b>Tell us</b><small>Describe your idea, need or challenge in your own words.</small></div></li>
          <li><span>02</span><div><b>AI 360 helps</b><small>It explains, researches, plans or creates based on what your goal needs.</small></div></li>
          <li><span>03</span><div><b>You review</b><small>See the work, ask for changes and approve important actions.</small></div></li>
          <li><span>04</span><div><b>Put it to use</b><small>Download the finished work or keep improving the project.</small></div></li>
        </ol>
      </section>

      <footer className="landing-footer">
        <Image src="/logo-black.png" width={146} height={36} alt="AI Three Sixty" />
        <p>AI 360 Lab <span>·</span> Intelligence that helps you finish the work.</p>
        <div><Link href="/pricing">Pricing</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/app">Try AI 360</Link></div>
      </footer>
    </main>
  )
}

function LandingAccountActions() {
  if (!AUTH_ENABLED) return <div className="landing-account-actions"><SignedOutLandingActions /></div>

  return (
    <div className="landing-account-actions">
      <Show when="signed-in" fallback={<SignedOutLandingActions />}>
        <span className="landing-user" aria-label="Your AI 360 account">
          <UserButton appearance={{ elements: { avatarBox: { width: 34, height: 34 } } }} showName={false} />
        </span>
        <Link href="/app" className="landing-open">Open workspace <span aria-hidden="true">↗</span></Link>
      </Show>
    </div>
  )
}

function SignedOutLandingActions() {
  return (
    <>
      <Link href="/sign-in" className="landing-sign-in">Sign in</Link>
      <Link href="/app" className="landing-open">Try AI 360 <span aria-hidden="true">↗</span></Link>
    </>
  )
}
