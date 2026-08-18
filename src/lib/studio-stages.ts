/**
 * The destinations inside a project.
 *
 * The stored ids predate the current information architecture and are retained
 * so existing projects keep opening correctly. The labels are universal
 * workspace destinations, not an industry-specific production pipeline.
 */
export const PROJECT_STAGES = [
  { id: 'brief', label: 'Overview', description: 'Goal and direction', pipeline: true },
  { id: 'chats', label: 'Chats', description: 'Think and create', pipeline: false },
  { id: 'review', label: 'Work', description: 'Drafts and decisions', pipeline: true },
  { id: 'build', label: 'Files', description: 'Sources and context', pipeline: true },
  { id: 'deliverables', label: 'Outputs', description: 'Ready to use', pipeline: true },
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
