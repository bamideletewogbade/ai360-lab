import assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitMarkdownSections, totalReadStats } from '../src/lib/markdown-sections.ts'

test('content before the first heading becomes an untitled lede section', () => {
  const sections = splitMarkdownSections('This is the summary.\n\n## Research brief\n\nBody text.')
  assert.equal(sections.length, 2)
  assert.equal(sections[0].title, null)
  assert.equal(sections[0].body, 'This is the summary.')
  assert.equal(sections[1].title, 'Research brief')
  assert.equal(sections[1].body, 'Body text.')
})

test('a document with no headings is a single untitled section', () => {
  const sections = splitMarkdownSections('Just a paragraph, nothing else.')
  assert.equal(sections.length, 1)
  assert.equal(sections[0].title, null)
})

test('h1 and h3 do not split a section; only h2 does', () => {
  const sections = splitMarkdownSections('# Title\n\n## Findings\n\n### A subpoint\n\nMore detail.\n\n## Sources\n\nA list.')
  const titled = sections.filter((section) => section.title)
  assert.deepEqual(titled.map((section) => section.title), ['Findings', 'Sources'])
  assert.ok(titled[0].body.includes('### A subpoint'))
})

test('a heading-looking line inside a fenced code block is not treated as a section break', () => {
  const markdown = '## Real section\n\n```\n## not a heading\n```\n\n## Next section\n\ntext'
  const sections = splitMarkdownSections(markdown)
  const titled = sections.filter((section) => section.title)
  assert.deepEqual(titled.map((section) => section.title), ['Real section', 'Next section'])
  assert.ok(titled[0].body.includes('## not a heading'))
})

test('duplicate headings get distinct ids', () => {
  const sections = splitMarkdownSections('## Sources\n\nA\n\n## Sources\n\nB')
  assert.deepEqual(sections.map((section) => section.id), ['sources', 'sources-2'])
})

test('read stats estimate a sensible minimum', () => {
  const sections = splitMarkdownSections('## Short\n\nJust a few words here.')
  const { words, minutes } = totalReadStats(sections)
  assert.ok(words > 0)
  assert.equal(minutes, 1)
})
