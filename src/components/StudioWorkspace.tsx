'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Image from 'next/image'
import { ResponseContent } from '@/components/ResponseContent'
import { mergeProjects, setProjectArchived, sortProjects, upsertProject } from '@/lib/studio-projects'
import { scopedStorageKey } from '@/lib/workspace'

type BrandFile = {
  name: string
  kind: 'image' | 'pdf' | 'text'
  data?: string
  text?: string
}

type Intake = {
  businessName: string
  industry: string
  offer: string
  audience: string
  goal: string
  location: string
  channels: string[]
  notes: string
}

type BrandProfile = {
  summary: string
  audience: string
  personality: string[]
  voice: string
  colors: Array<{ name: string; hex: string; role: string }>
  tagline: string
  valueProposition: string
}

type Campaign = {
  name: string
  objective: string
  bigIdea: string
  callToAction: string
  channels: string[]
  successMeasures: string[]
}

type StudioAsset = {
  id: string
  type: 'strategy' | 'messaging' | 'whatsapp' | 'social' | 'flyer' | 'direct' | 'logo' | 'video'
  title: string
  channel: string
  purpose: string
  content: string
  status?: 'draft' | 'approved'
}

type StudioProject = {
  id: string
  createdAt: number
  updatedAt: number
  intake: Intake
  brand: BrandProfile
  campaign: Campaign
  assets: StudioAsset[]
  sources?: Array<{ title: string; url: string }>
  archivedAt?: number
}

type GeneratedMedia = {
  kind: 'image' | 'video'
  status: 'generating' | 'pending' | 'in_progress' | 'completed' | 'failed'
  url?: string
  token?: string
  costUsd?: number
  model?: string
  error?: string
}

type ExecutionApproval = {
  asset: StudioAsset
  kind: 'logo' | 'social' | 'flyer' | 'video'
  estimatedCostUsd: number
  estimateLabel: string
}

type BuildAgent = {
  id: string
  mark: string
  name: string
  role: string
  working: string
  handoff: string
}

type StudioView = 'dashboard' | 'intake' | 'project'
type SaveState = 'local' | 'saving' | 'saved' | 'unavailable'

const STORAGE_KEY = 'ai360-studio-projects-v2'
const LEGACY_STORAGE_KEY = 'ai360-studio-project-v1'
const VIEW_KEY = 'ai360-studio-view-v2'
const IMPORT_ACK_KEY = 'ai360-studio-guest-import-v1'
const CHANNELS = ['WhatsApp', 'Instagram', 'Facebook', 'TikTok', 'SMS', 'Email', 'Google Business', 'Print']
const GOALS = [
  'Launch a new business',
  'Promote a product or service',
  'Announce an event',
  'Increase enquiries and sales',
  'Build online visibility',
  'Run a 30-day campaign',
]
const QUICK_STARTS = [
  { mark: '01', title: 'Launch a business', note: 'Brand foundation, launch campaign and practical sales assets.', goal: 'Launch a new business' },
  { mark: '02', title: 'Promote an offer', note: 'Turn one product or service into a coordinated conversion campaign.', goal: 'Promote a product or service' },
  { mark: '03', title: 'Fill an event', note: 'Create the message, promotion plan and event-ready content pack.', goal: 'Announce an event' },
  { mark: '04', title: 'Plan 30 days', note: 'Build a focused month of content with one consistent direction.', goal: 'Run a 30-day campaign' },
]
const ASSET_ICONS: Record<StudioAsset['type'], string> = {
  strategy: '01',
  messaging: 'Aa',
  whatsapp: 'WA',
  social: '◫',
  flyer: '▤',
  direct: '→',
  logo: 'LG',
  video: '▶',
}
const EMPTY_INTAKE: Intake = {
  businessName: '',
  industry: '',
  offer: '',
  audience: '',
  goal: '',
  location: 'Ghana',
  channels: ['WhatsApp', 'Instagram'],
  notes: '',
}
const BUILD_AGENTS: BuildAgent[] = [
  {
    id: 'scout',
    mark: '01',
    name: 'Brief Scout',
    role: 'Maps the business, audience and desired outcome.',
    working: 'Reading the brief and finding the strongest starting point',
    handoff: 'brief map',
  },
  {
    id: 'brand',
    mark: 'Aa',
    name: 'Brand Architect',
    role: 'Shapes the voice, personality, palette and positioning.',
    working: 'Turning business signals into a coherent brand foundation',
    handoff: 'brand system',
  },
  {
    id: 'campaign',
    mark: 'CTA',
    name: 'Campaign Strategist',
    role: 'Connects the goal, big idea, channels and measures.',
    working: 'Designing the campaign route and primary call to action',
    handoff: 'campaign route',
  },
  {
    id: 'production',
    mark: '08',
    name: 'Asset Crew',
    role: 'Produces eight coordinated, practical deliverables.',
    working: 'Writing and coordinating every campaign asset',
    handoff: 'asset pack',
  },
  {
    id: 'quality',
    mark: '✓',
    name: 'Quality Lead',
    role: 'Checks clarity, consistency, claims and usability.',
    working: 'Reviewing the complete pack before the final handoff',
    handoff: 'approved draft',
  },
]

function requestId() {
  return crypto.randomUUID()
}

function eventTimestamp() {
  return Date.now()
}

function normalizeHex(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#101112'
}

function projectMarkdown(project: StudioProject) {
  const approved = project.assets.filter((asset) => asset.status === 'approved').length
  return [
    `# ${project.campaign.name}`,
    '',
    `Prepared for ${project.intake.businessName}`,
    '',
    '## Campaign overview',
    '',
    `**Objective:** ${project.campaign.objective}`,
    '',
    `**Big idea:** ${project.campaign.bigIdea}`,
    '',
    `**Call to action:** ${project.campaign.callToAction}`,
    '',
    `**Channels:** ${project.campaign.channels.join(', ')}`,
    '',
    `**Progress:** ${approved} of ${project.assets.length} assets approved`,
    '',
    '## Brand foundation',
    '',
    project.brand.summary,
    '',
    `**Audience:** ${project.brand.audience}`,
    '',
    `**Voice:** ${project.brand.voice}`,
    '',
    `**Tagline:** ${project.brand.tagline}`,
    '',
    `**Value proposition:** ${project.brand.valueProposition}`,
    '',
    '## Success measures',
    '',
    ...project.campaign.successMeasures.map((measure) => `- ${measure}`),
    '',
    ...(project.sources?.length
      ? [
          '## Live sources',
          '',
          ...project.sources.map((source) => `- [${source.title}](${source.url})`),
          '',
        ]
      : []),
    ...project.assets.flatMap((asset) => [
      `## ${asset.title}`,
      '',
      `Channel: ${asset.channel} | Status: ${asset.status === 'approved' ? 'Approved' : 'Draft'}`,
      '',
      asset.content,
      '',
    ]),
  ].join('\n')
}

