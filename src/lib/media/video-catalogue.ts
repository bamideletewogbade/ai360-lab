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
}

export type ClipFormat = {
  durationSeconds: number
  resolution: string
  aspectRatio: string
  withAudio: boolean
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
 * What one clip costs, in dollars, or null when the provider does not publish a
 * price we can compute.
 *
 * Token priced models are deliberately excluded. Their cost depends on the
 * generated content rather than the requested duration, so quoting one before
 * generation would be a guess, and the whole point of the quote is that the
 * person sees the real number before agreeing to it.
 */
export function clipPriceUsd(model: VideoModelEntry, format: ClipFormat = STUDIO_CLIP): number | null {
  const skus = model.pricing_skus ?? {}
  const seconds = format.durationSeconds

  // Per second, most specific sku first.
  const perSecond = number(
    skus[`duration_seconds_${format.withAudio ? 'with' : 'without'}_audio_${format.resolution}`]
    ?? skus[`duration_seconds_${format.withAudio ? 'with' : 'without'}_audio`]
    ?? skus[`text_to_video_duration_seconds_${format.resolution}`]
    ?? skus.duration_seconds,
  )
  if (perSecond !== null) return Number((perSecond * seconds).toFixed(4))

  // Cents per second, with a floor charge per generation.
  const centsPerSecond = number(skus.cents_per_second_output)
  if (centsPerSecond !== null) {
    const minimumCents = number(skus.minimum_cents_per_generation) ?? 0
    return Number((Math.max(centsPerSecond * seconds, minimumCents) / 100).toFixed(4))
  }

  // Token priced. Real, but not predictable before the clip exists.
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
 */
export const VIDEO_TIER_PREFERENCES: Record<MediaTier, string[]> = {
  draft: ['google/veo-3.1-lite'],
  standard: ['google/veo-3.1-fast', 'google/veo-3.1-lite'],
  premium: ['google/veo-3.1', 'google/veo-3.1-fast'],
}

export type VideoSelection = {
  model: string
  costUsd: number
  tier: MediaTier
}

export type VideoSelectionFailure = {
  reason: 'no_affordable_model'
  tier: MediaTier
  /** The cheapest option that exists for this tier, so the message can be useful. */
  cheapestUsd: number | null
  budgetUsd: number
}

/**
 * Picks the best model for a tier that fits both the requested format and the
 * budget the person's credits actually buy.
 */
export function selectVideoModel(input: {
  catalogue: VideoModelEntry[]
  tier: MediaTier
  budgetUsd: number
  format?: ClipFormat
}): VideoSelection | VideoSelectionFailure {
  const format = input.format ?? STUDIO_CLIP
  const byId = new Map(input.catalogue.filter((model) => model.id).map((model) => [model.id as string, model]))

  let cheapest: number | null = null
  for (const id of VIDEO_TIER_PREFERENCES[input.tier]) {
    const model = byId.get(id)
    if (!model || !supportsFormat(model, format)) continue
    const cost = clipPriceUsd(model, format)
    if (cost === null) continue
    if (cheapest === null || cost < cheapest) cheapest = cost
    if (cost <= input.budgetUsd) return { model: id, costUsd: cost, tier: input.tier }
  }

  return { reason: 'no_affordable_model', tier: input.tier, cheapestUsd: cheapest, budgetUsd: input.budgetUsd }
}

export function isVideoSelection(value: VideoSelection | VideoSelectionFailure): value is VideoSelection {
  return 'model' in value
}
