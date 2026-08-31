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

/**
 * A 9:16 clip in a 4:3 frame uses 42% of its own card; the rest was black bar.
 * The frame and the no-cropping rule above both stay — the dead space is
 * filled with a blurred enlargement of the same picture instead.
 */
test('letterbox space carries the work own colours, not a black bar', () => {
  assert.match(studio, /className="ms-card-backdrop"/)
  // Images use themselves; a video uses its poster, and one with no poster
  // gets no backdrop rather than a broken image request.
  assert.match(studio, /item\.kind === "image" \|\| item\.poster/)
  assert.match(css, /\.ms-card-media img\.ms-card-backdrop \{[\s\S]*?object-fit: cover/)
  // Decorative: never a click, drag or screen-reader target.
  assert.match(css, /\.ms-card-media img\.ms-card-backdrop \{[\s\S]*?pointer-events: none/)
  assert.match(studio, /aria-hidden="true"[\s\S]{0,80}draggable=\{false\}/)
})

/**
 * Regression: a blanket `.ms-card-media > :not(.ms-card-backdrop)` rule gave
 * the media a stacking layer and, in the same stroke, overrode `position:
 * absolute` on the Example tag and the delete button — both silently vanished.
 * Only the media itself may be repositioned.
 */
test('lifting the media above the backdrop does not unpin the overlays', () => {
  assert.doesNotMatch(css, /\.ms-card-media > :not\(\.ms-card-backdrop\)/)
  assert.match(css, /\.ms-card-media > img:not\(\.ms-card-backdrop\),\s*\r?\n\.ms-card-media > video \{[\s\S]*?position: relative/)
  // The overlays get a layer without being given a position of their own.
  assert.match(css, /\.ms-card-tag,\s*\r?\n\.ms-delete-button \{\s*\r?\n\s*z-index: 2/)
})

/**
 * Regression: the backdrop was first gated behind
 * `prefers-reduced-transparency`, which reports `reduce` on more machines than
 * expected — the feature was `display: none` everywhere it was tested and the
 * screenshots looked unchanged. That preference is about translucent UI
 * chrome, not an opaque decorative photograph.
 */
test('the backdrop is not gated behind a transparency preference', () => {
  assert.doesNotMatch(css, /prefers-reduced-transparency[\s\S]{0,200}ms-card-backdrop/)
  assert.doesNotMatch(css, /ms-card-backdrop[\s\S]{0,200}display: none/)
})

/**
 * On a phone there is one card across, and almost everything made here is for
 * Status, Stories, Reels or TikTok — all upright. The shared frame turns tall
 * so vertical work gets most of the card; it is still one frame for every
 * item, so the column stays even.
 */
test('the shared frame turns upright on a phone', () => {
  const phone = css.slice(css.indexOf('@media (max-width: 620px)', css.indexOf('.ms-compose-head')))
  assert.match(phone, /\.ms-card-media \{\s*\r?\n\s*aspect-ratio: 4 \/ 5/)
})

test('the Media Studio gallery steps down to two columns and then one', () => {
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?\.ms-grid \{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.ms-grid \{[\s\S]*?grid-template-columns: 1fr/)
})

test('video uses one stable render action without a secondary quote panel', () => {
  assert.doesNotMatch(studio, /const \[videoQuote, setVideoQuote\]/)
  assert.doesNotMatch(studio, /Render it · \$\{videoQuote\.credits\}/)
  assert.match(studio, /`Render · \$\{shownVideoCredits\} credits`/)
})

test('creative video prompts do not forbid logos, text or watermarks', () => {
  const route = readFileSync(new URL('../src/app/api/studio/video/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(route, /No watermark, fake interface, visible third-party logos/)
  assert.match(route, /including requested brand marks and text/)
})

/**
 * Only the person's own stored images can be attached. Examples are not theirs
 * and have no workspace asset behind them; a video is not a reference; and an
 * item that never reached storage has no id the server could resolve.
 */
test('the reference picker only offers stored images the person owns', () => {
  assert.match(
    studio,
    /referenceChoices = gallery\.filter\(\s*\(item\) => !item\.example && item\.kind === "image" && Boolean\(item\.assetId\)/,
  )
  // The asset id has to survive onto the card, or nothing is attachable.
  assert.match(studio, /assetId: job\.outputAssetId as string/)
  assert.match(studio, /assetId: typeof data\.assetId === "string"/)
})

/**
 * A price quoted without a frame must never be read against a selection with
 * one: a frame narrows which engines can take the job, and some vendors price
 * image-to-video on a separate sku.
 */
test('an attached frame is part of the priced selection', () => {
  assert.match(studio, /function videoSelectionKey\(/)
  assert.match(studio, /const videoFormatKey = videoSelectionKey\(/)
  // Swapping one product photo for another must not re-quote; adding a frame must.
  assert.match(studio, /const referenceRoleKey = videoReferences[\s\S]{0,120}\.join\("\+"\)/)
  assert.match(studio, /\}, \[mode, videoAspect, videoSeconds, referenceRoleKey\]\)/)
})

test('the studio offers only frame positions the live engines accept', () => {
  assert.match(studio, /setFrameRoles\(data\.supportedFrameTypes as string\[\]\)/)
  assert.match(studio, /\.filter\(\(role\) => frameRoles\.includes\(role\)\)/)
})

/**
 * The provider ignores guidance images once a frame is attached, so offering
 * both would sell a render that silently drops half of what was chosen.
 */
test('product references are closed off while a frame is attached', () => {
  assert.match(studio, /productReferencesBlocked = Boolean\(attachedFrame\)/)
  assert.match(studio, /disabled=\{\s*referenceChoices\.length === 0 \|\|\s*productReferencesBlocked/)
  assert.match(studio, /product images are not used alongside one/)
})

test('the picker is dismissable and reachable on a phone', () => {
  assert.match(studio, /aria-modal="true"/)
  assert.match(studio, /if \(event\.key === "Escape"\) setPickingRole\(null\)/)
  // Backdrop clicks close it, but only the backdrop itself.
  assert.match(studio, /if \(event\.target === event\.currentTarget\) setPickingRole\(null\)/)
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.ms-picker \{[\s\S]*?border-radius: 16px 16px 0 0/)
})

test('a deleted image cannot stay attached to the next render', () => {
  assert.match(studio, /current\.filter\(\(reference\) => reference\.assetId !== item\.assetId\)/)
})
