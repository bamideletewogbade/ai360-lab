'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { HeroVision } from '@/components/HeroVision'

/**
 * Starting points, cheapest door first.
 *
 * Research and Studio cost real money to run, so they require an account —
 * that guard is deliberate and stays. What was wrong was the order and the
 * silence: three of the four starters led a signed-out visitor straight into
 * "Sign in to use this" one click after a button promising a first step. The
 * free paths now lead, and anything behind the account is labelled before it is
 * clicked rather than after.
 */
const STARTERS = [
  {
    mark: '01',
    label: 'Understand something',
    mode: 'chat',
    prompt: 'Help me understand this clearly, using simple steps and examples: ',
  },
  {
    mark: '02',
    label: 'Plan something',
    mode: 'chat',
    prompt: 'Help me turn this into a calm, practical plan I can actually follow: ',
  },
  {
    mark: '03',
    label: 'Make a decision',
    mode: 'agent',
    prompt: 'Research my options, explain the trade-offs and recommend a practical next step for: ',
    requiresAccount: true,
  },
  {
    mark: '04',
    label: 'Create and launch',
    mode: 'studio',
    prompt: 'Help me turn this idea into a clear direction and ready-to-share materials: ',
    requiresAccount: true,
  },
] as const

/**
 * What the button runs when the box is empty.
 *
 * An empty click used to open an empty composer somewhere else, which asks the
 * visitor to start twice. This is a complete question on purpose, and it stays
 * on the free chat path so it works for someone with no account.
 */
const EXAMPLE_PROMPT =
  'Show me what you can do: explain how mobile money fees work in Ghana, then give me three practical ways a small trader can lower what they pay.'

export function LandingHero() {
  const router = useRouter()
  const { user } = useAuth()
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState('auto')
  const [selectedStarter, setSelectedStarter] = useState<string | null>(null)

  const written = prompt.trim()
  /**
   * Words we supplied are not yet a goal. A starter drops in an opening like
   * "Research my options … for: " and the person is meant to finish the
   * sentence; submitting it untouched sent a dangling half-question and got an
   * answer to nothing. So the rule is simple and consistent across the site:
   * what the person typed runs, what we pre-wrote waits in the box.
   */
  const unfinishedStarter = STARTERS.some((starter) => written === starter.prompt.trim())
  const ready = Boolean(written) && !unfinishedStarter

  function begin(event?: FormEvent) {
    event?.preventDefault()

    if (unfinishedStarter) {
      focusComposer()
      return
    }

    const value = written || EXAMPLE_PROMPT
    const query = new URLSearchParams({ prompt: value })
    // The example is a plain question, so it must never inherit a starter's
    // research or studio mode and land on a sign-in wall.
    if (written && mode !== 'auto') query.set('mode', mode)
    router.push(`/app?${query}`)
  }

  /**
   * Put the cursor where the person is meant to keep typing.
   *
   * Two details matter. The wait is a timer rather than an animation frame
   * because what this needs is the state commit, not the next paint — and an
   * animation frame does not run at all in a tab the browser is not painting.
   * The lookup prefers a laid-out field because every marketing page is
   * currently served with a second, hidden copy of itself inside React's
   * streaming container; a ref bound into that `display: none` subtree would
   * make `focus()` a silent no-op. That duplicate render is a separate defect
   * worth its own fix, and this stays correct once it is gone.
   */
  function focusComposer() {
    const laidOut = (field: HTMLTextAreaElement) => field.offsetParent !== null
    const fields = Array.from(document.querySelectorAll<HTMLTextAreaElement>('#landing-goal'))
    const field = fields.find(laidOut) ?? composerRef.current
    if (!field) return
    field.focus()
    field.setSelectionRange(field.value.length, field.value.length)
  }

  function chooseStarter(starter: (typeof STARTERS)[number]) {
    setPrompt(starter.prompt)
    setMode(starter.mode)
    setSelectedStarter(starter.label)
    // Focus has to survive the re-render this triggers.
    window.setTimeout(focusComposer, 0)
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
            <span>
              {unfinishedStarter
                ? 'Finish the sentence in your own words.'
                : 'No special prompts. Start in your own words.'}
            </span>
            <button type="submit">
              {ready ? 'Start with this' : unfinishedStarter ? 'Finish the sentence' : 'Show me an example'}
            </button>
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
              {'requiresAccount' in starter && starter.requiresAccount && !user
                ? <i className="starter-gate">Free account</i>
                : null}
            </button>
          ))}
        </div>
        <p className="landing-guest-note">
          <i /> Free to try, no card and no account needed.{' '}
          <Link href="/sign-up">Create a free account</Link> to keep your work, and for research and Studio.
        </p>
      </div>

      <HeroVision />
    </section>
  )
}
