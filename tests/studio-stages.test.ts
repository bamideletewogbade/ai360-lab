import assert from 'node:assert/strict'
import test from 'node:test'
import { currentProjectStage, projectStageStatuses } from '../src/lib/studio-stages.ts'

test('a new project keeps later stages visibly upcoming', () => {
  assert.deepEqual(projectStageStatuses({ phase: 'briefing' }), {
    brief: 'current',
    build: 'upcoming',
    review: 'upcoming',
    deliverables: 'upcoming',
  })
})

test('a live build cannot look ready for review', () => {
  assert.deepEqual(projectStageStatuses({ phase: 'building' }), {
    brief: 'complete',
    build: 'current',
    review: 'upcoming',
    deliverables: 'upcoming',
  })
})

test('deliverables become current only when every asset is approved', () => {
  assert.equal(currentProjectStage({ approved: 2, total: 3 }), 'review')
  assert.equal(currentProjectStage({ approved: 3, total: 3 }), 'deliverables')
  assert.equal(projectStageStatuses({ phase: 'project', approved: 3, total: 3 }).deliverables, 'current')
})

test('an empty project never claims review is complete', () => {
  assert.equal(projectStageStatuses({ phase: 'project', approved: 0, total: 0 }).review, 'current')
  assert.notEqual(projectStageStatuses({ phase: 'project', approved: 0, total: 0 }).review, 'complete')
})

test('a project with nothing built opens on the brief, not an empty review board', () => {
  assert.equal(currentProjectStage({ approved: 0, total: 0 }), 'brief')
})