function StudioBuildRoom({
  intake,
  stage,
  elapsed,
}: {
  intake: Intake
  stage: number
  elapsed: number
}) {
  const complete = stage >= BUILD_AGENTS.length
  const activeAgent = BUILD_AGENTS[Math.min(stage, BUILD_AGENTS.length - 1)]
  const progress = complete ? 100 : [12, 30, 51, 73, 91][stage] ?? 91
  const context = [
    intake.businessName,
    intake.goal,
    intake.channels.slice(0, 3).join(' + '),
  ].filter(Boolean)

  return (
    <section className={`studio-build-room${complete ? ' complete' : ''}`} aria-live="polite" aria-busy={!complete}>
      <header className="build-room-head">
        <div className="build-orbit" aria-hidden="true">
          <i />
          <i />
          <i />
          <strong>AI</strong>
        </div>
        <span>
          <span className="studio-kicker">{complete ? 'Handoff complete' : 'Agent room live'}</span>
          <h2>{complete ? 'Your launch pack is ready.' : 'Building together, in real time.'}</h2>
          <p>{complete ? 'Opening the completed project for your review.' : activeAgent.working}.</p>
        </span>
      </header>

      <div className="build-context">
        {context.map((item) => <span key={item}>{item}</span>)}
      </div>

      <div className="build-progress" aria-label={`${progress}% complete`}>
        <i style={{ width: `${progress}%` }} />
        <span>{progress}%</span>
      </div>

      <div className="agent-relay">
        {BUILD_AGENTS.map((agent, index) => {
          const status = complete || index < stage ? 'complete' : index === stage ? 'active' : 'queued'
          return (
            <div className={`relay-step ${status}`} key={agent.id}>
              <span className="relay-line" aria-hidden="true"><i /></span>
              <span className="relay-avatar">{status === 'complete' ? '✓' : agent.mark}</span>
              <span className="relay-copy">
                <span><b>{agent.name}</b><em>{status === 'active' ? 'Working' : status === 'complete' ? 'Passed' : 'Waiting'}</em></span>
                <small>{agent.role}</small>
              </span>
              <span className="relay-handoff">
                {status === 'complete' ? <><i>→</i>{agent.handoff}</> : status === 'active' ? <span className="relay-dots"><i /><i /><i /></span> : 'queued'}
              </span>
            </div>
          )
        })}
      </div>

      <footer className="build-room-foot">
        <span className="studio-spinner" aria-hidden="true" />
        <span>
          <b>{complete ? 'Pack assembled and checked' : `${activeAgent.name} is on it`}</b>
          <small>{complete ? 'One moment while Studio prepares your workspace.' : `Elapsed ${elapsed}s. You can leave this tab open while the team works.`}</small>
        </span>
      </footer>
    </section>
  )
}

