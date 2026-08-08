import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

const updated = new Date('2026-08-08T00:00:00.000Z')

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BRAND.siteUrl,
      lastModified: updated,
      changeFrequency: 'weekly',
      priority: 1,
      images: [`${BRAND.siteUrl}/mission-work-in-motion.webp`, `${BRAND.siteUrl}/studio-campaign-output.webp`],
      videos: [{
        title: 'AI360 Studio campaign outcome example',
        thumbnail_loc: `${BRAND.siteUrl}/studio-outcome-reel-poster.webp`,
        description: 'A short generated campaign reel produced from an approved brand direction in AI360 Studio.',
      }],
    },
    { url: `${BRAND.siteUrl}/what-you-can-make`, lastModified: updated, changeFrequency: 'monthly', priority: 0.9, images: [`${BRAND.siteUrl}/studio-campaign-output.webp`] },
    { url: `${BRAND.siteUrl}/how-it-works`, lastModified: updated, changeFrequency: 'monthly', priority: 0.85 },
    { url: `${BRAND.siteUrl}/pricing`, lastModified: updated, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BRAND.siteUrl}/changelog`, lastModified: updated, changeFrequency: 'weekly', priority: 0.75 },
    { url: `${BRAND.siteUrl}/privacy`, lastModified: updated, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BRAND.siteUrl}/terms`, lastModified: updated, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
