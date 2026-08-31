/**
 * Pricing and selection for video models.
 *
 * Providers do not agree on how to price a clip. Verified against the live
 * catalogue on 2026-08-05, there are four shapes in use:
 *
 *   duration_seconds_*        dollars per second        (Veo, Kling, MiniMax)
 *   video_tokens*             dollars per token         (Seedance)
 *   cents_per_second_output   cents per second, plus a
 *                             minimum per generation    (Runway)
 *   no usable sku at all
 *
 * A model we cannot price is a model we cannot quote, and a quote we cannot
 * make is a credit reservation we would be guessing at. So anything unpriceable
 * is excluded rather than defaulted, which is why `clipPriceUsd` returns null
 * instead of zero.
 */

export type VideoModelEntry = {
  id?: string
  pricing_skus?: Record<string, string | number>
  supported_durations?: number[]
  supported_resolutions?: string[]
  supported_aspect_ratios?: string[]
  /**
   * Which frame positions a model accepts an image for, verified against the
   * live catalogue on 2026-08-31: `["first_frame","last_frame"]`,
   * `["first_frame"]`, or absent for models that are text-only. Every model in
   * `VIDEO_TIER_PREFERENCES` currently takes both, but `alibaba/wan-2.7` — a
   * documented next candidate — takes only a first frame, so this is checked
   * rather than assumed.
   */
  supported_frame_images?: string[]
}

export type VideoFrameType = 'first_frame' | 'last_frame'

export type ClipFormat = {
  durationSeconds: number
  resolution: string
  aspectRatio: string
  withAudio: boolean
  /**
   * Whether a frame image is attached, which makes this an image-to-video
   * generation. Some providers publish a separate per-second rate for that
   * mode, so it changes which price is the true one.
   */
  withFrameImages?: boolean
}

