import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'
import { CHANGELOG_RELEASES } from '@/lib/changelog'

/**
 * When the site last actually changed, taken from the newest changelog entry.
 *
 * This was a hardcoded date, and it aged: it said 8 August for three weeks
 * while the product shipped almost daily. A sitemap that reports the same
 * `lastmod` on every crawl teaches a crawler that nothing here changes, so it
 * comes back less often — the precise opposite of what a sitemap is for.
 *
 * Build time would be the other obvious choice and is worse: every deploy
 * would claim every page changed, including a deploy that only touched a
 * config value. A crawler that learns a source cries wolf discounts it. The
 * changelog is the one date in the repository that only moves when something
 * a visitor could notice actually moved.
 */
function lastMeaningfulChange() {
  const newest = CHANGELOG_RELEASES.map((release) => release.date).sort().at(-1)
  const parsed = newest ? new Date(`${newest}T00:00:00.000Z`) : null
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date()
}

const updated = lastMeaningfulChange()

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
