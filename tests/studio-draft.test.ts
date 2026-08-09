import assert from 'node:assert/strict'
import test from 'node:test'
import { newerDraft, studioDraftSchema, type StudioDraft } from '../src/lib/studio-draft.ts'

function draft(updatedAt: number): StudioDraft {
  return {
    id: 'draft-one', updatedAt, packId: 'launch', turns: [], unsentText: '',
    intake: { businessName: '', industry: '', offer: '', audience: '', goal: '', location: '', channels: [], notes: '' },
  }
}

test('a recoverable project draft has bounded, validated content', () => {
  assert.equal(studioDraftSchema.safeParse(draft(10)).success, true)
  assert.equal(studioDraftSchema.safeParse({ ...draft(10), turns: Array.from({ length: 81 }, (_, id) => ({ id: String(id), role: 'user', content: 'x' })) }).success, false)
})

test('the freshest device copy wins during draft recovery', () => {
  assert.equal(newerDraft(draft(10), draft(20))?.updatedAt, 20)
  assert.equal(newerDraft(draft(30), null)?.updatedAt, 30)
})
