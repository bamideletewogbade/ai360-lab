'use client'

import { ProjectKnowledge } from '@/components/ProjectKnowledge'

const STARTING_POINTS = [
  { label: 'Research a topic', prompt: 'Research this topic and give me a clear, sourced understanding: ' },
  { label: 'Make a plan', prompt: 'Turn this goal into a practical plan with milestones and next steps: ' },
  { label: 'Write something', prompt: 'Help me write and refine: ' },
  { label: 'Learn or teach', prompt: 'Create a clear learning experience for: ' },
]

/**
 * A newly created project.
 *
 * This screen used to open with a full-height hero, a "What do you want to get
 * done?" headline and a three-step explanation of how the workspace works. That
 * is onboarding, and it was being shown to someone who had already committed by
 * naming a project — so the first thing they met was a brochure rather than
 * somewhere to work.
 *
 * It is now a working surface: the composer is the page, and the knowledge base
 * sits beside it as a real panel rather than marketing copy in a dock below the
 * fold. The project's name is already in the bar above, so it is not repeated.
 */
export function ProjectStart({
  projectId,
  signedIn,
  value,
  onChange,
  onSubmit,
  busy,
}: {
  projectId: string
  signedIn: boolean
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  busy: boolean
}) {
  const ready = value.trim().length > 0 && !busy

  return (
    <div className="project-start">
      <section className="project-start-main" aria-label="Start the work">
        <form
          className="project-start-form"
          onSubmit={(event) => { event.preventDefault(); if (ready) onSubmit() }}
        >
          <label htmlFor="project-goal">What outcome are you working toward?</label>
          <textarea
            id="project-goal"
            rows={5}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="For example: research solar options for my school, compare the tradeoffs, and recommend a practical next step."
            autoFocus
          />
          <div className="project-start-actions">
            <span>A rough idea is enough. AI360 asks only what changes the work.</span>
            <button type="submit" disabled={!ready}>
              {busy ? 'Starting…' : 'Create first outputs'} <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>

        <div className="project-start-chips" aria-label="Starting points">
          {STARTING_POINTS.map((item) => (
            <button type="button" key={item.label} onClick={() => onChange(item.prompt)}>
              {item.label}
            </button>
          ))}
        </div>

        <p className="project-start-assurance">
          <span aria-hidden="true">✓</span> You review everything. Nothing is published or sent without your approval.
        </p>
      </section>

      <aside className="project-start-side" aria-label="Project knowledge">
        <ProjectKnowledge projectId={projectId} signedIn={signedIn} />
      </aside>
    </div>
  )
}
