'use client'

import { useMemo, useState } from 'react'
import { filterMarketProducts, MARKET_PRODUCTS, type MarketCategory, type MarketProduct } from '@/lib/market-catalog'
import { findPack, packCredits, type PackId } from '@/lib/studio/packs'

type Category = 'all' | MarketCategory

const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: 'all', label: 'Everything' },
  { id: 'start', label: 'Start a business' },
  { id: 'grow', label: 'Grow and sell' },
  { id: 'create', label: 'Create content' },
  { id: 'decide', label: 'Research and decide' },
]

function ProductIcon({ product }: { product: MarketProduct }) {
  if (product.category === 'start') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9l7-5 7 5v10" /><path d="M9 19v-5h6v5M3 19h18" /></svg>
  if (product.category === 'grow') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 17 5-5 4 3 7-8" /><path d="M15 7h5v5" /></svg>
  if (product.category === 'create') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h11l3 3V20.5H5Z" /><path d="M15.5 3.5v4h3.5M8 12h8M8 16h6" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5M8 10.5h5M10.5 8v5" /></svg>
}

function ProductCard({ product, onUse }: { product: MarketProduct; onUse: (packId: PackId) => void }) {
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
        <button type="button" onClick={() => onUse(product.packId)}>Use this {product.format === 'Quick tool' ? 'tool' : 'kit'} <span aria-hidden="true">→</span></button>
      </footer>
    </article>
  )
}

export function Market({ onUsePack }: { onUsePack: (packId: PackId) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('all')
  const visible = useMemo(() => filterMarketProducts(MARKET_PRODUCTS, category, query), [category, query])

  return (
    <main className="market-container">
      <section className="market-hero">
        <div>
          <span className="market-eyebrow"><i /> AI360 Market</span>
          <h1>Useful work,<br />ready when you are.</h1>
          <p>Practical tools and guided business kits made for getting real work done—not a shelf of demos.</p>
        </div>
        <aside aria-label="Market promise">
          <span>Built by AI360</span>
          <b>Every item here works today.</b>
          <small>Choose one, answer a few useful questions and continue in a private Project.</small>
        </aside>
      </section>

      <section className="market-discovery" aria-label="Find a tool or kit">
        <label className="market-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5" /></svg>
          <span className="sr-only">Search the Market</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What do you need to get done?" />
          {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear Market search">×</button> : <kbd>⌕</kbd>}
        </label>
        <div className="market-categories" aria-label="Market categories">
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
        <span>Community products are next</span>
        <div><h2>A trusted place to build and earn.</h2><p>Creator-made agents, prompt packs and simple tools will join the Market after review, safe execution and payouts are ready. The first release stays small so everything people see is useful.</p></div>
      </section>
    </main>
  )
}