export function StudioWorkspace({
  initialBrief = '',
  signedIn = false,
  workspaceScope = 'guest',
}: {
  initialBrief?: string
  signedIn?: boolean
  workspaceScope?: string
}) {
  const [hydrated, setHydrated] = useState(false)
  const [intake, setIntake] = useState<Intake>(EMPTY_INTAKE)
  const [brandFile, setBrandFile] = useState<BrandFile | null>(null)
  const [project, setProject] = useState<StudioProject | null>(null)
  const [projects, setProjects] = useState<StudioProject[]>([])
  const [view, setView] = useState<StudioView>('dashboard')
  const [cloudReady, setCloudReady] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('local')
  const [guestProjects, setGuestProjects] = useState<StudioProject[]>([])
  const [importBusy, setImportBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState('')
  const [editingId, setEditingId] = useState('')
  const [revisionId, setRevisionId] = useState('')
  const [revisionInstruction, setRevisionInstruction] = useState('')
  const [exporting, setExporting] = useState('')
  const [mediaBusy, setMediaBusy] = useState('')
  const [generatedMedia, setGeneratedMedia] = useState<Record<string, GeneratedMedia>>({})
  const [executionApproval, setExecutionApproval] = useState<ExecutionApproval | null>(null)
  const [buildingProject, setBuildingProject] = useState(false)
  const [buildComplete, setBuildComplete] = useState(false)
  const [buildStage, setBuildStage] = useState(0)
  const [buildElapsed, setBuildElapsed] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const loadedWorkspaceRef = useRef('')
  const projectStorageKey = scopedStorageKey(STORAGE_KEY, workspaceScope)
  const viewStorageKey = scopedStorageKey(VIEW_KEY, workspaceScope)
  const importAckKey = scopedStorageKey(IMPORT_ACK_KEY, workspaceScope)

  useEffect(() => {
    let mounted = true
    queueMicrotask(() => {
      if (!mounted) return
      try {
        const saved = localStorage.getItem(projectStorageKey)
        let loaded = saved ? JSON.parse(saved) as StudioProject[] : []
        if (!saved && workspaceScope === 'guest') {
          const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
          if (legacy) {
            loaded = [JSON.parse(legacy) as StudioProject]
            localStorage.removeItem(LEGACY_STORAGE_KEY)
          }
        }
        loaded = sortProjects(loaded)
        setProjects(loaded)
        setGuestProjects([])
        if (signedIn && !localStorage.getItem(importAckKey)) {
          const guestSaved = localStorage.getItem(STORAGE_KEY)
          const candidates = guestSaved ? JSON.parse(guestSaved) as StudioProject[] : []
          setGuestProjects(candidates.filter((item) => !item.archivedAt))
        }
        const savedView = localStorage.getItem(viewStorageKey) as StudioView | null
        if (initialBrief.trim()) {
          setIntake((current) => ({ ...current, notes: initialBrief.trim() }))
          setView('intake')
          setProject(null)
        } else if (savedView === 'project' && loaded[0]) {
          setProject(loaded[0])
          setView('project')
        } else {
          setProject(null)
          setView(savedView === 'intake' ? 'intake' : 'dashboard')
        }
      } catch {
        // A damaged local project should not prevent Studio from opening.
        setProjects([])
        setProject(null)
        setView(initialBrief.trim() ? 'intake' : 'dashboard')
      }
      loadedWorkspaceRef.current = workspaceScope
      setCloudReady(false)
      setSaveState(signedIn ? 'saving' : 'local')
      setHydrated(true)
    })
    return () => {
      mounted = false
    }
  }, [importAckKey, initialBrief, projectStorageKey, signedIn, viewStorageKey, workspaceScope])

  useEffect(() => {
    if (!hydrated || loadedWorkspaceRef.current !== workspaceScope) return
    try {
      localStorage.setItem(projectStorageKey, JSON.stringify(projects))
      localStorage.setItem(viewStorageKey, view)
    } catch {
      console.warn('[AI360] Studio projects could not be saved locally.')
    }
  }, [hydrated, projectStorageKey, projects, view, viewStorageKey, workspaceScope])

  useEffect(() => {
    if (!project || loadedWorkspaceRef.current !== workspaceScope) return
    setProjects((current) => upsertProject(current, project))
  }, [project, workspaceScope])

  useEffect(() => {
    if (!hydrated || !signedIn || loadedWorkspaceRef.current !== workspaceScope) {
      setCloudReady(false)
      return
    }
    let cancelled = false
    setSaveState('saving')
    fetch('/api/projects')
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error?.message || 'Cloud projects are unavailable.')
        return (data.projects || []) as StudioProject[]
      })
      .then((cloudProjects) => {
        if (cancelled) return
        setProjects((localProjects) => mergeProjects(cloudProjects, localProjects))
        setProject((current) => {
          if (!current) return current
          const cloudCopy = cloudProjects.find((item) => item.id === current.id)
          return cloudCopy && cloudCopy.updatedAt > current.updatedAt ? cloudCopy : current
        })
        setCloudReady(true)
        setSaveState('saved')
      })
      .catch(() => {
        if (!cancelled) setSaveState('unavailable')
      })
    return () => { cancelled = true }
  }, [hydrated, signedIn, workspaceScope])

  useEffect(() => {
    if (!project || !signedIn || !cloudReady || loadedWorkspaceRef.current !== workspaceScope) return
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId() },
        body: JSON.stringify(project),
      })
        .then(async (response) => {
          if (!response.ok) {
            const data = await response.json().catch(() => ({}))
            throw new Error(data.error?.message || 'Cloud save failed.')
          }
          setSaveState('saved')
        })
        .catch(() => setSaveState('unavailable'))
    }, 900)
    return () => window.clearTimeout(timer)
  }, [cloudReady, project, signedIn, workspaceScope])

  useEffect(() => {
    if (!buildingProject || buildComplete) return
    const startedAt = Date.now()
    const update = () => {
      const seconds = Math.floor((Date.now() - startedAt) / 1_000)
      setBuildElapsed(seconds)
      setBuildStage(seconds < 4 ? 0 : seconds < 9 ? 1 : seconds < 16 ? 2 : seconds < 25 ? 3 : 4)
    }
    update()
    const timer = window.setInterval(update, 1_000)
    return () => window.clearInterval(timer)
  }, [buildingProject, buildComplete])

  const approvedCount = project?.assets.filter((asset) => asset.status === 'approved').length ?? 0
  const progress = project?.assets.length ? Math.round((approvedCount / project.assets.length) * 100) : 0
  const activeAsset = project?.assets.find((asset) => asset.id === expandedId)

  const readiness = useMemo(() => {
    const checks = [
      Boolean(intake.businessName),
      Boolean(intake.offer),
      Boolean(intake.audience),
      Boolean(intake.goal),
      intake.channels.length > 0,
    ]
    return checks.filter(Boolean).length
  }, [intake])

  function updateIntake(field: keyof Intake, value: string | string[]) {
    setIntake((current) => ({ ...current, [field]: value }))
  }

  function toggleChannel(channel: string) {
    setIntake((current) => ({
      ...current,
      channels: current.channels.includes(channel)
        ? current.channels.filter((item) => item !== channel)
        : [...current.channels, channel],
    }))
  }

  async function handleBrandFile(file?: File) {
    setError('')
    if (!file) return
    if (file.size > 4 * 1024 * 1024) {
      setError('Choose a brand file smaller than 4 MB.')
      return
    }
    try {
      if (file.type === 'application/pdf') {
        setBrandFile({ name: file.name, kind: 'pdf', data: await readDataUrl(file) })
      } else if (file.type.startsWith('image/')) {
        setBrandFile({ name: file.name, kind: 'image', data: await readDataUrl(file) })
      } else if (file.type.startsWith('text/') || /\.(txt|md|csv|json)$/i.test(file.name)) {
        setBrandFile({ name: file.name, kind: 'text', text: (await file.text()).slice(0, 60_000) })
      } else {
        setError('Use a PDF, PNG, JPG, TXT, Markdown, CSV or JSON brand file.')
      }
    } catch {
      setError('That brand file could not be read.')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function createProject() {
    setError('')
    if (!intake.businessName || !intake.offer || !intake.audience || !intake.goal) {
      setError('Complete the business name, offer, audience and campaign goal.')
      return
    }
    if (!intake.channels.length) {
      setError('Select at least one campaign channel.')
      return
    }
    setBusy(true)
    setBuildingProject(true)
    setBuildComplete(false)
    setBuildStage(0)
    setBuildElapsed(0)
    const id = requestId()
    try {
      const response = await fetch('/api/studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': id },
        body: JSON.stringify({ action: 'create', intake, brandFile }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.result) {
        const reference = data.requestId || response.headers.get('X-Request-Id') || id
        throw new Error(`${data.error || 'Studio could not create this campaign.'} Reference: ${reference}`)
      }
      setBuildStage(BUILD_AGENTS.length)
      setBuildComplete(true)
      await new Promise((resolve) => window.setTimeout(resolve, 900))
      const result = data.result as {
        brand: BrandProfile
        campaign: Campaign
        assets: StudioAsset[]
        sources?: Array<{ title: string; url: string }>
      }
      const next: StudioProject = {
        id: requestId(),
        createdAt: eventTimestamp(),
        updatedAt: eventTimestamp(),
        intake,
        brand: result.brand,
        campaign: result.campaign,
        sources: result.sources ?? [],
        assets: result.assets.map((asset, index) => ({
          ...asset,
          id: asset.id || `asset-${index + 1}`,
          status: 'draft',
        })),
      }
      setProject(next)
      setView('project')
      setExpandedId(next.assets[0]?.id || '')
      setBrandFile(null)
      requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
    } catch (cause) {
      console.error('[AI360] Studio generation failed', cause)
      setError(cause instanceof Error ? cause.message : 'Studio could not create this campaign.')
    } finally {
      setBusy(false)
      setBuildingProject(false)
    }
  }

  function updateAsset(id: string, updates: Partial<StudioAsset>) {
    setProject((current) => current
      ? {
          ...current,
          updatedAt: eventTimestamp(),
          assets: current.assets.map((asset) => asset.id === id ? { ...asset, ...updates } : asset),
        }
      : current)
  }

  async function regenerateAsset(asset: StudioAsset) {
    if (!project) return
    setBusy(true)
    setError('')
    const id = requestId()
    try {
      const response = await fetch('/api/studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': id },
        body: JSON.stringify({
          action: 'regenerate',
          intake: project.intake,
          brand: project.brand,
          campaign: project.campaign,
          asset,
          instruction: revisionInstruction,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.result) {
        const reference = data.requestId || response.headers.get('X-Request-Id') || id
        throw new Error(`${data.error || 'Studio could not improve this asset.'} Reference: ${reference}`)
      }
      updateAsset(asset.id, { ...data.result, id: asset.id, status: 'draft' })
      setRevisionId('')
      setRevisionInstruction('')
    } catch (cause) {
      console.error('[AI360] Studio revision failed', cause)
      setError(cause instanceof Error ? cause.message : 'Studio could not improve this asset.')
    } finally {
      setBusy(false)
    }
  }

  async function exportPack(format: 'pdf' | 'docx') {
    if (!project) return
    const id = requestId()
    setExporting(format)
    setError('')
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': id },
        body: JSON.stringify({
          title: `${project.intake.businessName} Marketing Launch Pack`,
          content: projectMarkdown(project),
          format,
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        const reference = data.requestId || response.headers.get('X-Request-Id') || id
        throw new Error(`${data.error || 'The campaign pack could not be exported.'} Reference: ${reference}`)
      }
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') || ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `marketing-launch-pack.${format}`
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (cause) {
      console.error('[AI360] Studio export failed', cause)
      setError(cause instanceof Error ? cause.message : 'The campaign pack could not be exported.')
    } finally {
      setExporting('')
    }
  }

  async function prepareExecution(asset: StudioAsset) {
    if (asset.status !== 'approved') {
      setError('Approve this asset before producing or sharing it.')
      return
    }
    setError('')
    if (asset.type === 'video') {
      setMediaBusy(asset.id)
      const id = requestId()
      try {
        const response = await fetch('/api/studio/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': id },
          body: JSON.stringify({ action: 'quote' }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || typeof data.costUsd !== 'number') {
          const reference = data.requestId || response.headers.get('X-Request-Id') || id
          throw new Error(`${data.error || 'The current video price is unavailable.'} Reference: ${reference}`)
        }
        setExecutionApproval({
          asset,
          kind: 'video',
          estimatedCostUsd: data.costUsd,
          estimateLabel: `${data.duration}-second ${data.aspectRatio} ${data.resolution} video without audio`,
        })
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The current video price is unavailable.')
      } finally {
        setMediaBusy('')
      }
      return
    }
    if (asset.type === 'logo' || asset.type === 'social' || asset.type === 'flyer') {
      setExecutionApproval({
        asset,
        kind: asset.type,
        estimatedCostUsd: 0.05,
        estimateLabel: 'one low-quality draft image, billed at actual provider usage',
      })
    }
  }

  async function confirmExecution() {
    if (!project || !executionApproval) return
    const approval = executionApproval
    setExecutionApproval(null)
    setMediaBusy(approval.asset.id)
    setError('')
    const id = requestId()
    try {
      if (approval.kind === 'video') {
        setGeneratedMedia((current) => ({
          ...current,
          [approval.asset.id]: { kind: 'video', status: 'pending', costUsd: approval.estimatedCostUsd },
        }))
        const response = await fetch('/api/studio/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': id },
          body: JSON.stringify({
            action: 'submit',
            approved: true,
            acceptedCostUsd: approval.estimatedCostUsd,
            businessName: project.intake.businessName,
            brand: project.brand,
            campaign: project.campaign,
            asset: approval.asset,
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data.token) {
          const reference = data.requestId || response.headers.get('X-Request-Id') || id
          throw new Error(`${data.error || 'The video could not be started.'} Reference: ${reference}`)
        }
        setGeneratedMedia((current) => ({
          ...current,
          [approval.asset.id]: {
            kind: 'video',
            status: data.status || 'pending',
            token: data.token,
            costUsd: data.estimatedCostUsd,
            model: data.model,
          },
        }))
        window.setTimeout(() => pollVideo(approval.asset.id, data.token), 30_000)
      } else {
        setGeneratedMedia((current) => ({
          ...current,
          [approval.asset.id]: { kind: 'image', status: 'generating' },
        }))
        const response = await fetch('/api/studio/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': id },
          body: JSON.stringify({
            approved: true,
            kind: approval.kind,
            businessName: project.intake.businessName,
            brand: project.brand,
            campaign: project.campaign,
            asset: approval.asset,
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data.image) {
          const reference = data.requestId || response.headers.get('X-Request-Id') || id
          throw new Error(`${data.error || 'The image could not be generated.'} Reference: ${reference}`)
        }
        setGeneratedMedia((current) => ({
          ...current,
          [approval.asset.id]: {
            kind: 'image',
            status: 'completed',
            url: data.image,
            costUsd: data.costUsd,
            model: data.model,
          },
        }))
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Media generation failed.'
      setGeneratedMedia((current) => ({
        ...current,
        [approval.asset.id]: {
          kind: approval.kind === 'video' ? 'video' : 'image',
          status: 'failed',
          error: message,
        },
      }))
      setError(message)
    } finally {
      setMediaBusy('')
    }
  }

  async function pollVideo(assetId: string, token: string) {
    const id = requestId()
    try {
      const response = await fetch('/api/studio/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': id },
        body: JSON.stringify({ action: 'status', token }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Video status could not be checked.')
      const status = data.status as GeneratedMedia['status']
      setGeneratedMedia((current) => ({
        ...current,
        [assetId]: {
          ...current[assetId],
          kind: 'video',
          status,
          token,
          url: data.downloadUrl,
          costUsd: data.costUsd ?? current[assetId]?.costUsd,
          error: data.error,
        },
      }))
      if (status === 'pending' || status === 'in_progress') {
        window.setTimeout(() => pollVideo(assetId, token), 30_000)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Video status could not be checked.'
      setGeneratedMedia((current) => ({
        ...current,
        [assetId]: { ...current[assetId], kind: 'video', status: 'failed', error: message },
      }))
      setError(message)
    }
  }

  async function shareAsset(asset: StudioAsset) {
    if (asset.status !== 'approved') {
      setError('Approve this asset before sharing it.')
      return
    }
    const shareData = {
      title: `${project?.intake.businessName || 'AI360 Studio'}: ${asset.title}`,
      text: asset.content,
    }
    try {
      if (navigator.share) await navigator.share(shareData)
      else window.open(`https://wa.me/?text=${encodeURIComponent(`${shareData.title}\n\n${shareData.text}`)}`, '_blank', 'noopener,noreferrer')
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError('Sharing could not be opened on this device. Copy the asset instead.')
    }
  }

  function downloadGenerated(asset: StudioAsset, media: GeneratedMedia) {
    if (!media.url) return
    const link = document.createElement('a')
    link.href = media.url
    link.download = `${project?.intake.businessName || 'ai360'}-${asset.type}.${media.kind === 'video' ? 'mp4' : 'png'}`
    if (media.kind === 'video') link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  async function changeProjectLifecycle(target: StudioProject, action: 'archive' | 'restore') {
    setError('')
    if (signedIn) {
      const id = requestId()
      try {
        const response = await fetch('/api/projects', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': id },
          body: JSON.stringify({ id: target.id, action }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          const reference = data.requestId || response.headers.get('X-Request-Id') || id
          throw new Error(`${data.error?.message || 'The project could not be updated.'} Reference: ${reference}`)
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The project could not be updated.')
        return
      }
    }

    const archivedAt = action === 'archive' ? eventTimestamp() : undefined
    setProjects((current) => setProjectArchived(current, target.id, archivedAt))
    if (action === 'archive' && project?.id === target.id) openDashboard()
  }

  async function importGuestWork() {
    if (!guestProjects.length || importBusy) return
    setImportBusy(true)
    setError('')
    try {
      for (const guestProject of guestProjects) {
        const id = requestId()
        const response = await fetch('/api/projects', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': id },
          body: JSON.stringify(guestProject),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          const reference = data.requestId || response.headers.get('X-Request-Id') || id
          throw new Error(`${data.error?.message || 'Guest projects could not be imported.'} Reference: ${reference}`)
        }
      }
      setProjects((current) => mergeProjects(current, guestProjects))
      localStorage.setItem(importAckKey, new Date().toISOString())
      setGuestProjects([])
      setSaveState('saved')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Guest projects could not be imported.')
    } finally {
      setImportBusy(false)
    }
  }

  function dismissGuestImport() {
    localStorage.setItem(importAckKey, new Date().toISOString())
    setGuestProjects([])
  }

  function beginProject(goal = '') {
    setProject(null)
    setView('intake')
    setIntake({ ...EMPTY_INTAKE, goal })
    setBrandFile(null)
    setExpandedId('')
    setEditingId('')
    setRevisionId('')
    setError('')
    requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  function openProject(next: StudioProject) {
    setProject(next)
    setView('project')
    setExpandedId(next.assets[0]?.id || '')
    setError('')
    requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  function openDashboard() {
    setProject(null)
    setView('dashboard')
    setExpandedId('')
    setError('')
    requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  if (!hydrated) {
    return <main className="studio-main" ref={mainRef}><div className="studio-loading">Opening Studio…</div></main>
  }

  if (view === 'dashboard') {
    const activeProjects = projects.filter((item) => !item.archivedAt)
    const archivedProjects = projects.filter((item) => item.archivedAt)
    const featured = activeProjects[0]
    const remaining = activeProjects.slice(featured ? 1 : 0)
    return (
      <main className="studio-main" ref={mainRef}>
        <div className="studio-dashboard">
          <header className="studio-dashboard-head">
            <div>
              <span className="studio-kicker">AI360 Studio · Project home</span>
              <h1>Your work,<br />moving forward.</h1>
              <p>Turn a business goal into a coordinated campaign, then return to improve, approve and produce each asset.</p>
            </div>
            <div className="studio-dashboard-actions">
              <span className={`studio-save-state ${saveState}`}>
                <i />
                {signedIn
                  ? saveState === 'saving' ? 'Saving securely' : saveState === 'saved' ? 'Saved securely' : saveState === 'unavailable' ? 'Saved on this device' : 'Cloud ready'
                  : 'Saved on this device'}
              </span>
              <button onClick={() => beginProject()}>New project <span>+</span></button>
            </div>
          </header>

          {error ? <div className="studio-error dashboard-error">{error}</div> : null}

          {guestProjects.length ? (
            <section className="studio-import-banner">
              <span className="import-mark">↥</span>
              <span>
                <b>Bring your guest work into this account</b>
                <small>{guestProjects.length} project{guestProjects.length === 1 ? '' : 's'} from this device can be copied into your secure workspace.</small>
              </span>
              <span className="import-actions">
                <button onClick={dismissGuestImport}>Not now</button>
                <button className="import-primary" onClick={importGuestWork} disabled={importBusy}>{importBusy ? 'Importing…' : 'Import projects'}</button>
              </span>
            </section>
          ) : null}

          {featured ? (
            <section className="studio-continue" aria-labelledby="continue-project-title">
              <div className="continue-copy">
                <span className="continue-label"><i /> Continue where you left off</span>
                <h2 id="continue-project-title">{featured.campaign.name}</h2>
                <p>{featured.intake.businessName} · {featured.campaign.objective}</p>
                <button onClick={() => openProject(featured)}>Open project <span>→</span></button>
              </div>
              <ProjectPulse project={featured} />
            </section>
          ) : (
            <section className="studio-empty-projects">
              <span className="empty-orbit"><i>AI</i></span>
              <div>
                <span className="studio-kicker">Your first outcome starts here</span>
                <h2>Bring the goal. Studio assembles the team.</h2>
                <p>One guided brief becomes a brand direction, campaign plan and eight editable assets.</p>
              </div>
              <button onClick={() => beginProject()}>Build my first project <span>→</span></button>
            </section>
          )}

          <section className="studio-transformation" aria-labelledby="studio-transformation-title">
            <div className="transformation-copy">
              <span className="studio-kicker">Before → after · A real creative transformation</span>
              <h2 id="studio-transformation-title">The brief stays visible.<br />The output becomes tangible.</h2>
              <p>Studio does not hide the leap between your idea and the finished asset. Review the thinking, change the direction and approve it before production.</p>
              <div className="transformation-brief">
                <span>Before · Business goal</span>
                <blockquote>“Launch a modern hibiscus and ginger drink for busy people in Accra.”</blockquote>
                <small>Audience · Offer · Voice · Channel</small>
              </div>
            </div>
            <figure className="transformation-output">
              <Image src="/studio-campaign-output.webp" alt="After: a polished campaign image for a hibiscus and ginger drink" fill sizes="(max-width: 820px) 100vw, 38vw" />
              <figcaption><span>After · Approved campaign direction</span><b>Warm, grounded and ready to adapt</b></figcaption>
            </figure>
          </section>

          <section className="studio-project-library">
            <div className="studio-section-head">
              <span><b>{remaining.length ? 'More projects' : 'Start with an outcome'}</b><small>{remaining.length ? 'Everything stays organized by business and campaign.' : 'Choose a route. You can change every detail in the brief.'}</small></span>
              {remaining.length ? <span>{activeProjects.length} active</span> : null}
            </div>
            {remaining.length ? (
              <div className="studio-project-grid">
                {remaining.map((item) => <ProjectCard project={item} onOpen={() => openProject(item)} key={item.id} />)}
                <button className="studio-project-new-card" onClick={() => beginProject()}>
                  <span>+</span><b>Start another project</b><small>Build a fresh campaign pack</small>
                </button>
              </div>
            ) : (
              <div className="studio-quick-grid">
                {QUICK_STARTS.map((start) => (
                  <button onClick={() => beginProject(start.goal)} key={start.title}>
                    <span>{start.mark}</span><b>{start.title}</b><small>{start.note}</small><i>↗</i>
                  </button>
                ))}
              </div>
            )}
          </section>

          {archivedProjects.length ? (
            <details className="studio-archive">
              <summary><span><b>Archived projects</b><small>Out of the way, never lost.</small></span><span>{archivedProjects.length} <i>+</i></span></summary>
              <div className="studio-project-grid">
                {archivedProjects.map((item) => (
                  <ProjectCard project={item} onOpen={() => changeProjectLifecycle(item, 'restore')} archived key={item.id} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </main>
    )
  }

  if (!project && buildingProject) {
    return (
      <main className="studio-main" ref={mainRef}>
        <div className="studio-intake build-active">
          <section className="studio-intro build-intro">
            <span className="studio-kicker">AI360 Studio · Coordinated build</span>
            <h1>A small team.<br />One complete outcome.</h1>
            <p>
              Each specialist works on one part of the launch pack, then passes
              structured output to the next. The final review keeps everything coherent.
            </p>
            <div className="studio-outcomes">
              <span><b>01</b> Understand</span>
              <span><b>02</b> Shape</span>
              <span><b>03</b> Produce</span>
              <span><b>04</b> Check</span>
            </div>
          </section>
          <StudioBuildRoom intake={intake} stage={buildStage} elapsed={buildElapsed} />
        </div>
      </main>
    )
  }

  if (!project) {
    return (
      <main className="studio-main" ref={mainRef}>
        <div className="studio-intake">
          <section className="studio-intro">
            <button className="studio-back" onClick={openDashboard}>← Project home</button>
            <span className="studio-kicker">AI360 Studio · Guided project</span>
            <h1>Build a complete<br />marketing launch pack.</h1>
            <p>
              Tell us about the business once. Studio will create the brand foundation,
              campaign direction and eight practical assets as a project you can review.
            </p>
            <div className="studio-outcomes">
              <span><b>01</b> Understand the brand</span>
              <span><b>02</b> Plan the campaign</span>
              <span><b>03</b> Produce the assets</span>
              <span><b>04</b> Review and export</span>
            </div>
          </section>

          <section className="studio-form">
            <div className="studio-form-head">
              <span><b>Project brief</b><small>{readiness} of 5 essentials ready</small></span>
              <span className="studio-readiness"><i style={{ width: `${readiness * 20}%` }} /></span>
            </div>
            <div className="studio-form-grid">
              <label>
                Business name <em>Required</em>
                <input value={intake.businessName} onChange={(event) => updateIntake('businessName', event.target.value)} placeholder="e.g. Naa's Natural Foods" />
              </label>
              <label>
                Industry
                <input value={intake.industry} onChange={(event) => updateIntake('industry', event.target.value)} placeholder="e.g. Food and hospitality" />
              </label>
              <label className="wide">
                What do you sell? <em>Required</em>
                <textarea rows={3} value={intake.offer} onChange={(event) => updateIntake('offer', event.target.value)} placeholder="Describe the product, service, price or offer." />
              </label>
              <label className="wide">
                Who should buy it? <em>Required</em>
                <textarea rows={3} value={intake.audience} onChange={(event) => updateIntake('audience', event.target.value)} placeholder="Describe the ideal customer and the problem they need solved." />
              </label>
              <label>
                Campaign goal <em>Required</em>
                <select value={intake.goal} onChange={(event) => updateIntake('goal', event.target.value)}>
                  <option value="">Choose a goal</option>
                  {GOALS.map((goal) => <option key={goal}>{goal}</option>)}
                </select>
              </label>
              <label>
                Market or location
                <input value={intake.location} onChange={(event) => updateIntake('location', event.target.value)} placeholder="e.g. Accra, Ghana" />
              </label>
            </div>

            <fieldset className="studio-channels">
              <legend>Where should the campaign run?</legend>
              <div>
                {CHANNELS.map((channel) => (
                  <button
                    type="button"
                    className={intake.channels.includes(channel) ? 'selected' : ''}
                    onClick={() => toggleChannel(channel)}
                    key={channel}
                  >
                    <span>{intake.channels.includes(channel) ? '✓' : '+'}</span>{channel}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="brand-drop">
              <input
                ref={fileRef}
                hidden
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp,text/plain,text/markdown,text/csv,application/json"
                onChange={(event) => handleBrandFile(event.target.files?.[0])}
              />
              <button type="button" onClick={() => fileRef.current?.click()}>
                <span className="brand-drop-icon">↥</span>
                <span>
                  <b>{brandFile ? brandFile.name : 'Add a brand guide or logo'}</b>
                  <small>{brandFile ? 'Ready for Studio to review' : 'Optional · PDF, image or text · Up to 4 MB'}</small>
                </span>
                <span>{brandFile ? 'Replace' : 'Browse'}</span>
              </button>
              {brandFile && <button className="brand-remove" onClick={() => setBrandFile(null)} aria-label="Remove brand file">×</button>}
            </div>

            <label className="studio-notes">
              Anything else Studio should know?
              <textarea rows={2} value={intake.notes} onChange={(event) => updateIntake('notes', event.target.value)} placeholder="Tone, deadline, promotion, competitors or words to avoid." />
            </label>

            {error && <div className="studio-error">{error}</div>}
            <button className="studio-create" onClick={createProject} disabled={busy}>
              {busy ? <><span className="studio-spinner" aria-hidden="true" /> Building your launch pack…</> : <>Create marketing launch pack <span>→</span></>}
            </button>
            <p className="studio-form-note">Studio creates drafts for your review. Nothing is published automatically.</p>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="studio-main" ref={mainRef}>
      <div className="studio-project">
        <header className="project-head">
          <div>
            <span className="studio-kicker">Marketing launch pack</span>
            <h1>{project.campaign.name}</h1>
            <p>{project.intake.businessName} · Updated {new Date(project.updatedAt).toLocaleDateString()}</p>
          </div>
          <div className="project-head-actions">
            <button onClick={openDashboard}>All projects</button>
            <button onClick={() => exportPack('pdf')} disabled={Boolean(exporting)}>{exporting === 'pdf' ? 'Creating…' : 'Export PDF'}</button>
            <button onClick={() => exportPack('docx')} disabled={Boolean(exporting)}>{exporting === 'docx' ? 'Creating…' : 'Export Word'}</button>
            <button onClick={() => changeProjectLifecycle(project, 'archive')}>Archive</button>
            <button className="project-new" onClick={() => beginProject()}>New project</button>
          </div>
        </header>

        {error && <div className="studio-error project-error">{error}</div>}

        <section className="project-summary">
          <div className="project-progress">
            <div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties}>
              <span>{progress}%</span>
            </div>
            <span><b>{approvedCount} of {project.assets.length} approved</b><small>Review each asset to complete the pack.</small></span>
          </div>
          <div><span>Objective</span><b>{project.campaign.objective}</b></div>
          <div><span>Big idea</span><b>{project.campaign.bigIdea}</b></div>
          <div><span>Primary action</span><b>{project.campaign.callToAction}</b></div>
        </section>

        <div className="project-layout">
          <aside className="brand-panel">
            <div className="panel-label">Brand foundation</div>
            <h2>{project.brand.tagline}</h2>
            <p>{project.brand.summary}</p>
            <div className="brand-property"><span>Audience</span><b>{project.brand.audience}</b></div>
            <div className="brand-property"><span>Voice</span><b>{project.brand.voice}</b></div>
            <div className="brand-traits">
              {project.brand.personality.map((trait) => <span key={trait}>{trait}</span>)}
            </div>
            <div className="brand-colors">
              {project.brand.colors.map((color) => (
                <div key={`${color.hex}-${color.role}`}>
                  <i style={{ background: normalizeHex(color.hex) }} />
                  <span><b>{color.name}</b><small>{normalizeHex(color.hex)} · {color.role}</small></span>
                </div>
              ))}
            </div>
            <div className="brand-value"><span>Value proposition</span><p>{project.brand.valueProposition}</p></div>
          </aside>

          <section className="asset-board">
            <div className="asset-board-head">
              <span><b>Production checklist</b><small>Draft, improve and approve each deliverable.</small></span>
              <span>{project.assets.length} assets</span>
            </div>
            <div className="asset-list">
              {project.assets.map((asset) => {
                const expanded = expandedId === asset.id
                const media = generatedMedia[asset.id]
                const canRender = asset.type === 'logo' || asset.type === 'social' || asset.type === 'flyer' || asset.type === 'video'
                return (
                  <article className={`asset-card${expanded ? ' expanded' : ''}${asset.status === 'approved' ? ' approved' : ''}`} key={asset.id}>
                    <button className="asset-summary" onClick={() => setExpandedId(expanded ? '' : asset.id)}>
                      <span className="asset-icon">{ASSET_ICONS[asset.type] || 'Aa'}</span>
                      <span><b>{asset.title}</b><small>{asset.channel} · {asset.purpose}</small></span>
                      <span className="asset-status">{asset.status === 'approved' ? '✓ Approved' : 'Draft'}</span>
                      <span className="asset-chevron">{expanded ? '−' : '+'}</span>
                    </button>
                    {expanded && (
                      <div className="asset-content">
                        {editingId === asset.id ? (
                          <textarea
                            rows={14}
                            value={asset.content}
                            onChange={(event) => updateAsset(asset.id, { content: event.target.value, status: 'draft' })}
                          />
                        ) : (
                          <ResponseContent content={asset.content} />
                        )}
                        {media ? (
                          <div className={`generated-media ${media.status}`}>
                            {media.kind === 'image' && media.url ? (
                              // Generated data URLs cannot use the Next.js image optimizer.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={media.url} alt={`Generated ${asset.title}`} />
                            ) : media.kind === 'video' && media.status === 'completed' && media.url ? (
                              <video src={media.url} controls playsInline />
                            ) : (
                              <div className="media-progress">
                                <span className={media.status === 'failed' ? '' : 'studio-spinner'} aria-hidden="true">{media.status === 'failed' ? '!' : ''}</span>
                                <span>
                                  <b>{media.status === 'failed' ? 'Production stopped' : media.kind === 'video' ? 'Producing your video' : 'Designing your visual'}</b>
                                  <small>{media.error || (media.kind === 'video' ? 'This can take a few minutes. You can keep working while Studio checks progress.' : 'Creating one downloadable draft from the approved direction.')}</small>
                                </span>
                              </div>
                            )}
                            {media.status === 'completed' && media.url ? (
                              <div className="media-meta">
                                <span>Download now. Generated files are not saved to this browser automatically.{typeof media.costUsd === 'number' ? ` Actual cost: $${media.costUsd.toFixed(3)}.` : ''}</span>
                                <button onClick={() => downloadGenerated(asset, media)}>Download {media.kind === 'video' ? 'MP4' : 'PNG'}</button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {revisionId === asset.id && (
                          <div className="asset-revision">
                            <label>
                              What should change?
                              <textarea
                                rows={3}
                                value={revisionInstruction}
                                onChange={(event) => setRevisionInstruction(event.target.value)}
                                placeholder="For example: make it shorter, more premium and focused on young professionals."
                              />
                            </label>
                            <div>
                              <button onClick={() => { setRevisionId(''); setRevisionInstruction('') }}>Cancel</button>
                              <button className="dark" onClick={() => regenerateAsset(asset)} disabled={busy}>
                                {busy ? 'Improving…' : 'Improve asset'}
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="asset-actions">
                          <button onClick={() => navigator.clipboard.writeText(asset.content)}>Copy</button>
                          <button onClick={() => shareAsset(asset)}>Share</button>
                          <button onClick={() => setEditingId(editingId === asset.id ? '' : asset.id)}>
                            {editingId === asset.id ? 'Finish editing' : 'Edit'}
                          </button>
                          <button onClick={() => { setRevisionId(asset.id); setRevisionInstruction('') }}>Improve with AI</button>
                          <button
                            className={asset.status === 'approved' ? 'approved' : 'approve'}
                            disabled={media?.status === 'generating' || media?.status === 'pending' || media?.status === 'in_progress'}
                            onClick={() => updateAsset(asset.id, { status: asset.status === 'approved' ? 'draft' : 'approved' })}
                          >
                            {asset.status === 'approved' ? '✓ Approved' : 'Approve asset'}
                          </button>
                          {canRender && asset.status === 'approved' ? (
                            <button
                              className="execute"
                              onClick={() => prepareExecution(asset)}
                              disabled={mediaBusy === asset.id || media?.status === 'generating' || media?.status === 'pending' || media?.status === 'in_progress'}
                            >
                              {mediaBusy === asset.id
                                ? 'Checking…'
                                : media?.status === 'completed'
                                  ? `Create another ${asset.type === 'video' ? 'video' : 'design'}`
                                  : asset.type === 'video'
                                    ? 'Produce video'
                                    : 'Create design'}
                            </button>
                          ) : null}
                        </div>
                        {canRender && asset.status !== 'approved' ? (
                          <div className="asset-production-hint">
                            <span>Locked</span>
                            <span>
                              <b>Production unlocks after approval</b>
                              <small>Review this direction, then approve it to create the downloadable {asset.type === 'video' ? 'video' : 'design'}.</small>
                            </span>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>

            <section className="execution-next live">
              <span className="execution-mark">ON</span>
              <span>
                <b>Studio production is live</b>
                <small>Approve an asset, then create its design or video. Approved copy can be shared from any device.</small>
              </span>
              <span>Ready</span>
            </section>
            {project.sources?.length ? (
              <section className="studio-sources">
                <div>
                  <span className="execution-mark">↗</span>
                  <span><b>Live research used</b><small>Current information was checked while building this campaign.</small></span>
                </div>
                <div>
                  {project.sources.map((source, index) => (
                    <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <span>{source.title}</span>
                      <span>↗</span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </section>
        </div>
      </div>
      {activeAsset ? <span className="sr-only">Selected asset: {activeAsset.title}</span> : null}
      {executionApproval ? (
        <div className="approval-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setExecutionApproval(null)
        }}>
          <section className="approval-dialog studio-execution-dialog" role="dialog" aria-modal="true" aria-labelledby="execution-title">
            <span className="studio-kicker">Final approval</span>
            <h2 id="execution-title">Produce {executionApproval.asset.title}?</h2>
            <p>
              Studio will send the approved creative direction and brand details to the media provider.
              This action uses your OpenRouter credits.
            </p>
            <div className="execution-quote">
              <span><b>{executionApproval.estimateLabel}</b><small>Nothing is posted or shared automatically.</small></span>
              <strong>
                {executionApproval.kind === 'video'
                  ? `$${executionApproval.estimatedCostUsd.toFixed(2)}`
                  : `up to $${executionApproval.estimatedCostUsd.toFixed(2)}`}
              </strong>
            </div>
            <div className="approval-foot">
              <button onClick={() => setExecutionApproval(null)}>Cancel</button>
              <button className="approve-action" onClick={confirmExecution}>Approve and produce</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

function projectCompletion(project: StudioProject) {
  const approved = project.assets.filter((asset) => asset.status === 'approved').length
  return {
    approved,
    total: project.assets.length,
    percent: project.assets.length ? Math.round((approved / project.assets.length) * 100) : 0,
  }
}

function ProjectPulse({ project }: { project: StudioProject }) {
  const completion = projectCompletion(project)
  const milestones = [
    { label: 'Brief', complete: true },
    { label: 'Brand', complete: true },
    { label: 'Campaign', complete: true },
    { label: 'Assets', complete: completion.percent === 100, active: completion.percent < 100 },
  ]
  return (
    <div className="project-pulse">
      <div className="pulse-score">
        <span>{completion.percent}%</span>
        <small>{completion.approved} of {completion.total} approved</small>
      </div>
      <div className="pulse-track" aria-label={`${completion.percent}% of assets approved`}>
        {milestones.map((milestone, index) => (
          <span className={`${milestone.complete ? 'complete' : ''}${milestone.active ? ' active' : ''}`} key={milestone.label}>
            <i>{milestone.complete ? '✓' : String(index + 1).padStart(2, '0')}</i>
            <b>{milestone.label}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

function ProjectCard({ project, onOpen, archived = false }: { project: StudioProject; onOpen: () => void; archived?: boolean }) {
  const completion = projectCompletion(project)
  return (
    <button className={`studio-project-card${archived ? ' archived' : ''}`} onClick={onOpen}>
      <span className="project-card-top"><i>{project.intake.businessName.slice(0, 2).toUpperCase()}</i><em>{archived ? 'Archived' : completion.percent === 100 ? 'Complete' : 'In progress'}</em></span>
      <span className="project-card-copy"><b>{project.campaign.name}</b><small>{project.intake.businessName}</small></span>
      <span className="project-card-progress"><i style={{ width: `${completion.percent}%` }} /></span>
      <span className="project-card-foot"><small>{completion.approved} of {completion.total} approved</small><em>{archived ? 'Restore ↥' : `${new Date(project.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ↗`}</em></span>
    </button>
  )
}

function readDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
