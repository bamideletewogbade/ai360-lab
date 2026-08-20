import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fitWithin, readImageDimensions } from '../src/lib/export/image-dimensions.ts'

// A real PNG already in the repo (the default AI360 logo), independently
// verified byte-for-byte against its IHDR chunk rather than trusted from the
// function under test — 256x293, read with PowerShell's BitConverter, not
// this parser.
const REAL_PNG = new Uint8Array(readFileSync(new URL('../public/icon-mark-black.png', import.meta.url)))

test('reads real PNG dimensions from the IHDR chunk', () => {
  const size = readImageDimensions(REAL_PNG, 'image/png')
  assert.deepEqual(size, { width: 256, height: 293 })
})

test('rejects bytes that are not actually a PNG', () => {
  assert.equal(readImageDimensions(new Uint8Array([1, 2, 3, 4]), 'image/png'), null)
  assert.equal(readImageDimensions(new Uint8Array(30), 'image/png'), null)
})

test('rejects an unsupported mime type without throwing', () => {
  assert.equal(readImageDimensions(REAL_PNG, 'image/svg+xml'), null)
  assert.equal(readImageDimensions(REAL_PNG, 'image/gif'), null)
})

test('a truncated buffer is refused rather than read past its end', () => {
  assert.equal(readImageDimensions(REAL_PNG.slice(0, 10), 'image/png'), null)
})

test('fitWithin scales down to the box without distorting the aspect ratio', () => {
  // 256x293 scaled to fit inside 90x26 — height is the binding dimension.
  const fitted = fitWithin({ width: 256, height: 293 }, 90, 26)
  assert.ok(fitted.height <= 26)
  assert.ok(fitted.width <= 90)
  // Aspect ratio preserved within rounding.
  assert.ok(Math.abs(fitted.width / fitted.height - 256 / 293) < 0.02)
})

test('fitWithin never enlarges an image smaller than the box', () => {
  const fitted = fitWithin({ width: 20, height: 10 }, 90, 26)
  assert.deepEqual(fitted, { width: 20, height: 10 })
})
