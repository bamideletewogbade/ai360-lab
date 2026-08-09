'use client'

import Image from 'next/image'

export type OnboardingChoice = {
  mode: 'chat' | 'agent' | 'studio'
  prompt: string
}

const CHOICES: Array<OnboardingChoice & { mark: string; title: string; detail: string }> = [
  { mark: '01', title: 'Ask a question', detail: 'Get help thinking, writing, learning or solving an everyday task.', mode: 'chat', prompt: '' },
  { mark: '02', title: 'Learn or prepare', detail: 'Understand a topic, practise or prepare for an opportunity.', mode: 'chat', prompt: 'Help me learn or prepare for: ' },
  { mark: '03', title: 'Research a decision', detail: 'Investigate current information and return a checked recommendation with sources.', mode: 'agent', prompt: 'Research this and help me make a well-supported decision: ' },
  { mark: '04', title: 'Prepare a document', detail: 'Research and produce a plan, report, proposal or public message.', mode: 'agent', prompt: 'Research and prepare a ready-to-use document for: ' },
  { mark: '05', title: 'Start a business project', detail: 'Keep a campaign brief, decisions and ready-to-use assets together.', mode: 'studio', prompt: 'I want to start a campaign project for: ' },
]

export function WorkspaceOnboarding({ onChoose, onSkip }: { onChoose: (choice: OnboardingChoice) => void; onSkip: () => void }) {
  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <section className="onboarding-card">
        <div className="onboarding-brand"><Image src="/icon-mark-black.png" width={27} height={31} alt="" /><span><b>AI360</b> LAB</span></div>
        <button className="onboarding-skip" onClick={onSkip}>Skip for now</button>
        <p className="onboarding-kicker">Welcome to your AI workspace</p>
        <h1 id="onboarding-title">What would you like<br />to accomplish?</h1>
        <p className="onboarding-intro">Choose the kind of help you need. AI360 will prepare the right starting point, and you can change direction at any time.</p>
        <div className="onboarding-choices">
          {CHOICES.map((choice) => (
            <button key={choice.title} onClick={() => onChoose(choice)}>
              <span>{choice.mark}</span>
              <span><b>{choice.title}</b><small>{choice.detail}</small></span>
              <i aria-hidden="true">→</i>
            </button>
          ))}
        </div>
        <p className="onboarding-note"><span>●</span> Start as a guest. Your work stays on this device until you sign in.</p>
      </section>
    </div>
  )
}
