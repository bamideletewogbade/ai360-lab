import type { PackId } from '@/lib/studio/packs'

export type MarketCategory = 'start' | 'grow' | 'create' | 'decide'

export type MarketProduct = {
  id: string
  packId: PackId
  name: string
  promise: string
  description: string
  category: MarketCategory
  format: 'Business kit' | 'Quick tool' | 'Work assistant'
  tags: string[]
  featured?: boolean
}

/**
 * The first Market shelf only contains things AI360 can run today. Keeping the
 * workflow id beside each listing makes it difficult for the storefront to
 * drift into a collection of attractive but non-functional promises.
 */
export const MARKET_PRODUCTS: MarketProduct[] = [
  {
    id: 'business-starter',
    packId: 'launch',
    name: 'Start a business',
    promise: 'Go from an idea to a brand and launch plan.',
    description: 'Shape the offer, brand direction, campaign, WhatsApp copy and launch materials in one guided project.',
    category: 'start',
    format: 'Business kit',
    tags: ['SME', 'brand', 'launch', 'Ghana', 'WhatsApp'],
    featured: true,
  },
  {
    id: 'name-domain',
    packId: 'naming',
    name: 'Name and domain check',
    promise: 'Find a strong name you can actually own.',
    description: 'Generate reasoned name options, check real domain availability and suggest matching social handles.',
    category: 'start',
    format: 'Quick tool',
    tags: ['name', 'domain', 'handles', 'business'],
    featured: true,
  },
  {
    id: 'marketing-push',
    packId: 'marketing',
    name: 'Grow my business',
    promise: 'Build a practical campaign for an existing brand.',
    description: 'Get a campaign plan, channel-ready copy, a four-week posting calendar and clear measures of success.',
    category: 'grow',
    format: 'Business kit',
    tags: ['marketing', 'campaign', 'sales', 'WhatsApp', 'social media'],
    featured: true,
  },
  {
    id: 'month-of-content',
    packId: 'calendar',
    name: 'A month of content',
    promise: 'Know what to post for the next four weeks.',
    description: 'Create a usable posting calendar with captions and timing guidance for a brand that already exists.',
    category: 'create',
    format: 'Quick tool',
    tags: ['content', 'calendar', 'captions', 'Instagram', 'TikTok'],
  },
  {
    id: 'ads-ready-to-test',
    packId: 'ads',
    name: 'Ads ready to test',
    promise: 'Write several ad directions before spending money.',
    description: 'Produce platform-ready headline and body variants, audience notes and a sensible first test.',
    category: 'grow',
    format: 'Quick tool',
    tags: ['ads', 'copy', 'campaign', 'testing'],
  },
  {
    id: 'funding-pitch',
    packId: 'pitch',
    name: 'Pitch my business',
    promise: 'Explain the opportunity clearly and confidently.',
    description: 'Prepare a one-page summary, spoken pitch, answers to hard questions and a follow-up email.',
    category: 'grow',
    format: 'Business kit',
    tags: ['pitch', 'funding', 'investor', 'partner', 'sales'],
  },
  {
    id: 'research-brief',
    packId: 'research',
    name: 'Research a market',
    promise: 'Understand a topic using current, sourced evidence.',
    description: 'Bring a market, customer or opportunity question and receive findings, sources and practical implications.',
    category: 'decide',
    format: 'Work assistant',
    tags: ['research', 'market', 'sources', 'customer'],
  },
  {
    id: 'compare-options',
    packId: 'decide',
    name: 'Compare and decide',
    promise: 'Make a difficult choice with the trade-offs visible.',
    description: 'Set the criteria, compare realistic options and turn the recommendation into a clear next step.',
    category: 'decide',
    format: 'Work assistant',
    tags: ['compare', 'decision', 'options', 'planning'],
  },
]

export function filterMarketProducts(products: MarketProduct[], category: 'all' | MarketCategory, query: string) {
  const normalized = query.trim().toLocaleLowerCase()
  return products.filter((product) => {
    if (category !== 'all' && product.category !== category) return false
    if (!normalized) return true
    return [product.name, product.promise, product.description, product.format, ...product.tags]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalized)
  })
}
