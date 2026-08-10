'use client'

import {
  PROJECT_STAGES,
  projectStageStatuses,
  type ProjectPhase,
  type ProjectStage,
} from '@/lib/studio-stages'

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
  const statuses = projectStageStatuses({ phase, approved, total })

  return (
    <nav className="project-stage-nav" aria-label="Project stages">
      <ol>
        {PROJECT_STAGES.map((stage, index) => {
          const status = statuses[stage.id]
          const active = activeStage === stage.id
          const content = (
            <>
              <span className="stage-number" aria-hidden="true">{status === 'complete' ? '✓' : String(index + 1).padStart(2, '0')}</span>
              <span className="stage-copy"><b>{stage.label}</b><small>{stage.description}</small></span>
              <span className="stage-state">{status === 'complete' ? 'Done' : status === 'current' ? 'Now' : 'Next'}</span>
            </>
          )
          return (
            <li className={`${status}${active ? ' active' : ''}`} key={stage.id}>
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
