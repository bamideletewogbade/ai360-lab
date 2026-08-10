'use client'

import { useState } from 'react'

type OutcomeItem = {
  id: string
  title: string
  kind: 'pack' | 'document' | 'media'
  format: 'PDF' | 'DOCX' | 'PNG' | 'PACK'
  description: string
  createdAt: string
  size?: string
}

const DEMO_OUTCOMES: OutcomeItem[] = [
  {
    id: 'out-1',
    title: 'Accra Mobile Money Launch Pack',
    kind: 'pack',
    format: 'PACK',
    description: 'Full startup package including business brief, brand positioning, and marketing launch plan.',
    createdAt: 'Today',
  },
  {
    id: 'out-2',
    title: 'Executive Financial Model & Pitch Deck',
    kind: 'document',
    format: 'PDF',
    description: 'Formatted PDF document with 5-year financial projections and unit economics breakdown.',
    createdAt: 'Yesterday',
    size: '1.2 MB',
  },
  {
    id: 'out-3',
    title: 'Brand Assets & Social Templates',
    kind: 'media',
    format: 'PNG',
    description: 'High-resolution logo variants and social media campaign graphics.',
    createdAt: '3 days ago',
    size: '4.8 MB',
  },
  {
    id: 'out-4',
    title: 'Market Research & Competitor Benchmark',
    kind: 'document',
    format: 'DOCX',
    description: 'Comprehensive competitive landscape analysis and pricing strategy doc.',
    createdAt: '4 days ago',
    size: '850 KB',
  },
]

export function AppsDirectory() {
  const [filter, setFilter] = useState<'all' | 'pack' | 'document' | 'media'>('all')
  const [outcomes, setOutcomes] = useState<OutcomeItem[]>(DEMO_OUTCOMES)
  const [uploadNotice, setUploadNotice] = useState('')

  const visibleOutcomes = outcomes.filter((item) => filter === 'all' || item.kind === filter)

  const handleUpload = () => {
    const title = window.prompt('Enter outcome or app name:')
    if (!title?.trim()) return
    const newItem: OutcomeItem = {
      id: `out-${Date.now()}`,
      title: title.trim(),
      kind: 'document',
      format: 'PDF',
      description: 'User uploaded project deliverable.',
      createdAt: 'Just now',
    }
    setOutcomes((prev) => [newItem, ...prev])
    setUploadNotice('Outcome added to your directory!')
    setTimeout(() => setUploadNotice(''), 3000)
  }

  return (
    <div className="apps-directory-container full-width-layout">
      <header className="apps-header">
        <div>
          <span className="apps-eyebrow">Workspace Showcase</span>
          <h1>Apps & Outcomes Directory</h1>
          <p className="apps-intro">
            Explore, manage, and export deliverables, business packs, and app outputs generated across all your projects.
          </p>
        </div>
        <button type="button" className="upload-outcome-btn" onClick={handleUpload}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>Upload Outcome</span>
        </button>
      </header>

      {uploadNotice ? <div className="upload-toast">{uploadNotice}</div> : null}

      <div className="apps-filter-bar">
        {(['all', 'pack', 'document', 'media'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={filter === tab ? 'active' : ''}
            onClick={() => setFilter(tab)}
          >
            {tab === 'all' ? 'All Outcomes' : tab === 'pack' ? 'Business Packs' : tab === 'document' ? 'Documents' : 'Media Assets'}
          </button>
        ))}
      </div>

      <div className="apps-grid">
        {visibleOutcomes.map((item) => (
          <div className="apps-card" key={item.id}>
            <div className="apps-card-top">
              <span className={`format-badge format-${item.format.toLowerCase()}`}>{item.format}</span>
              <span className="apps-card-date">{item.createdAt}</span>
            </div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <div className="apps-card-footer">
              <span className="apps-card-size">{item.size || 'Ready'}</span>
              <button
                type="button"
                className="apps-download-btn"
                onClick={() => alert(`Accessing ${item.title}`)}
              >
                <span>View & Export</span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
