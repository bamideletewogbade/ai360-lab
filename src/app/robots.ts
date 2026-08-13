import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

const privatePaths = ['/api/', '/auth/', '/sign-in', '/sign-up']
const agentPrivatePaths = [...privatePaths, '/app']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: privatePaths },
      { userAgent: ['OAI-SearchBot', 'ChatGPT-User', 'GPTBot'], allow: '/', disallow: agentPrivatePaths },
    ],
    sitemap: `${BRAND.siteUrl}/sitemap.xml`,
    host: BRAND.siteUrl,
  }
}
