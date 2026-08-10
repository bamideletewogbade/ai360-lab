export const PROJECT_STAGES = [
  { id: 'brief', label: 'Brief', description: 'Goal and context' },
  { id: 'build', label: 'Build', description: 'Work in progress' },
  { id: 'review', label: 'Review', description: 'Check and approve' },
  { id: 'deliverables', label: 'Deliverables', description: 'Use and export' },
] as const

export type ProjectStage = (typeof PROJECT_STAGES)[number]['id']
export type ProjectPhase = 'briefing' | 'building' | 'project'
export type ProjectStageStatus = 'complete' | 'current' | 'upcoming'

export function projectStageStatuses(input: {
  phase: ProjectPhase
  approved?: number
  total?: number
}): Record<ProjectStage, ProjectStageStatus> {
  if (input.phase === 'briefing') {
    return { brief: 'current', build: 'upcoming', review: 'upcoming', deliverables: 'upcoming' }
  }
  if (input.phase === 'building') {
    return { brief: 'complete', build: 'current', review: 'upcoming', deliverables: 'upcoming' }
  }

  const reviewComplete = Boolean(input.total && input.approved === input.total)
  return {
    brief: 'complete',
    build: 'complete',
    review: reviewComplete ? 'complete' : 'current',
    deliverables: reviewComplete ? 'current' : 'upcoming',
  }
}

export function currentProjectStage(input: { approved: number; total: number }): ProjectStage {
  return input.total > 0 && input.approved === input.total ? 'deliverables' : 'review'
}
