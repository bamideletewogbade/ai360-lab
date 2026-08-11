import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeKnowledge } from '../src/lib/studio/project-files.ts'

test('knowledge is labelled by file so the model can attribute what it read', () => {
  const merged = mergeKnowledge([
    { name: 'brand.md', text: 'Warm, plain, local.' },
    { name: 'prices.csv', text: 'tea, 20' },
  ])
  assert.match(merged, /--- brand\.md ---/)
  assert.match(merged, /--- prices\.csv ---/)
  assert.match(merged, /Warm, plain, local\./)
})

test('empty files contribute nothing', () => {
  assert.equal(mergeKnowledge([]), '')
  assert.equal(mergeKnowledge([{ name: 'blank.txt', text: '' }]), '')
})

test('the budget truncates rather than dropping the earliest knowledge', () => {
  const merged = mergeKnowledge(
    [
      { name: 'first.txt', text: 'A'.repeat(80) },
      { name: 'second.txt', text: 'B'.repeat(80) },
    ],
    60,
  )
  assert.ok(merged.length <= 60)
  // The earliest file's label survives; later files are cut at the budget.
  assert.match(merged, /first\.txt/)
  assert.ok(!merged.includes('B'.repeat(80)))
})
