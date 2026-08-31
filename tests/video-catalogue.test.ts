import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clipPriceUsd, isMediaTier, isVideoSelection, MEASURED_CLIP_USD, MEDIA_TIERS,
  selectVideoModel, STUDIO_CLIP, supportedFrameTypes, supportedVideoDurations,
  supportsFormat, supportsFrameImages, VIDEO_TIER_PREFERENCES,
} from '../src/lib/media/video-catalogue.ts'

/**
 * Fixtures are the real shapes returned by the live catalogue on 2026-08-05,
 * copied verbatim. They exist because the four pricing shapes are the whole
 * difficulty here, and a hand-written approximation would not test that.
 */
const VEO_LITE = {
  id: 'google/veo-3.1-lite',
  pricing_skus: {
    duration_seconds_with_audio: '0.08',
    duration_seconds_without_audio: '0.05',
    duration_seconds_with_audio_720p: '0.05',
    duration_seconds_without_audio_720p: '0.03',
  },
  supported_durations: [8, 4, 6],
  supported_resolutions: ['720p', '1080p'],
  supported_aspect_ratios: ['16:9', '9:16'],
  supported_frame_images: ['first_frame', 'last_frame'],
}

const SEEDANCE_FAST = {
  id: 'bytedance/seedance-2.0-fast',
  pricing_skus: { video_tokens: '0.0000056', video_tokens_without_audio: '0.0000056' },
  supported_durations: [4, 5, 6, 8, 10, 15],
  supported_resolutions: ['480p', '720p'],
  supported_aspect_ratios: ['1:1', '9:16', '16:9'],
}

const RUNWAY = {
  id: 'runway/aleph-2',
  pricing_skus: { cents_per_second_output: '28', minimum_cents_per_generation: '56' },
  supported_durations: [4],
  supported_resolutions: ['720p'],
  supported_aspect_ratios: ['9:16'],
}

const HAILUO = {
  id: 'minimax/hailuo-3',
  pricing_skus: { duration_seconds: '0.13', reference_images: '0.04' },
  supported_durations: [5, 6, 8, 10],
  supported_resolutions: ['2K'],
  supported_aspect_ratios: ['9:16'],
}

/**
 * Verbatim from the live catalogue on 2026-08-31 — the fallback vendor added
 * alongside Google so a Veo outage does not take every tier down with it, and
 * the one routed vendor that prices image-to-video on its own sku.
 */
const KLING_STD = {
  id: 'kwaivgi/kling-v3.0-std',
  pricing_skus: {
    duration_seconds: '0.084',
    duration_seconds_with_audio: '0.126',
    text_to_video_duration_seconds_480p: '0.084',
    text_to_video_duration_seconds_720p: '0.084',
    image_to_video_duration_seconds_720p: '0.084',
    text_to_video_duration_seconds_1080p: '0.084',
    image_to_video_duration_seconds_1080p: '0.084',
  },
  supported_durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  supported_resolutions: ['720p'],
  supported_aspect_ratios: ['16:9', '9:16', '1:1'],
  supported_frame_images: ['first_frame', 'last_frame'],
}

const KLING_PRO = {
  ...KLING_STD,
  id: 'kwaivgi/kling-v3.0-pro',
  pricing_skus: {
    duration_seconds: '0.112',
    duration_seconds_with_audio: '0.168',
    text_to_video_duration_seconds_720p: '0.112',
    image_to_video_duration_seconds_720p: '0.112',
  },
}

/**
 * Verbatim from the live catalogue on 2026-08-31. Not routed today, and kept
 * here precisely because it is the shape that breaks a lazy assumption: a
 * model can animate a first frame and have no idea what a last frame is.
 */
const WAN_26 = {
  id: 'alibaba/wan-2.6',
  pricing_skus: {
    image_to_video_duration_seconds_720p: '0.10',
    image_to_video_duration_seconds_1080p: '0.15',
    text_to_video_duration_seconds_720p: '0.10',
  },
  supported_durations: [4, 6, 8],
  supported_resolutions: ['720p'],
  supported_aspect_ratios: ['9:16', '16:9'],
  supported_frame_images: ['first_frame'],
}

