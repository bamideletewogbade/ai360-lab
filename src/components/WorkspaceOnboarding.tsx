'use client'

import Image from 'next/image'

export type OnboardingChoice = {
  mode: 'chat' | 'agent' | 'studio'
  prompt: string
}

const CHOICES: Array<OnboardingChoice & { mark: string; title: string; detail: string }> = [
  { mark: 'A', title: 'Get a quick answer', detail: 'Think, write, learn or solve an everyday task.', mode: 'chat', prompt: '' },
  { mark: '01', title: 'Learn or prepare', detail: 'Understand a topic, practise, study or prepare for an opportunity.', mode: 'chat', prompt: 'Help me learn or prepare for: ' },
  { mark: '⌕', title: 'Research a decision', detail: 'Investigate current information and return a sourced recommendation.', mode: 'agent', prompt: 'Research this and help me make a well-supported decision: ' },
  { mark: 'Aa', title: 'Create useful materials', detail: 'Produce a plan, report, proposal, presentation or public message.', mode: 'agent', prompt: 'Create a polished, ready-to-use deliverable for: ' },
  { mark: '◇', title: 'Build a campaign or brand', detail: 'Shape the strategy, identity, messages and production assets.', mode: 'studio', prompt: 'I want to create a coordinated campaign or brand asset pack for: ' },
]

export function WorkspaceOnboarding({ onChoose, onSkip }: { onChoose: (choice: OnboardingChoice) => void; onSkip: () => void }) {
  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <section className="onboarding-card">
        <div className="onboarding-brand"><Image src="/icon-mark-black.png" width={27} height={31} alt="" /><span><b>AI 360</b> LAB</span></div>
        <button className="onboarding-skip" onClick={onSkip}>Skip for now</button>
        <p className="onboarding-kicker"><span>✦</span> Welcome to your AI workspace</p>
        <h1 id="onboarding-title">What would you like<br />to accomplish?</h1>
        <p className="onboarding-intro">Choose an outcome and AI 360 will prepare the right starting point. You can switch modes at any time.</p>
        <div className="onboarding-choices">
          {CHOICES.map((choice) => (
            <button key={choice.title} onClick={() => onChoose(choice)}>
              <span>{choice.mark}</span>
              <span><b>{choice.title}</b><small>{choice.detail}</small></span>
              <i>↗</i>
            </button>
          ))}
        </div>
        <p className="onboarding-note"><span>●</span> Start as a guest. Your work stays on this device until you sign in.</p>
      </section>
    </div>
  )
}
