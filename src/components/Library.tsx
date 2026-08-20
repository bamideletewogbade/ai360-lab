'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { scopedStorageKey } from '@/lib/workspace'
import { mergeProjects, sortProjects } from '@/lib/studio-projects'
import type { StudioAsset, StudioProject } from '@/lib/studio-project-model'
import { filterLibraryItems, type LibraryFilterKind, type LibraryFilterStatus } from '@/lib/library-filter'

const PROJECTS_STORAGE_KEY = 'ai360-studio-projects-v2'

type LibraryKind = LibraryFilterKind
type LibraryStatus = LibraryFilterStatus

type LibraryItem = {
  id: string
  kind: LibraryKind
  title: string
  preview?: string
  formatLabel: string
  status: LibraryStatus
  createdAt: number
  sizeLabel?: string
  sourceLabel: string
  downloadUrl?: string
  onOpenProject?: string
}

type DocumentSummary = {
  assetId: string
  filename: string
  format: string
  byteSize: number
  createdAt: string
  projectId: string | null
  conversationId: string | null
}

type MediaJobSummary = {
  id: string
  mediaType: 'image' | 'video'
  model?: string | null
  outputAssetId?: string | null
  createdAt?: string
  projectId?: string | null
  intent?: { purpose?: string; aspectRatio?: string }
}

const ASSET_TYPE_LABEL: Record<StudioAsset['type'], string> = {
  strategy: 'Strategy',
  messaging: 'Written piece',
  whatsapp: 'WhatsApp message',
  social: 'Social post',
  flyer: 'Flyer',
  direct: 'Direct message',
  logo: 'Logo direction',
  video: 'Video direction',
}

const KIND_LABEL: Record<LibraryKind, string> = {
  document: 'Document',
  image: 'Image',
  video: 'Video',
  project: 'Project work',
}

function LibraryKindIcon({ kind }: { kind: LibraryKind }) {
  if (kind === 'document') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.5h7l4 4v13h-11Z" /><path d="M13.5 3.5v4h4M9 12h6M9 15.5h6" /></svg>
  }
  if (kind === 'image') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4.5 17 4.5-4.5 3.2 3.2 2.3-2.3 5 5" /></svg>
  }
  if (kind === 'video') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="13" height="14" rx="2.5" /><path d="m16.5 10 4-2v8l-4-2Z" /></svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6l2-2h9v13h-17Z" /><path d="M3.5 9.5h17M9 13h6" /></svg>
}

function bytesLabel(byteSize: number) {
  if (byteSize < 1024) return `${byteSize} B`
  if (byteSize < 1024 * 1024) return `${Math.round(byteSize / 1024)} KB`
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`
}

function readLocalProjects(storageKey: string): StudioProject[] {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as StudioProject[]) : []
  } catch {
    return []
  }
}

function projectDisplayName(project: StudioProject) {
  return project.campaign.name?.trim() || project.intake.businessName?.trim() || 'Untitled project'
}

function assetPreview(content: string) {
  const stripped = content.replace(/[#*_`>-]/g, ' ').replace(/\s+/g, ' ').trim()
  return stripped.length > 160 ? `${stripped.slice(0, 160)}…` : stripped
}

function createdLabel(createdAt: number) {
  if (!createdAt) return 'Recently created'
  const date = new Date(createdAt)
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' as const }),
  }).format(date)
}

