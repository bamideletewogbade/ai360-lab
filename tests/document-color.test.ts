import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hexToOoxml, hexToRgb01, isHexColor, normalizeHex, readableTextHex, tint,
} from '../src/lib/export/color.ts'
import { brandFromProjectColors } from '../src/lib/export/brand.ts'

test('isHexColor accepts only well-formed 6-digit hex', () => {
  assert.equal(isHexColor('#101112'), true)
  assert.equal(isHexColor('#FFF'), false, 'a 3-digit shorthand is not accepted')
  assert.equal(isHexColor('101112'), false, 'the # is required')
  assert.equal(isHexColor('#GGGGGG'), false)
  assert.equal(isHexColor(123), false)
})

test('normalizeHex uppercases and validates, or returns null', () => {
  assert.equal(normalizeHex('#abc123'), '#ABC123')
  assert.equal(normalizeHex('  #abc123  '), '#ABC123')
  assert.equal(normalizeHex('not a colour'), null)
  assert.equal(normalizeHex(undefined), null)
})

test('hexToRgb01 converts to the 0-1 float triplet pdf-lib expects', () => {
  const [r, g, b] = hexToRgb01('#FFFFFF')
  assert.equal(r, 1)
  assert.equal(g, 1)
  assert.equal(b, 1)
  const black = hexToRgb01('#000000')
  assert.deepEqual(black, [0, 0, 0])
})

test('hexToOoxml strips the # for XML colour attributes', () => {
  assert.equal(hexToOoxml('#101112'), '101112')
  assert.equal(hexToOoxml('invalid'), '101112', 'an invalid colour falls back to the neutral brand ink rather than throwing')
})

test('tint lightens toward white and never overshoots it', () => {
  assert.equal(tint('#000000', 0), '#000000')
  assert.equal(tint('#000000', 1), '#FFFFFF')
  assert.equal(tint('#000000', 0.5), '#808080')
  // Out-of-range amounts are clamped rather than producing an invalid colour.
  assert.equal(tint('#000000', 2), '#FFFFFF')
  assert.equal(tint('#000000', -1), '#000000')
})

test('readableTextHex picks white on a dark background and black on a light one', () => {
  assert.equal(readableTextHex('#101112'), '#FFFFFF')
  assert.equal(readableTextHex('#FBFAF7'), '#101112')
  assert.equal(readableTextHex('#000000'), '#FFFFFF')
  assert.equal(readableTextHex('#FFFFFF'), '#101112')
})

test('brandFromProjectColors prefers roles named primary and accent', () => {
  const brand = brandFromProjectColors([
    { name: 'Charcoal', hex: '#292B2D', role: 'secondary' },
    { name: 'Gold', hex: '#B8873A', role: 'Accent colour' },
    { name: 'Forest', hex: '#1F5C4A', role: 'Primary brand colour' },
  ])
  assert.deepEqual(brand, { primary: '#1F5C4A', accent: '#B8873A' })
})

test('brandFromProjectColors falls back to array order when no role names a colour', () => {
  const brand = brandFromProjectColors([
    { name: 'First', hex: '#111111', role: 'main' },
    { name: 'Second', hex: '#222222', role: 'secondary' },
  ])
  assert.deepEqual(brand, { primary: '#111111', accent: '#222222' })
})

test('brandFromProjectColors reuses primary as accent when only one colour exists', () => {
  const brand = brandFromProjectColors([{ name: 'Only', hex: '#333333', role: 'primary' }])
  assert.deepEqual(brand, { primary: '#333333', accent: '#333333' })
})

test('brandFromProjectColors returns null for empty, missing or malformed input', () => {
  assert.equal(brandFromProjectColors([]), null)
  assert.equal(brandFromProjectColors(undefined), null)
  assert.equal(brandFromProjectColors('not an array'), null)
  assert.equal(brandFromProjectColors([{ name: 'Bad', hex: 'not-a-hex', role: 'primary' }]), null)
})
