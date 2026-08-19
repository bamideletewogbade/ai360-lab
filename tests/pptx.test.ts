import assert from 'node:assert/strict'
import test from 'node:test'
import { slidesFromBlocks } from '../src/lib/export/pptx.ts'
import { parseMarkdown } from '../src/lib/export/render.ts'

test('a heading starts a new slide, and its bullets land under it', () => {
  const blocks = parseMarkdown([
    '# Market',
    '- Growing demand',
    '- Weak local competition',
    '# Pricing',
    'One paragraph of context.',
  ].join('\n\n'))
  const slides = slidesFromBlocks('Board update', blocks)
  assert.equal(slides.length, 2)
  assert.equal(slides[0].heading, 'Market')
  assert.deepEqual(slides[0].items?.map((item) => item.text), ['Growing demand', 'Weak local competition'])
  assert.equal(slides[1].heading, 'Pricing')
})

test('a table always gets its own slide, never mixed with bullets', () => {
  const blocks = parseMarkdown(
    '# Pricing\n\n- A note before the numbers\n\n| Plan | Price |\n| --- | ---: |\n| Everyday | GHS 125 |',
  )
  const slides = slidesFromBlocks('Board update', blocks)
  assert.equal(slides.length, 2)
  assert.equal(slides[0].heading, 'Pricing')
  assert.ok(slides[0].items?.length)
  assert.equal(slides[1].table?.length, 2)
  assert.deepEqual(slides[1].table?.[0], ['Plan', 'Price'])
})

test('a heavy slide splits into a continuation slide rather than overflowing', () => {
  const bullets = Array.from({ length: 12 }, (_, index) => `Point number ${index + 1}`).join('\n')
  const blocks = parseMarkdown(`# Everything\n\n${bullets.split('\n').map((line) => `- ${line}`).join('\n')}`)
  const slides = slidesFromBlocks('Board update', blocks)
  assert.ok(slides.length > 1, 'twelve bullets should not fit on one slide')
  assert.equal(slides[0].heading, 'Everything')
  assert.equal(slides[1].heading, 'Everything (cont.)')
})

test('a wide table is chunked with the header repeated on every continuation slide', () => {
  const rows = ['| Item | Price |', '| --- | ---: |']
    .concat(Array.from({ length: 20 }, (_, index) => `| Item ${index + 1} | GHS ${index + 1} |`))
  const blocks = parseMarkdown(`# Catalogue\n\n${rows.join('\n')}`)
  const slides = slidesFromBlocks('Board update', blocks)
  assert.equal(slides.length, 2)
  assert.match(slides[0].heading, /Catalogue \(1\/2\)/)
  assert.match(slides[1].heading, /Catalogue \(2\/2\)/)
  assert.deepEqual(slides[0].table?.[0], ['Item', 'Price'])
  assert.deepEqual(slides[1].table?.[0], ['Item', 'Price'])
})

test('content with no headings still produces a usable deck', () => {
  const blocks = parseMarkdown('Just a couple of plain sentences with no structure at all.')
  const slides = slidesFromBlocks('Untitled note', blocks)
  assert.equal(slides.length, 1)
  assert.equal(slides[0].heading, 'Untitled note')
})