export const STUDIO_CLIP: ClipFormat = {
  durationSeconds: 4,
  resolution: '720p',
  aspectRatio: '9:16',
  withAudio: false,
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/** Whether a model can produce the exact clip Studio asks for. */
export function supportsFormat(model: VideoModelEntry, format: ClipFormat) {
  return Boolean(
    model.supported_durations?.includes(format.durationSeconds)
    && model.supported_resolutions?.includes(format.resolution)
    && model.supported_aspect_ratios?.includes(format.aspectRatio),
  )
}

/**
 * Whether a model accepts an image at every frame position asked for.
 *
 * Attaching a last frame to a model that only takes a first one would either
 * be refused by the provider or, worse, quietly ignored — the person would pay
 * for a render that disregarded half of what they supplied. A model that
 * cannot honour the request is not a match for it.
 */
export function supportsFrameImages(model: VideoModelEntry, frameTypes: VideoFrameType[]) {
  if (!frameTypes.length) return true
  const supported = new Set(model.supported_frame_images ?? [])
  return frameTypes.every((frameType) => supported.has(frameType))
}

/**
 * What one clip costs, in dollars, or null when the provider does not publish a
 * price we can compute.
 *
 * Token priced models are deliberately excluded. Their cost depends on the
 * generated content rather than the requested duration, so quoting one before
 * generation would be a guess, and the whole point of the quote is that the
 * person sees the real number before agreeing to it.
 */
/**
 * Prices measured by generating a real clip, for models that publish only a
 * per-token rate.
 *
 * A token rate cannot be turned into a clip price without knowing how many
 * tokens a clip produces, so the only honest way to quote one is to generate a
 * clip in the exact Studio format and record what it cost. These figures come
 * from doing that on 2026-08-06.
 *
 * Re-measure whenever a model version changes. A stale figure here is worse
 * than no figure, because it would be quoted with confidence.
 */
export const MEASURED_CLIP_USD: Record<string, { usd: number; measuredOn: string }> = {
  'bytedance/seedance-2.0-fast': { usd: 0.4838, measuredOn: '2026-08-06' },
}

export function clipPriceUsd(model: VideoModelEntry, format: ClipFormat = STUDIO_CLIP): number | null {
  const skus = model.pricing_skus ?? {}
  const seconds = format.durationSeconds

  // A measured price only applies to the format it was measured in — and a
  // clip measured from a text prompt says nothing about what the same model
  // charges to animate a supplied frame.
  const measured = model.id ? MEASURED_CLIP_USD[model.id] : undefined
  if (
    measured
    && !format.withFrameImages
    && format.durationSeconds === STUDIO_CLIP.durationSeconds
    && format.resolution === STUDIO_CLIP.resolution
    && format.aspectRatio === STUDIO_CLIP.aspectRatio
    && format.withAudio === STUDIO_CLIP.withAudio
  ) {
    return measured.usd
  }

  // Per second, most specific sku first. Attaching a frame makes this an
  // image-to-video generation, which some providers price on their own sku:
  // Kling publishes `image_to_video_duration_seconds_720p` alongside the
  // text-to-video one. They are equal today, so nothing moves — but reading
  // the text-to-video rate for an image-to-video render would under-reserve
  // the moment a provider separates them.
  const modeSku = format.withFrameImages
    ? skus[`image_to_video_duration_seconds_${format.resolution}`]
      ?? skus[`text_to_video_duration_seconds_${format.resolution}`]
    : skus[`text_to_video_duration_seconds_${format.resolution}`]
  const perSecond = number(
    skus[`duration_seconds_${format.withAudio ? 'with' : 'without'}_audio_${format.resolution}`]
    ?? skus[`duration_seconds_${format.withAudio ? 'with' : 'without'}_audio`]
    ?? modeSku
    ?? skus.duration_seconds,
  )
  if (perSecond !== null) return Number((perSecond * seconds).toFixed(4))

  // Cents per second, with a floor charge per generation.
  const centsPerSecond = number(skus.cents_per_second_output)
  if (centsPerSecond !== null) {
    const minimumCents = number(skus.minimum_cents_per_generation) ?? 0
    return Number((Math.max(centsPerSecond * seconds, minimumCents) / 100).toFixed(4))
  }

  // Token priced with no measurement on file. Real, but not predictable before
  // the clip exists, so it cannot be quoted.
  return null
}

export type MediaTier = 'draft' | 'standard' | 'premium'

export const MEDIA_TIERS: Record<MediaTier, { label: string; description: string }> = {
  draft: { label: 'Draft', description: 'Fastest and cheapest. Good for trying an idea.' },
  standard: { label: 'Standard', description: 'The usual balance of quality and cost.' },
  premium: { label: 'Premium', description: 'Best available within your credit allowance.' },
}

export function isMediaTier(value: unknown): value is MediaTier {
  return typeof value === 'string' && value in MEDIA_TIERS
}

/**
 * Preference order per tier, best first.
 *
 * Ordered by judgement about quality, then filtered by what is actually
 * affordable. A tier never silently falls back to a model from another tier: if
 * nothing in the list fits, the answer is that the tier is unavailable, so the
 * person is told rather than quietly given something else.
 *
 * Every tier carries at least one fallback from a vendor other than Google:
 * three tiers that are all secretly "Veo" is one outage away from a total
 * video-generation blackout. Kling (Kuaishou) is the fallback vendor because
 * it is the only alternative, verified against the live catalogue on
 * 2026-08-19, that both fits the exact Studio clip (4s, 720p, 9:16) and has a
 * real per-second price rather than a token rate that would have to be
 * guessed at. `alibaba/wan-2.7` ($0.40/clip) and `runway/gen-4.5` ($0.48/clip)
 * also priced and fit that day and are documented here as the next candidates
 * — not wired in yet, so each new vendor enters production one at a time.
 * `bytedance/seedance-2.5` looked promising from public pricing pages but the
 * live catalogue exposes only a token rate for it, the same unquotable shape
 * as 2.0 before it — it would need its own measured-clip entry (see
 * `MEASURED_CLIP_USD`) before it could join a tier. `black-forest-labs/
 * flux-3-video` cannot appear at all: its shortest clip is 5 seconds and the
 * Studio format is fixed at 4.
 *
 * One thing to check before adding any vendor now that references are wired:
 * some models surcharge for supplied images on a sku `clipPriceUsd` does not
 * read — `minimax/hailuo-3` publishes `reference_images` ($0.04) and the Grok
 * video models publish `cents_per_image_input`. No routed model has either
 * (verified 2026-08-31: Veo has no image sku at all, and Kling's
 * `image_to_video_*` rate equals its `text_to_video_*` rate exactly), so a
 * quote is currently the full price of a render with references. Adding a
 * model that surcharges would under-reserve every referenced render until
 * that sku is priced in.
 */
export const VIDEO_TIER_PREFERENCES: Record<MediaTier, string[]> = {
  draft: ['google/veo-3.1-lite', 'kwaivgi/kling-v3.0-std'],
  standard: ['google/veo-3.1-fast', 'kwaivgi/kling-v3.0-pro', 'kwaivgi/kling-v3.0-std', 'google/veo-3.1-lite'],
  premium: ['google/veo-3.1', 'kwaivgi/kling-v3.0-pro', 'google/veo-3.1-fast'],
}

export type VideoSelection = {
  model: string
  costUsd: number
  tier: MediaTier
}

export type VideoSelectionFailure = {
  reason: 'no_affordable_model' | 'no_model_supports_frames'
  tier: MediaTier
  /** The cheapest option that exists for this tier, so the message can be useful. */
  cheapestUsd: number | null
  budgetUsd: number
}

/**
 * Picks the best model for a tier that fits both the requested format and the
 * budget the person's credits actually buy.
 *
 * `frameTypes` narrows the field further: a supplied first or last frame is
 * part of what was asked for, not a hint, so a model that cannot take one is
 * not a cheaper way to do the same job.
 */
export function selectVideoModel(input: {
  catalogue: VideoModelEntry[]
  tier: MediaTier
  budgetUsd: number
  format?: ClipFormat
  frameTypes?: VideoFrameType[]
}): VideoSelection | VideoSelectionFailure {
  const frameTypes = input.frameTypes ?? []
  const format = input.format ?? STUDIO_CLIP
  const byId = new Map(input.catalogue.filter((model) => model.id).map((model) => [model.id as string, model]))

  let cheapest: number | null = null
  // Told apart from "too expensive" so the person can be given the real
  // reason: dropping to a cheaper tier will not buy frame support.
  let fitsFormatButNotFrames = false
  for (const id of VIDEO_TIER_PREFERENCES[input.tier]) {
    const model = byId.get(id)
    if (!model || !supportsFormat(model, format)) continue
    if (!supportsFrameImages(model, frameTypes)) {
      fitsFormatButNotFrames = true
      continue
    }
    const cost = clipPriceUsd(model, format)
    if (cost === null) continue
    if (cheapest === null || cost < cheapest) cheapest = cost
    if (cost <= input.budgetUsd) return { model: id, costUsd: cost, tier: input.tier }
  }

  return {
    reason: cheapest === null && fitsFormatButNotFrames ? 'no_model_supports_frames' : 'no_affordable_model',
    tier: input.tier,
    cheapestUsd: cheapest,
    budgetUsd: input.budgetUsd,
  }
}

export function isVideoSelection(value: VideoSelection | VideoSelectionFailure): value is VideoSelection {
  return 'model' in value
}

/**
 * Frame positions at least one routable model can accept for this format.
 *
 * Derived from the live catalogue for the same reason durations are: it is the
 * difference between offering someone a last-frame slot that will work and
 * offering one that every engine will refuse.
 */
export function supportedFrameTypes(input: {
  catalogue: VideoModelEntry[]
  format: ClipFormat
}): VideoFrameType[] {
  const candidateIds = new Set(Object.values(VIDEO_TIER_PREFERENCES).flat())
  const available = new Set<VideoFrameType>()
  for (const model of input.catalogue) {
    if (!model.id || !candidateIds.has(model.id)) continue
    if (!supportsFormat(model, input.format)) continue
    for (const frameType of model.supported_frame_images ?? []) {
      if (frameType === 'first_frame' || frameType === 'last_frame') available.add(frameType)
    }
  }
  return (['first_frame', 'last_frame'] as const).filter((frame) => available.has(frame))
}

/**
 * Every duration the configured tier routes can currently sell for a format.
 *
 * This is deliberately derived from the live catalogue rather than a UI list:
 * when a provider adds a 10 or 15 second option it becomes available without a
 * release, while an option removed by every provider disappears cleanly.
 */
export function supportedVideoDurations(input: {
  catalogue: VideoModelEntry[]
  resolution: string
  aspectRatio: string
  withAudio: boolean
  maxSeconds?: number
}) {
  const maxSeconds = Math.min(30, Math.max(3, input.maxSeconds ?? 30))
  const candidateIds = new Set(Object.values(VIDEO_TIER_PREFERENCES).flat())
  const durations = new Set<number>()
  for (const model of input.catalogue) {
    if (!model.id || !candidateIds.has(model.id)) continue
    for (const durationSeconds of model.supported_durations ?? []) {
      if (!Number.isInteger(durationSeconds) || durationSeconds < 3 || durationSeconds > maxSeconds) continue
      const format = {
        durationSeconds,
        resolution: input.resolution,
        aspectRatio: input.aspectRatio,
        withAudio: input.withAudio,
      }
      if (!supportsFormat(model, format) || clipPriceUsd(model, format) === null) continue
      durations.add(durationSeconds)
    }
  }
  return [...durations].sort((left, right) => left - right)
}
