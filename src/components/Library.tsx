'use client'

import { useEffect, useMemo, useState } from 'react'
import { scopedStorageKey } from '@/lib/workspace'
import { mergeProjects, sortProjects } from '@/lib/studio-projects'
import type { StudioAsset, StudioProject } from '@/lib/studio-project-model'

const PROJECTS_STORAGE_KEY = 'ai360-studio-projects-v2'

type LibraryKind = 'document' | 'image' | 'video' | 'project'
type LibraryStatus = 'ready' | 'draft'

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

  const visible = items.filter((item) => {
    if (typeFilter !== 'all' && item.kind !== typeFilter) return false
    if (statusFilter === 'ready' && item.status !== 'ready') return false
    return true
  })

  const counts = {
    all: items.length,
    document: items.filter((item) => item.kind === 'document').length,
    image: items.filter((item) => item.kind === 'image').length,
    video: items.filter((item) => item.kind === 'video').length,
    project: items.filter((item) => item.kind === 'project').length,
  }

  return (
    <div className="outcomes-container full-width-layout">
      <header className="outcomes-header">
        <div>
          <span className="outcomes-eyebrow">Workspace library</span>
          <h1>Everything you&rsquo;ve made</h1>
          <p className="outcomes-intro">
            Documents, images, video and project work from across AI360, kept in one place.
          </p>
        </div>
      </header>

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
            >
              {label}
            </button>
          ))}
        </div>
        <div className="outcomes-status-toggle" role="group" aria-label="Filter by status">
          <button type="button" className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>
            All
          </button>
          <button type="button" className={statusFilter === 'ready' ? 'active' : ''} onClick={() => setStatusFilter('ready')}>
            Finished only
          </button>
        </div>
      </div>

      {!signedIn ? (
        <p className="outcomes-guest-note">
          Signed out: showing project work saved on this device. Sign in to also see documents and media you&rsquo;ve created.
        </p>
      ) : null}

      {!loaded ? (
        <p className="outcomes-empty">Loading your work…</p>
      ) : visible.length ? (
        <div className="outcomes-grid">
          {visible.map((item) => (
            <div className="outcomes-card" key={item.id}>
              <div className="outcomes-card-top">
                <span className={`format-badge format-${item.kind}`}>{item.formatLabel}</span>
                <span className="outcomes-card-status">
                  {item.status === 'ready' ? 'Finished' : 'In progress'}
                </span>
              </div>
              <h3>{item.title}</h3>
              {item.preview ? <p>{item.preview}</p> : null}
              <div className="outcomes-card-footer">
                <span className="outcomes-card-source">
                  {item.sourceLabel}
                  {item.sizeLabel ? ` · ${item.sizeLabel}` : ''}
                </span>
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
            </div>
          ))}
        </div>
      ) : (
        <p className="outcomes-empty">
          {items.length
            ? 'Nothing finished yet. Switch to "All" to see work still in progress.'
            : 'Nothing here yet. Start a chat, a project or a Media Studio render, and your work will show up here.'}
        </p>
      )}
    </div>
  )
}
