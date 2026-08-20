import assert from 'node:assert/strict'
import test from 'node:test'
import { filterLibraryItems, type LibraryFilterableItem } from '../src/lib/library-filter.ts'

const ITEMS: LibraryFilterableItem[] = [
  { kind: 'document', status: 'ready', title: 'Wholesale price list', formatLabel: 'PDF', sourceLabel: 'From a chat' },
  { kind: 'image', status: 'ready', title: 'Campaign poster', formatLabel: 'IMAGE', sourceLabel: 'Media Studio' },
  { kind: 'project', status: 'draft', title: 'Market research', preview: 'SME payments in Ghana', formatLabel: 'Strategy', sourceLabel: 'Business launch' },
]

test('Library search finds titles, content, formats and source projects', () => {
  assert.deepEqual(filterLibraryItems(ITEMS, { type: 'all', status: 'all', query: 'wholesale' }).map((item) => item.title), ['Wholesale price list'])
  assert.deepEqual(filterLibraryItems(ITEMS, { type: 'all', status: 'all', query: 'Ghana' }).map((item) => item.title), ['Market research'])
  assert.deepEqual(filterLibraryItems(ITEMS, { type: 'all', status: 'all', query: 'media studio' }).map((item) => item.title), ['Campaign poster'])
  assert.deepEqual(filterLibraryItems(ITEMS, { type: 'all', status: 'all', query: 'project work' }).map((item) => item.title), ['Market research'])
})

test('Library type and finished filters combine without losing the search', () => {
  assert.equal(filterLibraryItems(ITEMS, { type: 'project', status: 'ready', query: '' }).length, 0)
  assert.deepEqual(filterLibraryItems(ITEMS, { type: 'document', status: 'ready', query: 'pdf' }).map((item) => item.title), ['Wholesale price list'])
})

test('an empty Library query preserves newest-first input order', () => {
  assert.deepEqual(filterLibraryItems(ITEMS, { type: 'all', status: 'all', query: '' }), ITEMS)
})
