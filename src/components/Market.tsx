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
  switch (product.packId) {
    case 'learn':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5c3-.7 5.7-.1 8 1.7v12c-2.3-1.8-5-2.4-8-1.7Z" /><path d="M20 5.5c-3-.7-5.7-.1-8 1.7v12c2.3-1.8 5-2.4 8-1.7Z" /></svg>
    case 'write':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h10l4 4v13H5Z" /><path d="M15 3.5v4h4M8 16l1.2-3.2 5.9-5.9 2 2-5.9 5.9Z" /></svg>
    case 'plan':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6Z" /><path d="m9 9 1 1 2-2M13.5 9H16m-7 5 1 1 2-2m1.5 1H16" /></svg>
    case 'research':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5M8 10.5h5M10.5 8v5" /></svg>
    case 'decide':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M12 7H6l-3 5h6L6 7M12 7h6l3 5h-6l3-5M8 20h8" /></svg>
    case 'launch':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4c3-1 5-1 6-1 0 1 0 3-1 6l-6 6-4-4Z" /><path d="m9 11-4 1-2 3 6 1 1 5 3-2v-4M16 7h.01" /></svg>
    case 'naming':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h8l8 8-7 7-9-9Z" /><circle cx="8" cy="9" r="1.2" /><path d="M12 5h4l4 4" /></svg>
    case 'marketing':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 13-5v14L4 14Z" /><path d="M4 10v4M7 15l1 5h4l-2-5M17 9c2 1 2 5 0 6" /></svg>
    case 'calendar':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="15" rx="2" /><path d="M7.5 3.5v4M16.5 3.5v4M3.5 10h17M8 14h2M13 14h3M8 17h3" /></svg>
    case 'ads':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><path d="m12 12 7-7M16 5h3v3" /></svg>
    case 'pitch':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="12" rx="2" /><path d="M8 20h8M12 16v4m-5-8 3-3 2 2 4-4" /></svg>
    case 'discover':
      /* A lamp: finding something already there rather than acquiring it. */
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 1 3.5 10.9V17h-7v-3.1A6 6 0 0 1 12 3Z" /><path d="M10 20h4M9.5 17h5" /></svg>
    case 'sidehustle':
      /* A rising step beside a steady line: earning added alongside, not instead. */
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18M6 20v-4h4v4M14 20V9h4v11" /><path d="m5 11 4-4 3 3 5-6" /></svg>
  }
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
          <h1>Pick a useful<br />starting point.</h1>
          <p>Choose a guided tool for study, career, creative work, decisions or business. AI360 will help shape the details with you.</p>
        </div>
        <aside aria-label="Tools and kits promise">
          <span>How it works</span>
          <ol>
            <li><b>Choose a starting point</b><small>Pick the closest match—you can adapt it.</small></li>
            <li><b>Add your situation</b><small>Answer only the questions that change the work.</small></li>
            <li><b>Keep it in a Project</b><small>Review, improve and return to the result later.</small></li>
          </ol>
        </aside>
      </section>

      <section className="market-discovery" aria-label="Find a tool or kit">
        <label className="market-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5" /></svg>
          <span className="sr-only">Search tools and kits</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools and kits" />
          {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear tools and kits search">×</button> : <kbd>⌕</kbd>}
        </label>
        <div className="market-categories" aria-label="Tools and kits categories">
          {CATEGORIES.map((item) => (
            <button key={item.id} type="button" className={category === item.id ? 'active' : ''} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>
          ))}
        </div>
      </section>

      <div className="market-result-count" aria-live="polite">Showing <b>{visible.length}</b> {visible.length === 1 ? 'tool or kit' : 'tools and kits'}</div>
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
