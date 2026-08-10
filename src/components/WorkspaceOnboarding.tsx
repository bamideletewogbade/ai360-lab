'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
  ONBOARDING_GOALS, ONBOARDING_ROLES,
  type OnboardingGoal, type OnboardingProfile, type OnboardingRole,
} from '@/lib/onboarding'

/**
 * A two-question first-run router. It exists to personalize the empty state,
 * not to collect data, so it is one screen, skippable, and never blocks. The
 * goal answer is what reshapes the suggested prompts; the role tunes the copy.
 */
export function WorkspaceOnboarding({
  onComplete,
  onSkip,
}: {
  onComplete: (profile: OnboardingProfile) => void
  onSkip: () => void
}) {
  const [role, setRole] = useState<OnboardingRole | null>(null)
  const [goal, setGoal] = useState<OnboardingGoal | null>(null)

  const ready = role !== null && goal !== null

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <section className="onboarding-card intake-card">
        <div className="onboarding-brand"><Image src="/icon-mark-black.png" width={27} height={31} alt="" /><span><b>AI360</b> LAB</span></div>
        <button className="onboarding-skip" onClick={onSkip}>Skip for now</button>
        <p className="onboarding-kicker">Welcome to your AI workspace</p>
        <h1 id="onboarding-title">Let us shape this<br />around you</h1>
        <p className="onboarding-intro">Two quick taps and your workspace starts with the right ideas. You can change anything later.</p>

        <div className="intake-question">
          <p className="intake-label"><span>1</span> Which best describes you?</p>
          <div className="intake-options">
            {ONBOARDING_ROLES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`intake-chip ${role === option.id ? 'selected' : ''}`}
                aria-pressed={role === option.id}
                onClick={() => setRole(option.id)}
              >
                <b>{option.label}</b>
                <small>{option.detail}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="intake-question">
          <p className="intake-label"><span>2</span> What do you want to get done?</p>
          <div className="intake-options">
            {ONBOARDING_GOALS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`intake-chip ${goal === option.id ? 'selected' : ''}`}
                aria-pressed={goal === option.id}
                onClick={() => setGoal(option.id)}
              >
                <b>{option.label}</b>
                <small>{option.detail}</small>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="intake-continue"
          disabled={!ready}
          onClick={() => ready && onComplete({ role, goal })}
        >
          {ready ? 'Show me my workspace' : 'Pick one from each'}
          <i aria-hidden="true">→</i>
        </button>

        <p className="onboarding-note"><span>●</span> Start as a guest. Your work stays on this device until you sign in.</p>
      </section>
    </div>
  )
}