test('a per-second price uses the most specific sku available', () => {
  // 720p without audio is $0.03/s, not the $0.05 generic without-audio rate.
  assert.equal(clipPriceUsd(VEO_LITE, STUDIO_CLIP), 0.12)
  assert.equal(clipPriceUsd(VEO_LITE, { ...STUDIO_CLIP, withAudio: true }), 0.2)
})

test('a cents-per-second price respects the minimum charge per generation', () => {
  // 28c x 4s = $1.12, which is above the 56c floor, so the floor does not apply.
  assert.equal(clipPriceUsd(RUNWAY, STUDIO_CLIP), 1.12)
  // One second would be 28c, below the floor, so the floor wins.
  assert.equal(clipPriceUsd(RUNWAY, { ...STUDIO_CLIP, durationSeconds: 1 }), 0.56)
})

test('a token-priced model is quoted from a measured clip, not from its token rate', () => {
  // Generating one real clip on 2026-08-06 cost $0.4838. The published token
  // rate of $0.0000056 says nothing usable about that on its own.
  assert.equal(clipPriceUsd(SEEDANCE_FAST, STUDIO_CLIP), 0.4838)
  assert.ok(MEASURED_CLIP_USD['bytedance/seedance-2.0-fast']?.measuredOn, 'a measurement must record when it was taken')
})

test('a measured price is not reused for a format it was not measured in', () => {
  // Cost scales with the clip, so a 15 second version is not the same price.
  assert.equal(clipPriceUsd(SEEDANCE_FAST, { ...STUDIO_CLIP, durationSeconds: 15 }), null)
  assert.equal(clipPriceUsd(SEEDANCE_FAST, { ...STUDIO_CLIP, resolution: '480p' }), null)
})

test('a token-priced model with no measurement cannot be quoted', () => {
  const unmeasured = { ...SEEDANCE_FAST, id: 'bytedance/seedance-2.0' }
  assert.equal(clipPriceUsd(unmeasured, STUDIO_CLIP), null)
})

test('the measured Seedance price is above what twenty credits buys', () => {
  // Recorded because the catalogue listing makes it look like the cheapest
  // option, and it is in fact four times the price of veo-3.1-lite.
  const budget = 0.3447
  assert.ok(clipPriceUsd(SEEDANCE_FAST, STUDIO_CLIP)! > budget)
  assert.ok(clipPriceUsd(VEO_LITE, STUDIO_CLIP)! < budget)
})

test('a model is only offered when it supports the exact clip requested', () => {
  assert.equal(supportsFormat(VEO_LITE, STUDIO_CLIP), true)
  // Hailuo cannot do 4 seconds and has no 720p.
  assert.equal(supportsFormat(HAILUO, STUDIO_CLIP), false)
  assert.equal(supportsFormat(SEEDANCE_FAST, STUDIO_CLIP), true)
})

test('the cheapest tier fits comfortably inside what 20 credits buys', () => {
  const chosen = selectVideoModel({ catalogue: [VEO_LITE], tier: 'draft', budgetUsd: 0.3447 })
  assert.ok(isVideoSelection(chosen))
  assert.equal(chosen.model, 'google/veo-3.1-lite')
  assert.equal(chosen.costUsd, 0.12)
})

test('a tier reports itself unavailable rather than substituting another model', () => {
  // Runway is the only candidate and costs $1.12 against a $0.3447 budget.
  const result = selectVideoModel({
    catalogue: [RUNWAY],
    tier: 'premium',
    budgetUsd: 0.3447,
  })
  assert.equal(isVideoSelection(result), false)
  if (!isVideoSelection(result)) {
    assert.equal(result.reason, 'no_affordable_model')
    // The cheapest real option is reported so the message can say something useful.
    assert.equal(result.cheapestUsd, null, 'Runway is not in the premium list, so nothing was priced')
  }
})

test('an unpriceable model never becomes a selection', () => {
  const result = selectVideoModel({
    catalogue: [SEEDANCE_FAST],
    tier: 'draft',
    budgetUsd: 999,
  })
  assert.equal(isVideoSelection(result), false)
})

