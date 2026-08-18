/**
 * The destinations inside a project.
 *
 * Four of these are a pipeline — brief, build, review, deliverables — and carry
 * a step number and a Done/Now/Next state. Chats is not: a project's
 * conversations are ongoing work, not a stage you finish and leave behind, so it
 * is marked `pipeline: false` and renders without a number or a status.
 */
export const PROJECT_STAGES = [
  { id: 'chats', label: 'Chats', description: 'Work in this project', pipeline: false },
  { id: 'brief', label: 'Brief', description: 'Goal and context', pipeline: true },
  { id: 'build', label: 'Build', description: 'Work in progress', pipeline: true },
  { id: 'review', label: 'Review', description: 'Check and approve', pipeline: true },
  { id: 'deliverables', label: 'Deliverables', description: 'Use and export', pipeline: true },
] as const

export type ProjectStage = (typeof PROJECT_STAGES)[number]['id']
/** The stages that form the finish-and-move-on pipeline. */
export type PipelineStage = Exclude<ProjectStage, 'chats'>
export type ProjectPhase = 'briefing' | 'building' | 'project'
export type ProjectStageStatus = 'complete' | 'current' | 'upcoming'

export function projectStageStatuses(input: {
  phase: ProjectPhase
  approved?: number
  total?: number
}): Record<PipelineStage, ProjectStageStatus> {
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

/**
 * Which stage a project should open on.
 *
 * Now that a stage is a screen rather than a scroll position, this decides the
 * only thing the person sees. A project with nothing built yet opens on its
 * brief — landing it on an empty review board showed a blank page and hid the
 * one part of the project that does exist.
 */
export function currentProjectStage(input: { approved: number; total: number }): ProjectStage {
  if (input.total === 0) return 'brief'
  return input.approved === input.total ? 'deliverables' : 'review'
}
