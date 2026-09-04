const DEFAULT_SEARCH_LOCATION = {
  type: 'approximate',
  city: 'Accra',
  country: 'GH',
  timezone: 'Africa/Accra',
} as const

function webSearchTool(input: {
  maxResults: number
  maxTotalResults: number
  contextSize: 'low' | 'medium'
}) {
  return {
    type: 'openrouter:web_search',
    parameters: {
      engine: 'auto',
      max_results: input.maxResults,
      max_total_results: input.maxTotalResults,
      search_context_size: input.contextSize,
      user_location: DEFAULT_SEARCH_LOCATION,
    },
  } as const
}

export const LIVE_INFORMATION_TOOLS = [
  webSearchTool({ maxResults: 3, maxTotalResults: 5, contextSize: 'low' }),
  { type: 'openrouter:web_fetch' },
  { type: 'openrouter:datetime' },
] as const

export const RESEARCH_TOOLS = [
  webSearchTool({ maxResults: 4, maxTotalResults: 8, contextSize: 'medium' }),
  { type: 'openrouter:web_fetch' },
  { type: 'openrouter:datetime' },
] as const

const TRACKING_QUERY_PARAMETERS = new Set([
  'dclid', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'msclkid',
])

function normalizedCitationUrl(value: string) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_QUERY_PARAMETERS.has(key.toLowerCase())) {
        url.searchParams.delete(key)
      }
    }
    url.searchParams.sort()
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    // URL serialisation adds a slash to a bare origin. Keep the representation
    // already used by streaming consumers while still canonicalising all other
    // path and query differences.
    return url.toString().replace(/^(https?:\/\/[^/?#]+)\/(?=[?#]|$)/, '$1')
  } catch {
    return null
  }
}

export function citationSources(value: unknown) {
  if (!Array.isArray(value)) return []
  const sources = new Map<string, string>()
  for (const annotation of value) {
    if (!annotation || typeof annotation !== 'object') continue
    const item = annotation as {
      type?: unknown
      url_citation?: { url?: unknown; title?: unknown }
    }
    if (item.type !== 'url_citation' || typeof item.url_citation?.url !== 'string') continue
    const url = normalizedCitationUrl(item.url_citation.url)
    if (!url || sources.has(url)) continue
    const title = typeof item.url_citation.title === 'string' && item.url_citation.title.trim()
      ? item.url_citation.title.trim()
      : url
    sources.set(url, title)
    if (sources.size === 8) break
  }
  return [...sources].map(([url, title]) => ({ url, title }))
}