test('a tier falls back within its own list before giving up', () => {
  const veoFast = { ...VEO_LITE, id: 'google/veo-3.1-fast', pricing_skus: { duration_seconds_without_audio_720p: '0.08' } }
  // Standard prefers fast ($0.32) and can afford it.
  const affordable = selectVideoModel({ catalogue: [VEO_LITE, veoFast], tier: 'standard', budgetUsd: 0.3447 })
  assert.ok(isVideoSelection(affordable))
  assert.equal(affordable.model, 'google/veo-3.1-fast')

  // On a tighter budget it drops to the lite model rather than failing.
  const tighter = selectVideoModel({ catalogue: [VEO_LITE, veoFast], tier: 'standard', budgetUsd: 0.2 })
  assert.ok(isVideoSelection(tighter))
  assert.equal(tighter.model, 'google/veo-3.1-lite')
})

test('Kling fits the exact Studio clip at a real, quotable price', () => {
  assert.equal(supportsFormat(KLING_STD, STUDIO_CLIP), true)
  assert.equal(supportsFormat(KLING_PRO, STUDIO_CLIP), true)
  // $0.084/s and $0.112/s at 4 seconds — computed from the live per-second
  // sku, not a measured guess the way Seedance needs.
  assert.equal(clipPriceUsd(KLING_STD, STUDIO_CLIP), 0.336)
  assert.equal(clipPriceUsd(KLING_PRO, STUDIO_CLIP), 0.448)
})