export function Library({
  signedIn,
  workspaceScope,
  onOpenProject,
}: {
  signedIn: boolean
  workspaceScope: string
  onOpenProject: (projectId: string) => void
}) {
  const [projects, setProjects] = useState<StudioProject[]>([])
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [media, setMedia] = useState<MediaJobSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | LibraryKind>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return
      event.preventDefault()
      searchInputRef.current?.focus()
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  useEffect(() => {
    let cancelled = false
    const storageKey = scopedStorageKey(PROJECTS_STORAGE_KEY, workspaceScope)
    const local = readLocalProjects(storageKey)

    async function load() {
      if (!signedIn) {
        if (!cancelled) {
          setProjects(sortProjects(local))
          setDocuments([])
          setMedia([])
          setLoaded(true)
        }
        return
      }
      const [projectsResult, documentsResult, mediaResult] = await Promise.allSettled([
        fetch('/api/projects', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/documents?list=1', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/studio/media?recent=1', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
      ])
      if (cancelled) return
      const cloudProjects = projectsResult.status === 'fulfilled' && Array.isArray(projectsResult.value?.projects)
        ? (projectsResult.value.projects as StudioProject[])
        : []
      setProjects(mergeProjects(cloudProjects, local))
      setDocuments(
        documentsResult.status === 'fulfilled' && Array.isArray(documentsResult.value?.documents)
          ? documentsResult.value.documents
          : [],
      )
      setMedia(
        mediaResult.status === 'fulfilled' && Array.isArray(mediaResult.value?.jobs)
          ? mediaResult.value.jobs
          : [],
      )
      setLoaded(true)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [signedIn, workspaceScope])

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const project of projects) map.set(project.id, projectDisplayName(project))
    return map
  }, [projects])

  const items = useMemo<LibraryItem[]>(() => {
    const documentItems: LibraryItem[] = documents.map((doc) => ({
      id: `doc-${doc.assetId}`,
      kind: 'document',
      title: doc.filename.replace(/\.[a-z0-9]+$/i, ''),
      formatLabel: doc.format.toUpperCase(),
      status: 'ready',
      createdAt: new Date(doc.createdAt).getTime() || 0,
      sizeLabel: bytesLabel(doc.byteSize),
      sourceLabel: doc.projectId && projectNameById.get(doc.projectId) ? projectNameById.get(doc.projectId)! : 'From a chat',
      downloadUrl: `/api/documents?assetId=${encodeURIComponent(doc.assetId)}`,
    }))

    const mediaItems: LibraryItem[] = media
      .filter((job) => job.outputAssetId)
      .map((job) => ({
        id: `media-${job.id}`,
        kind: job.mediaType,
        title: job.intent?.purpose || (job.mediaType === 'video' ? 'Generated video' : 'Generated image'),
        formatLabel: job.mediaType === 'video' ? 'VIDEO' : 'IMAGE',
        status: 'ready',
        createdAt: job.createdAt ? new Date(job.createdAt).getTime() || 0 : 0,
        sourceLabel: job.projectId && projectNameById.get(job.projectId) ? projectNameById.get(job.projectId)! : 'Media Studio',
        downloadUrl: `/api/studio/media?assetId=${encodeURIComponent(job.outputAssetId as string)}`,
      }))

    const projectItems: LibraryItem[] = projects.flatMap((project) => {
      const name = projectDisplayName(project)
      return project.assets.map((asset) => ({
        id: `asset-${project.id}-${asset.id}`,
        kind: 'project' as const,
        title: asset.title,
        preview: assetPreview(asset.content),
        formatLabel: ASSET_TYPE_LABEL[asset.type] || asset.type,
        status: asset.status === 'approved' ? ('ready' as const) : ('draft' as const),
        createdAt: asset.versions?.[asset.versions.length - 1]?.createdAt || project.updatedAt,
        sourceLabel: name,
        onOpenProject: project.id,
      }))
    })

    return [...documentItems, ...mediaItems, ...projectItems].sort((a, b) => b.createdAt - a.createdAt)
  }, [documents, media, projects, projectNameById])

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const visible = useMemo(() => filterLibraryItems(items, {
    type: typeFilter,
    status: statusFilter,
    query: searchQuery,
  }), [items, searchQuery, statusFilter, typeFilter])

  const counts = useMemo(() => ({
    all: items.length,
    document: items.filter((item) => item.kind === 'document').length,
    image: items.filter((item) => item.kind === 'image').length,
    video: items.filter((item) => item.kind === 'video').length,
    project: items.filter((item) => item.kind === 'project').length,
    ready: items.filter((item) => item.status === 'ready').length,
    draft: items.filter((item) => item.status === 'draft').length,
  }), [items])

  const hasActiveFilters = Boolean(normalizedSearch || typeFilter !== 'all' || statusFilter !== 'all')
  const clearFilters = () => {
    setSearchQuery('')
    setTypeFilter('all')
    setStatusFilter('all')
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  return (
    <div className="outcomes-container full-width-layout">
      <header className="outcomes-header">
        <div className="outcomes-heading">
          <span className="outcomes-eyebrow"><i aria-hidden="true" /> Workspace library</span>
          <h1>Your work, ready when you need it.</h1>
          <p className="outcomes-intro">
            Find every document, visual and project outcome you have made across AI360.
          </p>
        </div>
        <dl className="outcomes-summary" aria-label="Library summary">
          <div><dt>All work</dt><dd>{counts.all}</dd></div>
          <div><dt>Finished</dt><dd>{counts.ready}</dd></div>
          <div><dt>In progress</dt><dd>{counts.draft}</dd></div>
        </dl>
      </header>

      <form className="outcomes-search" role="search" onSubmit={(event) => event.preventDefault()}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" /></svg>
        <label htmlFor="library-search">Search your library</label>
        <input
          ref={searchInputRef}
          id="library-search"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by title, project, type or content…"
          autoComplete="off"
        />
        {searchQuery ? (
          <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear library search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
          </button>
        ) : <kbd aria-hidden="true">/</kbd>}
      </form>

      <div className="outcomes-filter-row">
        <div className="outcomes-filter-bar" role="group" aria-label="Filter by type">
          {([
            ['all', `All (${counts.all})`],
            ['document', `Documents (${counts.document})`],
            ['image', `Images (${counts.image})`],
            ['video', `Video (${counts.video})`],
            ['project', `Project work (${counts.project})`],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={typeFilter === value ? 'active' : ''}
              onClick={() => setTypeFilter(value)}
              aria-pressed={typeFilter === value}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="outcomes-status-toggle" role="group" aria-label="Filter by status">
          <button type="button" className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')} aria-pressed={statusFilter === 'all'}>
            All
          </button>
          <button type="button" className={statusFilter === 'ready' ? 'active' : ''} onClick={() => setStatusFilter('ready')} aria-pressed={statusFilter === 'ready'}>
            Finished only
          </button>
        </div>
      </div>

      <div className="outcomes-results-line" aria-live="polite" aria-atomic="true">
        <span>
          {loaded ? <><strong>{visible.length}</strong> {visible.length === 1 ? 'item' : 'items'}</> : 'Gathering your work…'}
          {normalizedSearch ? <> matching &ldquo;{searchQuery.trim()}&rdquo;</> : null}
        </span>
        <span>Newest first</span>
      </div>

      {!signedIn ? (
        <p className="outcomes-guest-note">
          Signed out: showing project work saved on this device. Sign in to also see documents and media you&rsquo;ve created.
        </p>
      ) : null}

      {!loaded ? (
        <div className="outcomes-loading" aria-label="Loading your library">
          {[0, 1, 2].map((item) => <span key={item} />)}
        </div>
      ) : visible.length ? (
        <div className="outcomes-grid" id="library-results">
          {visible.map((item) => (
            <article className={`outcomes-card outcomes-card-${item.kind}`} key={item.id}>
              <div className="outcomes-card-top">
                <div className="outcomes-card-kind">
                  <span className="outcomes-kind-icon"><LibraryKindIcon kind={item.kind} /></span>
                  <span><b>{KIND_LABEL[item.kind]}</b><small>{item.formatLabel}</small></span>
                </div>
                <span className={`outcomes-card-status status-${item.status}`}>
                  <i aria-hidden="true" />
                  {item.status === 'ready' ? 'Finished' : 'In progress'}
                </span>
              </div>
              <div className="outcomes-card-body">
                <h2>{item.title}</h2>
                {item.preview ? <p>{item.preview}</p> : (
                  <p className="outcomes-card-hint">
                    {item.kind === 'document' ? 'Ready to download and use.' : `Created in ${item.sourceLabel}.`}
                  </p>
                )}
              </div>
              <div className="outcomes-card-footer">
                <span className="outcomes-card-source"><b>{item.sourceLabel}</b><small>{createdLabel(item.createdAt)}{item.sizeLabel ? ` · ${item.sizeLabel}` : ''}</small></span>
                {item.downloadUrl ? (
                  <a href={item.downloadUrl} download className="outcomes-download-btn">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    <span>Download</span>
                  </a>
                ) : item.onOpenProject ? (
                  <button type="button" className="outcomes-download-btn" onClick={() => onOpenProject(item.onOpenProject as string)}>
                    <span>Open project</span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="outcomes-empty">
          <span aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4 4" /></svg></span>
          <h2>{items.length ? 'No work matches that' : 'Your library is ready for your first creation'}</h2>
          <p>{items.length
            ? 'Try another search or clear a filter to see more of your work.'
            : 'Start a chat, project or Media Studio render and it will be easy to find here.'}</p>
          {hasActiveFilters ? <button type="button" onClick={clearFilters}>Clear search and filters</button> : null}
        </div>
      )}
    </div>
  )
}
