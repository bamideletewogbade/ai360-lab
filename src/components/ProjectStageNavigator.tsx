'use client'

import {
  PROJECT_STAGES,
  type ProjectPhase,
  type ProjectStage,
} from '@/lib/studio-stages'

export function ProjectStageNavigator({
  phase,
  activeStage,
  approved = 0,
  total = 0,
  count = 0,
  onSelect,
}: {
  phase: ProjectPhase
  activeStage: ProjectStage
  approved?: number
  total?: number
  /** How many conversations this project holds, shown on the Chats entry. */
  count?: number
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
        {PROJECT_STAGES.map((stage) => {
          const active = activeStage === stage.id
          const content = (
            <>
              <span className="stage-copy"><b>{stage.label}</b><small>{stage.description}</small></span>
              {stage.id === 'chats' && count > 0 ? <span className="stage-state">{count}</span> : null}
              {stage.id === 'deliverables' && total > 0 ? <span className="stage-state">{approved}/{total}</span> : null}
            </>
          )
          return (
            <li className={active ? 'active' : ''} key={stage.id}>
              {onSelect ? (
                <button type="button" aria-current={active ? 'step' : undefined} onClick={() => onSelect(stage.id)}>{content}</button>
              ) : (
                <div className="stage-control" aria-current={active ? 'step' : undefined}>{content}</div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
