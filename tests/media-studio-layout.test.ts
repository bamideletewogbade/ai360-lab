import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')
const studio = readFileSync(new URL('../src/components/MediaStudio.tsx', import.meta.url), 'utf8')

test('a Media Studio shelf fills a desktop row with its four items', () => {
  assert.match(studio, /const GALLERY_PAGE_SIZE = 4/)
  assert.match(css, /\.ms-grid \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
})

test('mixed media ratios share a compact preview without cropping the result', () => {
  assert.match(css, /\.ms-card-media \{[\s\S]*?aspect-ratio: 4 \/ 3/)
  assert.match(css, /\.ms-card-media img,[\s\S]*?object-fit: contain/)
  assert.doesNotMatch(css, /\.ms-card-media\[data-ratio=/)
})

test('the Media Studio gallery steps down to two columns and then one', () => {
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?\.ms-grid \{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.ms-grid \{[\s\S]*?grid-template-columns: 1fr/)
})
