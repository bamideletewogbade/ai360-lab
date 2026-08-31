import assert from 'node:assert/strict'
import test from 'node:test'
import { mediaIntentSchema, type MediaIntent } from '../src/lib/media/intent.ts'
import {
  intendedFrameTypes, resolveVideoReferences, VideoReferenceError,
} from '../src/lib/media/video-references.ts'
import type { WorkspaceAuthContext } from '../src/lib/workspace.ts'

const context = {
  userId: 'user_1',
  orgId: null,
  orgRole: null,
  profile: { email: null, displayName: null, imageUrl: null },
  workspace: { key: 'user:user_1', type: 'user', subjectId: 'user_1' },
} as WorkspaceAuthContext

type Role = 'product' | 'logo' | 'person' | 'style' | 'first_frame' | 'last_frame'

function intent(references: Array<{ assetId: string; role: Role }>): MediaIntent {
  return mediaIntentSchema.parse({
    mediaType: 'video',
    purpose: 'Product launch clip',
    aspectRatio: '9:16',
    resolution: '720p',
    durationSeconds: 4,
    references,
  })
}

/** An asset store holding one 1KB PNG per id, unless told otherwise. */
function store(overrides: Record<string, { bytes: number; mimeType: string } | null> = {}) {
  return async (assetId: string) => {
    if (assetId in overrides) {
      const override = overrides[assetId]
      return override && {
        bytes: new ArrayBuffer(override.bytes),
        mimeType: override.mimeType,
      }
    }
    return { bytes: new ArrayBuffer(1024), mimeType: 'image/png' }
  }
}

const resolve = (
  references: Array<{ assetId: string; role: Role }>,
  loadAsset = store(),
) => resolveVideoReferences({ context, intent: intent(references), loadAsset })

test('frame positions are read without touching storage', () => {
  assert.deepEqual(intendedFrameTypes(intent([])), [])
  assert.deepEqual(
    intendedFrameTypes(intent([{ assetId: 'a', role: 'last_frame' }, { assetId: 'b', role: 'first_frame' }])),
    // Ordered, not insertion-ordered: the same attachment must route and price
    // identically however the client happened to list it.
    ['first_frame', 'last_frame'],
  )
  assert.deepEqual(intendedFrameTypes(intent([{ assetId: 'a', role: 'logo' }])), [])
})

test('frames and guidance go to the two arrays the provider expects', async () => {
  const framed = await resolve([{ assetId: 'a', role: 'first_frame' }])
  assert.equal(framed.frameImages.length, 1)
  assert.equal(framed.frameImages[0].frame_type, 'first_frame')
  assert.equal(framed.frameImages[0].type, 'image_url')
  assert.match(framed.frameImages[0].image_url.url, /^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
  assert.deepEqual(framed.frameTypes, ['first_frame'])

  const guided = await resolve([
    { assetId: 'a', role: 'product' },
    { assetId: 'b', role: 'logo' },
  ])
  assert.equal(guided.frameImages.length, 0)
  assert.equal(guided.inputReferences.length, 2)
  // input_references carry no frame_type — that field is what makes the
  // provider treat a request as image-to-video.
  assert.equal('frame_type' in guided.inputReferences[0], false)
})

/**
 * The provider ignores input_references entirely once frame_images is present.
 * Sending both would bill for guidance that was never applied, so the dropped
 * roles are named rather than silently discarded.
 */
test('when frames win, the ignored guidance is named rather than sent', async () => {
  const both = await resolve([
    { assetId: 'a', role: 'first_frame' },
    { assetId: 'b', role: 'logo' },
    { assetId: 'c', role: 'product' },
  ])
  assert.equal(both.frameImages.length, 1)
  assert.deepEqual(both.inputReferences, [])
  assert.deepEqual(both.ignoredRoles.sort(), ['logo', 'product'])

  // With no frames there is nothing to lose to precedence.
  const guidanceOnly = await resolve([{ assetId: 'b', role: 'logo' }])
  assert.deepEqual(guidanceOnly.ignoredRoles, [])
  assert.equal(guidanceOnly.inputReferences.length, 1)
})

test('a duplicated frame position is refused rather than silently halved', async () => {
  await assert.rejects(
    () => resolve([
      { assetId: 'a', role: 'first_frame' },
      { assetId: 'b', role: 'first_frame' },
    ]),
    (error: unknown) => error instanceof VideoReferenceError && /Only one first frame/.test(error.message),
  )
  // One of each is the legitimate first-to-last-frame render.
  const pair = await resolve([
    { assetId: 'a', role: 'first_frame' },
    { assetId: 'b', role: 'last_frame' },
  ])
  assert.deepEqual(pair.frameTypes, ['first_frame', 'last_frame'])
})

test('a reference outside this workspace is refused, not skipped', async () => {
  // The loader is workspace-scoped, so someone else's asset resolves to null.
  await assert.rejects(
    () => resolve([{ assetId: 'someone_else', role: 'product' }], store({ someone_else: null })),
    (error: unknown) => error instanceof VideoReferenceError && /no longer available/.test(error.message),
  )
})

test('only images can be references', async () => {
  await assert.rejects(
    () => resolve(
      [{ assetId: 'clip', role: 'style' }],
      store({ clip: { bytes: 1024, mimeType: 'video/mp4' } }),
    ),
    (error: unknown) => error instanceof VideoReferenceError && /have to be images/.test(error.message),
  )
})

test('reference sizes are capped per image and in total', async () => {
  await assert.rejects(
    () => resolve(
      [{ assetId: 'huge', role: 'product' }],
      store({ huge: { bytes: 9 * 1024 * 1024, mimeType: 'image/jpeg' } }),
    ),
    (error: unknown) => error instanceof VideoReferenceError && /under 8MB/.test(error.message),
  )

  // Each is individually fine; together they exceed what can be delivered.
  const chunky = { bytes: 5 * 1024 * 1024, mimeType: 'image/jpeg' }
  await assert.rejects(
    () => resolve(
      [
        { assetId: 'a', role: 'product' },
        { assetId: 'b', role: 'product' },
        { assetId: 'c', role: 'product' },
      ],
      store({ a: chunky, b: chunky, c: chunky }),
    ),
    (error: unknown) => error instanceof VideoReferenceError && /too large together/.test(error.message),
  )
})

test('the number of guidance references is bounded', async () => {
  const many = Array.from({ length: 5 }, (_, index) => ({
    assetId: `asset_${index}`,
    role: 'product' as const,
  }))
  await assert.rejects(
    () => resolve(many),
    (error: unknown) => error instanceof VideoReferenceError && /at most 4 reference images/.test(error.message),
  )
})

test('no references means no provider fields and no storage reads', async () => {
  let reads = 0
  const resolved = await resolveVideoReferences({
    context,
    intent: intent([]),
    loadAsset: async () => { reads += 1; return { bytes: new ArrayBuffer(8), mimeType: 'image/png' } },
  })
  assert.equal(reads, 0)
  assert.deepEqual(resolved.frameImages, [])
  assert.deepEqual(resolved.inputReferences, [])
  assert.equal(resolved.totalBytes, 0)
})
