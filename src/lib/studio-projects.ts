export type TimestampedProject = {
  id: string
  updatedAt: number
  archivedAt?: number
}

export function sortProjects<T extends TimestampedProject>(projects: T[]) {
  return [...projects].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function upsertProject<T extends TimestampedProject>(projects: T[], incoming: T) {
  return sortProjects([incoming, ...projects.filter((project) => project.id !== incoming.id)])
}

export function mergeProjects<T extends TimestampedProject>(cloud: T[], local: T[]) {
  const merged = new Map<string, T>()
  for (const project of [...cloud, ...local]) {
    const current = merged.get(project.id)
    if (!current || project.updatedAt > current.updatedAt) merged.set(project.id, project)
  }
  return sortProjects([...merged.values()])
}

export function setProjectArchived<T extends TimestampedProject>(
  projects: T[],
  projectId: string,
  archivedAt?: number,
) {
  return projects.map((project) => project.id === projectId ? { ...project, archivedAt } : project)
}
