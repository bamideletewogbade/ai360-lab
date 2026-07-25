export const LIVE_INFORMATION_TOOLS = [
  {
    type: 'openrouter:web_search',
    parameters: {
      engine: 'auto',
      max_results: 3,
      max_total_results: 5,
      search_context_size: 'low',
    },
  },
  { type: 'openrouter:web_fetch' },
  { type: 'openrouter:datetime' },
] as const

export const RESEARCH_TOOLS = [
  {
    type: 'openrouter:web_search',
    parameters: {
      engine: 'auto',
      max_results: 4,
      max_total_results: 8,
      search_context_size: 'medium',
    },
  },
  { type: 'openrouter:web_fetch' },
  { type: 'openrouter:datetime' },
] as const

export function citationSources(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((annotation): annotation is {
      type: string
      url_citation: { url: string; title?: string }
    } => {
      if (!annotation || typeof annotation !== 'object') return false
      const item = annotation as { type?: unknown; url_citation?: { url?: unknown } }
      return item.type === 'url_citation' && typeof item.url_citation?.url === 'string'
    })
    .map((annotation) => ({
      url: annotation.url_citation.url,
      title: annotation.url_citation.title || annotation.url_citation.url,
    }))
    .filter(
      (source, index, sources) =>
        sources.findIndex((candidate) => candidate.url === source.url) === index,
    )
    .slice(0, 8)
}
