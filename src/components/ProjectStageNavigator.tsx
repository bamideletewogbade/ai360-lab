'use client'

import {
  PROJECT_STAGES,
  projectStageStatuses,
  type PipelineStage,
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
  const statuses = projectStageStatuses({ phase, approved, total })

  return (
    <nav className="project-stage-nav" aria-label="Project stages">
      <ol>
        {PROJECT_STAGES.map((stage) => {
          // Only the pipeline stages are numbered, and they are numbered among
          // themselves — Chats sits alongside them without taking a step number.
          const step = PROJECT_STAGES.filter((entry) => entry.pipeline).findIndex((entry) => entry.id === stage.id)
          const status = stage.pipeline ? statuses[stage.id as PipelineStage] : undefined
          const active = activeStage === stage.id
          const content = (
            <>
              {status ? (
                <span className="stage-number" aria-hidden="true">{status === 'complete' ? '✓' : String(step + 1).padStart(2, '0')}</span>
              ) : (
                <span className="stage-number stage-number-plain" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-2.8-.4L3 21l1.9-5a8.2 8.2 0 0 1-.9-3.7 8.4 8.4 0 0 1 8.4-8.4 8.4 8.4 0 0 1 8.6 8z" />
                  </svg>
                </span>
              )}
              <span className="stage-copy"><b>{stage.label}</b><small>{stage.description}</small></span>
              {status ? (
                <span className="stage-state">{status === 'complete' ? 'Done' : status === 'current' ? 'Now' : 'Next'}</span>
              ) : (
                <span className="stage-state">{count > 0 ? `${count}` : 'New'}</span>
              )}
            </>
          )
          return (
            <li className={`${status ?? 'ongoing'}${active ? ' active' : ''}`} key={stage.id}>
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
