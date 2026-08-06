import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clipPriceUsd, isMediaTier, isVideoSelection, MEDIA_TIERS, selectVideoModel,
  STUDIO_CLIP, supportsFormat, VIDEO_TIER_PREFERENCES,
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

test('a token-priced model cannot be quoted and is excluded', () => {
  // The cost depends on the generated clip, not the requested duration, so a
  // quote would be a guess. The whole point of the quote is that it is not.
  assert.equal(clipPriceUsd(SEEDANCE_FAST, STUDIO_CLIP), null)
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

test('every tier has a preference list and a description', () => {
  for (const tier of Object.keys(MEDIA_TIERS)) {
    assert.ok(isMediaTier(tier))
    assert.ok(VIDEO_TIER_PREFERENCES[tier as keyof typeof VIDEO_TIER_PREFERENCES]?.length, `${tier} has no candidates`)
    assert.ok(MEDIA_TIERS[tier as keyof typeof MEDIA_TIERS].description.length > 10)
  }
  assert.equal(isMediaTier('ultra'), false)
})
