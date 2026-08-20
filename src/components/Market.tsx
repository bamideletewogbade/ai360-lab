'use client'

import { useMemo, useState } from 'react'
import { filterMarketProducts, MARKET_PRODUCTS, type MarketCategory, type MarketProduct } from '@/lib/market-catalog'
import { findPack, packCredits, type PackId } from '@/lib/studio/packs'

type Category = 'all' | MarketCategory

const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: 'all', label: 'Everything' },
  { id: 'study', label: 'Study & school' },
  { id: 'career', label: 'Career' },
  { id: 'create', label: 'Create' },
  { id: 'business', label: 'Business' },
  { id: 'decide', label: 'Research & decisions' },
]

function ProductIcon({ product }: { product: MarketProduct }) {
  if (product.category === 'study') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 9 9-5 9 5-9 5Z" /><path d="M7 12v5c3 2 7 2 10 0v-5M21 9v6" /></svg>
  if (product.category === 'career') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2" /></svg>
  if (product.category === 'create') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h11l3 3V20.5H5Z" /><path d="M15.5 3.5v4h3.5M8 12h8M8 16h6" /></svg>
  if (product.category === 'business') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9l7-5 7 5v10" /><path d="M9 19v-5h6v5M3 19h18" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5M8 10.5h5M10.5 8v5" /></svg>
}

function ProductCard({ product, onUse }: { product: MarketProduct; onUse: (packId: PackId, starterPrompt: string) => void }) {
  const pack = findPack(product.packId)
  if (!pack) return null
  return (
    <article className={`market-card market-card-${product.category}`}>
      <div className="market-card-top">
        <span className="market-card-icon"><ProductIcon product={product} /></span>
        <span className="market-ready"><i /> Ready to use</span>
      </div>
      <div className="market-card-copy">
        <span className="market-format">{product.format}</span>
        <h2>{product.name}</h2>
        <strong>{product.promise}</strong>
        <p>{product.description}</p>
      </div>
      <ul className="market-deliverables" aria-label="What you will get">
        {pack.deliverables.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
      </ul>
      <footer>
        <span><b>{packCredits(pack)}</b> credits · by AI360</span>
        <button type="button" onClick={() => onUse(product.packId, product.starterPrompt)}>Use this {product.format.endsWith('tool') ? 'tool' : 'kit'} <span aria-hidden="true">→</span></button>
      </footer>
    </article>
  )
}

export function Market({ onUsePack }: { onUsePack: (packId: PackId, starterPrompt: string) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('all')
  const visible = useMemo(() => filterMarketProducts(MARKET_PRODUCTS, category, query), [category, query])

  return (
    <main className="market-container">
      <section className="market-hero">
        <div>
          <span className="market-eyebrow"><i /> AI360 Tools &amp; Kits</span>
          <h1>What do you need<br />to get done?</h1>
          <p>Practical help for studying, starting a career, creating, making decisions and growing a business.</p>
        </div>
        <aside aria-label="Tools and kits promise">
          <span>Built by AI360</span>
          <b>Every item here works today.</b>
          <small>Choose one, answer a few useful questions and continue in a private Project.</small>
        </aside>
      </section>

      <section className="market-discovery" aria-label="Find a tool or kit">
        <label className="market-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5" /></svg>
          <span className="sr-only">Search tools and kits</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What do you need to get done?" />
          {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear tools and kits search">×</button> : <kbd>⌕</kbd>}
        </label>
        <div className="market-categories" aria-label="Tools and kits categories">
          {CATEGORIES.map((item) => (
            <button key={item.id} type="button" className={category === item.id ? 'active' : ''} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>
          ))}
        </div>
      </section>

      <div className="market-result-count" aria-live="polite"><b>{visible.length}</b> useful {visible.length === 1 ? 'option' : 'options'}</div>
      {visible.length ? (
        <section className="market-grid" aria-label="Available tools and kits">
          {visible.map((product) => <ProductCard key={product.id} product={product} onUse={onUsePack} />)}
        </section>
      ) : (
        <section className="market-empty">
          <span>Nothing matches that yet.</span>
          <h2>Try a simpler word or browse everything.</h2>
          <button type="button" onClick={() => { setQuery(''); setCategory('all') }}>Show all tools and kits</button>
        </section>
      )}

      <section className="market-community-note">
        <span>Creator marketplace comes next</span>
        <div><h2>A trusted place to build and earn.</h2><p>Tools &amp; Kits starts with working experiences built by AI360. Creator-made agents, prompt packs and simple tools can join a future marketplace after review, safe execution and payouts are ready.</p></div>
      </section>
    </main>
  )
}
