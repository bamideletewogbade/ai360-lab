'use client'

import {
  PROJECT_STAGES,
  type ProjectPhase,
  type ProjectStage,
} from '@/lib/studio-stages'

const PROJECT_DESTINATIONS = PROJECT_STAGES.filter((stage) =>
  stage.id === 'brief' || stage.id === 'review' || stage.id === 'build',
).map((stage) => ({
  ...stage,
  label: stage.id === 'brief' ? 'Home' : stage.id === 'review' ? 'Work' : 'Context',
  description: stage.id === 'brief' ? 'Project home' : stage.id === 'review' ? 'Review and finish' : 'Files and sources',
}))

function ProjectDestinationIcon({ stage }: { stage: ProjectStage }) {
  if (stage === 'brief') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20h-5v-5H9v5H4Z" /></svg>
  }
  if (stage === 'review') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9l3 3V20.5H6Z" /><path d="M15 3.5v4h4M9 12h6M9 16h4" /></svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6l2-2h9v13h-17Z" /><path d="M3.5 9.5h17" /></svg>
}

export function ProjectStageNavigator({
  phase,
  activeStage,
  approved = 0,
  total = 0,
  onSelect,
}: {
  phase: ProjectPhase
  activeStage: ProjectStage
  approved?: number
  total?: number
  onSelect?: (stage: ProjectStage) => void
}) {
  if (phase !== 'project') {
    const current = phase === 'briefing' ? 0 : 1
    const steps = [
      { label: 'Context', description: 'Clarify the goal' },
      { label: 'Create', description: 'Build the first outputs' },
      { label: 'Review', description: 'Keep, improve or export' },
    ]
    return (
      <nav className="project-stage-nav project-creation-nav" aria-label="Project creation progress">
        <ol>
          {steps.map((step, index) => (
            <li className={index < current ? 'complete' : index === current ? 'active' : 'upcoming'} key={step.label}>
              <div className="stage-control" aria-current={index === current ? 'step' : undefined}>
                <span className="stage-number" aria-hidden="true">{index < current ? '✓' : String(index + 1).padStart(2, '0')}</span>
                <span className="stage-copy"><b>{step.label}</b><small>{step.description}</small></span>
                <span className="stage-state">{index < current ? 'Done' : index === current ? 'Now' : 'Next'}</span>
              </div>
            </li>
          ))}
        </ol>
      </nav>
    )
  }

  return (
    <nav className="project-stage-nav project-tabs" aria-label="Project sections">
      <ol>
        {PROJECT_DESTINATIONS.map((stage) => {
          const active = activeStage === stage.id
          const content = (
            <>
              <span className="stage-symbol"><ProjectDestinationIcon stage={stage.id} /></span>
              <span className="stage-copy"><b>{stage.label}</b><small>{stage.description}</small></span>
              {stage.id === 'review' && total > 0 ? <span className="stage-state">{approved}/{total}</span> : null}
            </>
          )
          return (
            <li className={active ? 'active' : ''} key={stage.id}>
              {onSelect ? (
                <button type="button" aria-current={active ? 'page' : undefined} onClick={() => onSelect(stage.id)}>{content}</button>
              ) : (
                <div className="stage-control" aria-current={active ? 'page' : undefined}>{content}</div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
