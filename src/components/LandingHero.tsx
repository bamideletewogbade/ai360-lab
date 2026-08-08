'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { HeroVision } from '@/components/HeroVision'

const STARTERS = [
  { mark: '01', label: 'Understand something', mode: 'chat', prompt: 'Help me understand this clearly, using simple steps and examples: ' },
  { mark: '02', label: 'Make a decision', mode: 'agent', prompt: 'Research my options, explain the trade-offs and recommend a practical next step for: ' },
  { mark: '03', label: 'Create and launch', mode: 'studio', prompt: 'Help me turn this idea into a clear direction and ready-to-share materials: ' },
  { mark: '04', label: 'Finish a task', mode: 'agent', prompt: 'Help me take this from where it is now to a checked, ready-to-use outcome: ' },
] as const

export function LandingHero() {
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
    <section className="landing-hero">
      <div className="hero-copy">
        <p className="landing-kicker">Intelligence that meets you where you are</p>
        <h1>Bring the goal.<br /><em>Leave ready to move.</em></h1>
        <p className="landing-lead">Understand what matters. Decide with evidence. Create with confidence. AI360 helps you finish the work, not just talk about it.</p>

        <form className="landing-composer" action="/app" method="get" onSubmit={begin}>
          <label htmlFor="landing-goal">What do you want to move forward?</label>
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
            placeholder="Tell us what you are trying to understand, decide, create or finish..."
            rows={3}
          />
          <input type="hidden" name="mode" value={mode} />
          <div className="composer-actions">
            <span>No special prompts. Start in your own words.</span>
            <button type="submit">Take the first step <b aria-hidden="true">↗</b></button>
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
        <p className="landing-guest-note"><i /> Start free, no card. <Link href="/sign-up">Create an account</Link> when you want your work on every device.</p>
      </div>

      <HeroVision />
    </section>
  )
}
