import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

// `/admin` and `/quality` are operator surfaces. Both already answer with
// `noindex`, but a crawler has to fetch a page to read that; a disallow rule
// keeps it from asking in the first place.
const privatePaths = ['/api/', '/auth/', '/sign-in', '/sign-up', '/admin', '/quality']

// The workspace stays crawlable for search engines — it renders a signed-out
// landing state worth understanding — but there is nothing in it for an answer
// engine to quote, and every fetch costs a request.
const agentPrivatePaths = [...privatePaths, '/app']

/**
 * Answer engines are named individually because a wildcard rule does not reach
 * all of them: several read only the group that names them, and
 * `Google-Extended` is not Googlebot — it is the separate opt-in that governs
 * whether Gemini and AI Overviews may use the site. Being quoted by an answer
 * engine matters more here than a search ranking does, so being absent from
 * this list is a real cost.
 */
const ANSWER_ENGINE_AGENTS = [
  'OAI-SearchBot', 'ChatGPT-User', 'GPTBot',
  'PerplexityBot', 'Perplexity-User',
  'ClaudeBot', 'Claude-User', 'anthropic-ai',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: privatePaths },
      { userAgent: ANSWER_ENGINE_AGENTS, allow: '/', disallow: agentPrivatePaths },
    ],
    sitemap: `${BRAND.siteUrl}/sitemap.xml`,
    host: BRAND.siteUrl,
  }
}