test('every tier survives a Google-only outage by falling back to another vendor', () => {
  // Simulates Veo vanishing from the catalogue entirely — an outage, a
  // deprecation, a provider dropping OpenRouter — and confirms every tier
  // still resolves rather than reporting itself unavailable.
  const catalogueWithoutGoogle = [KLING_STD, KLING_PRO]
  for (const tier of Object.keys(MEDIA_TIERS) as Array<keyof typeof MEDIA_TIERS>) {
    const chosen = selectVideoModel({ catalogue: catalogueWithoutGoogle, tier, budgetUsd: 0.8272 })
    assert.ok(isVideoSelection(chosen), `${tier} has no non-Google fallback and would go dark in a Veo outage`)
    assert.match(chosen.model, /^kwaivgi\//, `${tier} fell back to an unexpected model: ${isVideoSelection(chosen) ? chosen.model : ''}`)
  }
})

test('no tier is secretly single-vendor', () => {
  // The guardrail this whole change exists for: every preference list must
  // name a model from more than one provider, so a future edit cannot quietly
  // strip the fallback and put every tier back on one vendor's uptime.
  for (const [tier, preferences] of Object.entries(VIDEO_TIER_PREFERENCES)) {
    const vendors = new Set(preferences.map((id) => id.split('/')[0]))
    assert.ok(vendors.size > 1, `${tier} only lists ${[...vendors].join(', ')} — one outage would take it down entirely`)
  }
})

test('every tier has a preference list and a description', () => {
  for (const tier of Object.keys(MEDIA_TIERS)) {
    assert.ok(isMediaTier(tier))
    assert.ok(VIDEO_TIER_PREFERENCES[tier as keyof typeof VIDEO_TIER_PREFERENCES]?.length, `${tier} has no candidates`)
    assert.ok(MEDIA_TIERS[tier as keyof typeof MEDIA_TIERS].description.length > 10)
  }
  assert.equal(isMediaTier('ultra'), false)
})

test('longer durations come from live routable model capabilities', () => {
  const durations = supportedVideoDurations({
    catalogue: [VEO_LITE, KLING_STD, KLING_PRO],
    resolution: '720p', aspectRatio: '9:16', withAudio: false,
  })
  assert.deepEqual(durations, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
  const long = selectVideoModel({
    catalogue: [VEO_LITE, KLING_STD], tier: 'draft', budgetUsd: 2,
    format: { ...STUDIO_CLIP, durationSeconds: 15 },
  })
  assert.ok(isVideoSelection(long))
  assert.equal(long.model, 'kwaivgi/kling-v3.0-std')
})

test('a model is only offered a frame position it actually accepts', () => {
  assert.equal(supportsFrameImages(WAN_26, []), true)
  assert.equal(supportsFrameImages(WAN_26, ['first_frame']), true)
  assert.equal(supportsFrameImages(WAN_26, ['last_frame']), false)
  assert.equal(supportsFrameImages(WAN_26, ['first_frame', 'last_frame']), false)
  assert.equal(supportsFrameImages(KLING_STD, ['first_frame', 'last_frame']), true)
  // A text-only model advertises nothing, which is not the same as "anything".
  assert.equal(supportsFrameImages({ id: 'openai/sora-2-pro' }, ['first_frame']), false)
  assert.equal(supportsFrameImages({ id: 'openai/sora-2-pro' }, []), true)
})

/**
 * A supplied frame is part of the request, not a hint. Falling back to a model
 * that ignores it would hand someone a render that disregarded the image they
 * chose — and charge them for it.
 */
test('a tier with no frame-capable engine is refused, not quietly downgraded', () => {
  const catalogue = [{ ...WAN_26, id: 'google/veo-3.1-lite' }]
  const lastFrame = selectVideoModel({
    catalogue, tier: 'draft', budgetUsd: 5,
    format: { ...STUDIO_CLIP, withFrameImages: true },
    frameTypes: ['last_frame'],
  })
  assert.equal(isVideoSelection(lastFrame), false)
  assert.ok(!isVideoSelection(lastFrame) && lastFrame.reason === 'no_model_supports_frames')

  // The same engine is a fine match for the frame position it does support.
  const firstFrame = selectVideoModel({
    catalogue, tier: 'draft', budgetUsd: 5,
    format: { ...STUDIO_CLIP, withFrameImages: true },
    frameTypes: ['first_frame'],
  })
  assert.ok(isVideoSelection(firstFrame))

  // "Too expensive" stays a separate answer, because the remedy differs.
  const broke = selectVideoModel({
    catalogue: [KLING_STD], tier: 'draft', budgetUsd: 0.0001,
    format: STUDIO_CLIP,
  })
  assert.ok(!isVideoSelection(broke) && broke.reason === 'no_affordable_model')
})

test('the offered frame positions come from the live catalogue', () => {
  assert.deepEqual(
    supportedFrameTypes({ catalogue: [VEO_LITE, KLING_STD], format: STUDIO_CLIP }),
    ['first_frame', 'last_frame'],
  )
  // A model that cannot make this clip at all has no say in what is offered.
  assert.deepEqual(
    supportedFrameTypes({
      catalogue: [{ ...WAN_26, id: 'google/veo-3.1-lite' }],
      format: { ...STUDIO_CLIP, durationSeconds: 15 },
    }),
    [],
  )
  assert.deepEqual(
    supportedFrameTypes({ catalogue: [{ ...WAN_26, id: 'google/veo-3.1-lite' }], format: STUDIO_CLIP }),
    ['first_frame'],
  )
})

/**
 * Attaching a frame makes this an image-to-video generation, which Kling
 * prices on its own sku. The two rates are identical today, so nothing moves —
 * but reading the text-to-video rate for an image-to-video render is the kind
 * of wrong that stays invisible until a provider separates them and every
 * quote silently under-reserves.
 */
test('an image-to-video render is priced on the image-to-video sku', () => {
  const framed = { ...STUDIO_CLIP, withFrameImages: true }
  assert.equal(clipPriceUsd(KLING_STD, framed), clipPriceUsd(KLING_STD, STUDIO_CLIP))

  // Separate the two rates and the correct one has to win.
  const diverged = {
    ...KLING_STD,
    pricing_skus: {
      ...KLING_STD.pricing_skus,
      image_to_video_duration_seconds_720p: '0.20',
    },
  }
  assert.equal(clipPriceUsd(diverged, STUDIO_CLIP), 0.336)
  assert.equal(clipPriceUsd(diverged, framed), 0.8)

  // A model with no image-to-video sku still prices, rather than becoming
  // unquotable the moment someone attaches a frame.
  assert.equal(clipPriceUsd(VEO_LITE, framed), clipPriceUsd(VEO_LITE, STUDIO_CLIP))
})

test('a clip measured from a text prompt is not reused to price a supplied frame', () => {
  assert.equal(clipPriceUsd(SEEDANCE_FAST, STUDIO_CLIP), 0.4838)
  // Seedance publishes only a token rate, so with the measurement disqualified
  // there is no honest number left — and an unquotable model is not offered.
  assert.equal(clipPriceUsd(SEEDANCE_FAST, { ...STUDIO_CLIP, withFrameImages: true }), null)
})
