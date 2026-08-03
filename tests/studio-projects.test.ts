import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeProjects, setProjectArchived, sortProjects, upsertProject } from '../src/lib/studio-projects.ts'

type Project = { id: string; updatedAt: number; name: string }

test('projects are presented with the most recently edited first', () => {
  const projects: Project[] = [
    { id: 'older', updatedAt: 10, name: 'Older' },
    { id: 'newer', updatedAt: 30, name: 'Newer' },
  ]
  assert.deepEqual(sortProjects(projects).map((project) => project.id), ['newer', 'older'])
})

test('autosave updates one project without replacing the rest of the library', () => {
  const projects: Project[] = [
    { id: 'one', updatedAt: 10, name: 'Original' },
    { id: 'two', updatedAt: 20, name: 'Keep me' },
  ]
  const result = upsertProject(projects, { id: 'one', updatedAt: 40, name: 'Revised' })
  assert.equal(result.length, 2)
  assert.equal(result[0].name, 'Revised')
  assert.equal(result[1].name, 'Keep me')
})

test('cloud reconciliation keeps the newest valid copy of each project', () => {
  const cloud: Project[] = [
    { id: 'shared', updatedAt: 50, name: 'Cloud is newer' },
    { id: 'cloud-only', updatedAt: 15, name: 'Cloud only' },
  ]
  const local: Project[] = [
    { id: 'shared', updatedAt: 20, name: 'Stale local' },
    { id: 'local-only', updatedAt: 60, name: 'Local recovery' },
  ]
  const result = mergeProjects(cloud, local)
  assert.deepEqual(result.map((project) => project.id), ['local-only', 'shared', 'cloud-only'])
  assert.equal(result.find((project) => project.id === 'shared')?.name, 'Cloud is newer')
})

test('archive and restore preserve the project instead of deleting it', () => {
  const projects: Project[] = [{ id: 'campaign', updatedAt: 50, name: 'Campaign' }]
  const archived = setProjectArchived(projects, 'campaign', 75)
  assert.equal(archived.length, 1)
  assert.equal(archived[0].archivedAt, 75)

  const restored = setProjectArchived(archived, 'campaign')
  assert.equal(restored.length, 1)
  assert.equal(restored[0].archivedAt, undefined)
})
