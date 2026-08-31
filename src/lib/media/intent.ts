import { z } from 'zod'

export const mediaTypeSchema = z.enum(['image', 'video'])
export const mediaQualitySchema = z.enum(['draft', 'standard', 'premium'])
export const mediaChannelSchema = z.enum([
  'auto',
  'whatsapp_status',
  'instagram_post',
  'instagram_story',
  'tiktok',
  'youtube',
  'website',
  'print',
])

export const mediaReferenceSchema = z.object({
  assetId: z.string().min(1).max(96),
  role: z.enum(['product', 'logo', 'person', 'style', 'first_frame', 'last_frame']),
  description: z.string().max(500).optional(),
})

export const mediaIntentSchema = z.object({
  version: z.literal(1).default(1),
  mediaType: mediaTypeSchema,
  purpose: z.string().min(1).max(1_000),
  channel: mediaChannelSchema.default('auto'),
  aspectRatio: z.enum(['1:1', '2:3', '9:16', '16:9']),
  resolution: z.enum(['1K', '2K', '720p', '1080p']).default('1K'),
  // Video engines expose their supported lengths through the live catalogue.
  // Keep the intent broad enough to carry those capabilities while retaining
  // a hard product boundary against accidental or abusive long-running jobs.
  durationSeconds: z.number().int().min(3).max(30).optional(),
  qualityTier: mediaQualitySchema.default('standard'),
  audio: z.enum(['off', 'ambient', 'voice']).default('off'),
  motion: z.enum(['calm', 'balanced', 'dynamic']).default('balanced'),
  locale: z.string().min(2).max(35).default('en-GH'),
  variationCount: z.number().int().min(1).max(4).default(1),
  references: z.array(mediaReferenceSchema).max(16).default([]),
  constraints: z.array(z.string().min(1).max(300)).max(20).default([]),
}).superRefine((intent, context) => {
  if (intent.mediaType === 'video') {
    if (!intent.durationSeconds) context.addIssue({ code: 'custom', path: ['durationSeconds'], message: 'Choose a video length.' })
    if (!['720p', '1080p'].includes(intent.resolution)) {
      context.addIssue({ code: 'custom', path: ['resolution'], message: 'Choose a video resolution.' })
    }
  } else {
    if (intent.durationSeconds) context.addIssue({ code: 'custom', path: ['durationSeconds'], message: 'Images do not have a duration.' })
    if (!['1K', '2K'].includes(intent.resolution)) {
      context.addIssue({ code: 'custom', path: ['resolution'], message: 'Choose an image resolution.' })
    }
    if (intent.audio !== 'off') context.addIssue({ code: 'custom', path: ['audio'], message: 'Images cannot contain audio.' })
  }
})

export type MediaIntent = z.infer<typeof mediaIntentSchema>
export type MediaChannel = z.infer<typeof mediaChannelSchema>
export type MediaQuality = z.infer<typeof mediaQualitySchema>

export const MEDIA_CHANNELS: Record<MediaChannel, { label: string; aspectRatio: MediaIntent['aspectRatio'] }> = {
  auto: { label: 'Choose for me', aspectRatio: '1:1' },
  whatsapp_status: { label: 'WhatsApp Status', aspectRatio: '9:16' },
  instagram_post: { label: 'Instagram post', aspectRatio: '1:1' },
  instagram_story: { label: 'Instagram Story or Reel', aspectRatio: '9:16' },
  tiktok: { label: 'TikTok', aspectRatio: '9:16' },
  youtube: { label: 'YouTube', aspectRatio: '16:9' },
  website: { label: 'Website', aspectRatio: '16:9' },
  print: { label: 'Print', aspectRatio: '2:3' },
}

export function defaultMediaIntent(input: {
  mediaType: MediaIntent['mediaType']
  purpose: string
  assetType?: string
  projectChannels?: string[]
}): MediaIntent {
  const firstChannel = input.projectChannels?.[0]?.toLowerCase() || ''
  const channel: MediaChannel = firstChannel.includes('whatsapp')
    ? 'whatsapp_status'
    : firstChannel.includes('instagram')
      ? input.mediaType === 'video' ? 'instagram_story' : 'instagram_post'
      : firstChannel.includes('tiktok')
        ? 'tiktok'
        : firstChannel.includes('youtube')
          ? 'youtube'
          : input.assetType === 'flyer'
            ? 'print'
            : 'auto'
  const aspectRatio = channel === 'auto'
    ? input.mediaType === 'video' ? '9:16' : input.assetType === 'flyer' ? '2:3' : '1:1'
    : MEDIA_CHANNELS[channel].aspectRatio

  return mediaIntentSchema.parse({
    mediaType: input.mediaType,
    purpose: input.purpose,
    channel,
    aspectRatio,
    resolution: input.mediaType === 'video' ? '720p' : '1K',
    durationSeconds: input.mediaType === 'video' ? 4 : undefined,
    qualityTier: 'standard',
    audio: 'off',
    motion: 'balanced',
    locale: 'en-GH',
    variationCount: 1,
    references: [],
    constraints: [],
  })
}

export function mediaIntentSummary(intent: MediaIntent) {
  const channel = MEDIA_CHANNELS[intent.channel].label
  if (intent.mediaType === 'video') {
    return `${intent.durationSeconds}-second ${intent.aspectRatio} ${intent.resolution} video for ${channel}, ${intent.audio === 'off' ? 'without audio' : `with ${intent.audio} audio`}`
  }
  return `${intent.aspectRatio} ${intent.resolution} image for ${channel}`
}
