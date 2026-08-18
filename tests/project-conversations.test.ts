import assert from 'node:assert/strict'
import test from 'node:test'
import { PROJECT_STAGES, currentProjectStage, projectStageStatuses } from '../src/lib/studio-stages.ts'

test('chats is a destination in a project, not a pipeline step', () => {
  const chats = PROJECT_STAGES.find((stage) => stage.id === 'chats')
  assert.ok(chats, 'a project must offer its own conversations')
  assert.equal(chats.pipeline, false)
})

test('the pipeline keeps exactly its four finishable stages', () => {
  assert.deepEqual(
    PROJECT_STAGES.filter((stage) => stage.pipeline).map((stage) => stage.id),
    ['brief', 'build', 'review', 'deliverables'],
  )
})

test('stage statuses cover the pipeline only, so chats cannot be marked done', () => {
  const statuses = projectStageStatuses({ phase: 'project', approved: 1, total: 4 })
  assert.deepEqual(Object.keys(statuses).sort(), ['brief', 'build', 'deliverables', 'review'])
  assert.ok(!('chats' in statuses))
})

test('opening a project never lands on a stage that has nothing to show', () => {
  // Nothing built: the brief is the only thing that exists.
  assert.equal(currentProjectStage({ approved: 0, total: 0 }), 'brief')
  // Work outstanding: review is where the decision is.
  assert.equal(currentProjectStage({ approved: 1, total: 4 }), 'review')
  // Everything approved: the outputs are the point.
  assert.equal(currentProjectStage({ approved: 4, total: 4 }), 'deliverables')
})
