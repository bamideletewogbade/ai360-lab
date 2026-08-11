'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ResponseContent } from '@/components/ResponseContent'
import { ProjectStageNavigator } from '@/components/ProjectStageNavigator'
import { mergeProjects, setProjectArchived, sortProjects, upsertProject } from '@/lib/studio-projects'
import { PACKS, findPack, packCredits, type Pack, type PackId, type SpecialistId } from '@/lib/studio/packs'
import {
  addAssetVersion,
  createPackProject,
  initialProjectSpecialists,
  type Intake,
  type ProjectSpecialist,
  type StudioAsset,
  type StudioProject,
} from '@/lib/studio-project-model'
import type { PackEvent } from '@/lib/studio/coordinator'
import { scopedStorageKey } from '@/lib/workspace'
import { newerDraft, studioDraftSchema, type StudioDraft, type StudioBriefTurn } from '@/lib/studio-draft'
import { currentProjectStage, type ProjectStage } from '@/lib/studio-stages'
import {
  defaultMediaIntent,
  MEDIA_CHANNELS,
  mediaIntentSummary,
  type MediaChannel,
  type MediaIntent,
} from '@/lib/media/intent'

type GeneratedMedia = {
  kind: 'image' | 'video'
  status: 'generating' | 'pending' | 'in_progress' | 'completed' | 'failed'
  url?: string
  token?: string
  jobId?: string
  assetId?: string
  costUsd?: number
  model?: string
  error?: string
}

type ExecutionApproval = {
  asset: StudioAsset
  kind: 'logo' | 'social' | 'flyer' | 'video'
  estimatedCostUsd: number
  estimatedCredits: number
  estimateLabel: string
  intent: MediaIntent
  quoteValid: boolean
}

type StudioView = 'dashboard' | 'kickoff' | 'project'
type SaveState = 'local' | 'saving' | 'saved' | 'unavailable'
const STORAGE_KEY = 'ai360-studio-projects-v2'
const DRAFT_STORAGE_KEY = 'ai360-studio-draft-v1'
const LEGACY_STORAGE_KEY = 'ai360-studio-project-v1'
const VIEW_KEY = 'ai360-studio-view-v2'
const IMPORT_ACK_KEY = 'ai360-studio-guest-import-v1'
const CHANNELS = ['WhatsApp', 'Instagram', 'Facebook', 'TikTok', 'SMS', 'Email', 'Google Business', 'Print']
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
  location: '',
  channels: [],
  notes: '',
}

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
    `## ${project.pack ? 'Project overview' : 'Campaign overview'}`,
    '',
    `**Objective:** ${project.campaign.objective}`,
    '',
    `**${project.pack ? 'Outcome' : 'Big idea'}:** ${project.campaign.bigIdea}`,
    '',
    `**Call to action:** ${project.campaign.callToAction}`,
    '',
    `**Channels:** ${project.campaign.channels.join(', ')}`,
    '',
    `**Progress:** ${approved} of ${project.assets.length} deliverables approved`,
    '',
    ...(!project.pack ? [
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
    ] : []),
    `## ${project.pack ? 'Promised deliverables' : 'Success measures'}`,
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
  pack,
  specialists,
  sectionsCount,
  reviewNote,
  complete,
  elapsed,
}: {
  intake: Intake
  pack: Pack
  specialists: ProjectSpecialist[]
  sectionsCount: number
  reviewNote: string
  complete: boolean
  elapsed: number
}) {
  const finished = specialists.filter((specialist) => specialist.status === 'complete' || specialist.status === 'failed').length
  const activeSpecialist = specialists.find((specialist) => specialist.status === 'active')
  const progress = complete ? 100 : Math.max(8, Math.round((finished / Math.max(1, specialists.length)) * 100))
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
          <strong>{pack.mark}</strong>
        </div>
        <span>
          <span className="studio-kicker">{complete ? 'Build complete' : `${pack.name} · Live progress`}</span>
          <h2>{complete ? 'Your project is ready to review.' : 'The work is moving through its stages.'}</h2>
          <p>{complete ? 'Opening the completed project.' : reviewNote || activeSpecialist?.working || 'Preparing the specialist team'}.</p>
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
        {specialists.map((specialist) => {
          const status = complete && specialist.status !== 'failed' ? 'complete' : specialist.status === 'pending' ? 'queued' : specialist.status
          return (
            <div className={`relay-step ${status}`} key={specialist.id}>
              <span className="relay-line" aria-hidden="true"><i /></span>
              <span className="relay-avatar">{status === 'complete' ? '✓' : String(packSpecialistNumber(pack, specialist.id)).padStart(2, '0')}</span>
              <span className="relay-copy">
                <span><b>{specialist.label}</b><em>{status === 'active' ? 'Working' : status === 'complete' ? 'Ready' : status === 'failed' ? 'Needs attention' : 'Waiting'}</em></span>
                <small>{specialist.working}</small>
              </span>
              <span className="relay-handoff">
                {status === 'complete' ? <><i>→</i>deliverable ready</> : status === 'failed' ? specialist.detail || 'not produced' : status === 'active' ? <span className="relay-dots"><i /><i /><i /></span> : 'queued'}
              </span>
            </div>
          )
        })}
      </div>

      <footer className="build-room-foot">
        <span className="studio-spinner" aria-hidden="true" />
        <span>
          <b>{complete ? `${sectionsCount} deliverables ready` : activeSpecialist ? `${activeSpecialist.label} is working` : 'Preparing the project'}</b>
          <small>{complete ? 'One moment while Create prepares your workspace.' : `Elapsed ${elapsed}s. Progress shown here comes from the real build.`}</small>
        </span>
      </footer>
    </section>
  )
}

function packSpecialistNumber(pack: Pack, id: SpecialistId) {
  return pack.stages.flatMap((stage) => stage.specialists).indexOf(id) + 1
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
  const [mediaQuoteBusy, setMediaQuoteBusy] = useState(false)
  const [buildingProject, setBuildingProject] = useState(false)
  const [buildComplete, setBuildComplete] = useState(false)
  const [buildElapsed, setBuildElapsed] = useState(0)
  const [selectedPackId, setSelectedPackId] = useState<PackId>('launch')
  const [buildSpecialists, setBuildSpecialists] = useState<ProjectSpecialist[]>(initialProjectSpecialists(PACKS[0]))
  const [buildSectionsCount, setBuildSectionsCount] = useState(0)
  const [buildReviewNote, setBuildReviewNote] = useState('')
  const [showPackPicker, setShowPackPicker] = useState(false)
  const [briefInput, setBriefInput] = useState('')
  const [briefTurns, setBriefTurns] = useState<StudioBriefTurn[]>([])
  const [briefBusy, setBriefBusy] = useState(false)
  const [activeProjectStage, setActiveProjectStage] = useState<ProjectStage>('review')
  const [draftId, setDraftId] = useState('')
  const [draftCloudLoaded, setDraftCloudLoaded] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const pollVideoRef = useRef<(assetId: string, token: string, jobId?: string) => Promise<void>>(async () => undefined)
  const mediaQuoteSequenceRef = useRef(0)
  const loadedWorkspaceRef = useRef('')
  const projectStorageKey = scopedStorageKey(STORAGE_KEY, workspaceScope)
  const viewStorageKey = scopedStorageKey(VIEW_KEY, workspaceScope)
  const importAckKey = scopedStorageKey(IMPORT_ACK_KEY, workspaceScope)
  const draftStorageKey = scopedStorageKey(DRAFT_STORAGE_KEY, workspaceScope)

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
        const parsedDraft = studioDraftSchema.safeParse(JSON.parse(localStorage.getItem(draftStorageKey) || 'null'))
        const localDraft = parsedDraft.success ? parsedDraft.data : null
        if (initialBrief.trim()) {
          setDraftId(requestId())
          setBriefInput(initialBrief.trim())
          setView('kickoff')
          setProject(null)
        } else if (savedView === 'project' && loaded[0]) {
          setProject(loaded[0])
          setView('project')
        } else {
          setProject(null)
          if (localDraft) {
            setDraftId(localDraft.id)
            setIntake(localDraft.intake)
            setSelectedPackId(localDraft.packId)
            setBriefTurns(localDraft.turns)
            setBriefInput(localDraft.unsentText)
          }
          setView('dashboard')
        }
      } catch {
        // A damaged local project should not prevent Studio from opening.
        setProjects([])
        setProject(null)
        setView(initialBrief.trim() ? 'kickoff' : 'dashboard')
      }
      loadedWorkspaceRef.current = workspaceScope
      setCloudReady(false)
      setDraftCloudLoaded(!signedIn || Boolean(initialBrief.trim()))
      setSaveState(signedIn ? 'saving' : 'local')
      setHydrated(true)
    })
    return () => {
      mounted = false
    }
  }, [draftStorageKey, importAckKey, initialBrief, projectStorageKey, signedIn, viewStorageKey, workspaceScope])

  useEffect(() => {
    if (!hydrated || !draftId || view !== 'kickoff' || loadedWorkspaceRef.current !== workspaceScope) return
    if (signedIn && !draftCloudLoaded) return
    const draft: StudioDraft = {
      id: draftId,
      updatedAt: Date.now(),
      packId: selectedPackId,
      intake,
      turns: briefTurns,
      unsentText: briefInput,
    }
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(draftStorageKey, JSON.stringify(draft)) } catch { /* Local storage can be unavailable. */ }
      if (signedIn) {
        void fetch('/api/project-draft', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId() },
          body: JSON.stringify(draft),
        })
      }
    }, 450)
    return () => window.clearTimeout(timer)
  }, [briefInput, briefTurns, draftCloudLoaded, draftId, draftStorageKey, hydrated, intake, selectedPackId, signedIn, view, workspaceScope])

  useEffect(() => {
    if (!hydrated || !signedIn || initialBrief.trim()) return
    let cancelled = false
    fetch('/api/project-draft')
      .then(async (response) => response.ok ? response.json() : { draft: null })
      .then(({ draft }) => {
        if (cancelled) return
        const cloud = studioDraftSchema.safeParse(draft)
        const local = studioDraftSchema.safeParse(JSON.parse(localStorage.getItem(draftStorageKey) || 'null'))
        const chosen = newerDraft(local.success ? local.data : null, cloud.success ? cloud.data : null)
        if (chosen) {
          setDraftId(chosen.id)
          setIntake(chosen.intake)
          setSelectedPackId(chosen.packId)
          setBriefTurns(chosen.turns)
          setBriefInput(chosen.unsentText)
          setProject(null)
          setView('kickoff')
        }
        setDraftCloudLoaded(true)
      })
      .catch(() => { if (!cancelled) setDraftCloudLoaded(true) })
    return () => { cancelled = true }
  }, [draftStorageKey, hydrated, initialBrief, signedIn, workspaceScope])

  function clearDraft() {
    const completedDraftId = draftId
    setDraftId('')
    setBriefTurns([])
    setBriefInput('')
    try { localStorage.removeItem(draftStorageKey) } catch { /* Local storage can be unavailable. */ }
    if (signedIn && completedDraftId) {
      void fetch(`/api/project-draft?id=${encodeURIComponent(completedDraftId)}`, {
        method: 'DELETE',
        headers: { 'X-Request-Id': requestId() },
      })
    }
  }

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
    if (!project || !signedIn) return
    let cancelled = false
    fetch(`/api/studio/media?projectId=${encodeURIComponent(project.id)}`)
      .then(async (response) => response.ok ? response.json() : { jobs: [] })
      .then(({ jobs }) => {
        if (cancelled || !Array.isArray(jobs)) return
        const restored: Record<string, GeneratedMedia> = {}
        for (const job of jobs) {
          if (!job?.projectAssetId || restored[job.projectAssetId]) continue
          const status = job.status === 'running' || job.status === 'submitted' || job.status === 'queued'
            ? job.status === 'running' ? 'in_progress' : 'pending'
            : job.status
          restored[job.projectAssetId] = {
            kind: job.mediaType,
            status,
            jobId: job.id,
            assetId: job.outputAssetId || undefined,
            url: job.outputAssetId ? `/api/studio/media?assetId=${encodeURIComponent(job.outputAssetId)}` : undefined,
            costUsd: job.actualCostUsd ?? job.quotedCostUsd ?? undefined,
            model: job.model || undefined,
            error: job.errorMessage || undefined,
          }
          if ((status === 'pending' || status === 'in_progress') && job.mediaType === 'video') {
            window.setTimeout(() => void pollVideoRef.current(job.projectAssetId, '', job.id), 1_000)
          }
        }
        setGeneratedMedia(restored)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  // pollVideo is deliberately reached only after a persisted job is restored.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, signedIn])

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
    }
    update()
    const timer = window.setInterval(update, 1_000)
    return () => window.clearInterval(timer)
  }, [buildingProject, buildComplete])

  const selectedPack = findPack(selectedPackId) ?? PACKS[0]
  const approvedCount = project?.assets.filter((asset) => asset.status === 'approved').length ?? 0
  const progress = project?.assets.length ? Math.round((approvedCount / project.assets.length) * 100) : 0
  const activeAsset = project?.assets.find((asset) => asset.id === expandedId)
  const approvedAssets = project?.assets.filter((asset) => asset.status === 'approved') ?? []

  const readiness = useMemo(() => {
    const effectiveName = intake.businessName || intake.offer || intake.goal
    const checks = [
      Boolean(effectiveName),
      Boolean(intake.offer || intake.goal),
      Boolean(intake.audience || intake.goal),
      Boolean(intake.goal || intake.offer),
      intake.channels.length > 0 || Boolean(intake.goal),
    ]
    return checks.filter(Boolean).length
  }, [intake])

  useEffect(() => {
    if (view !== 'project' || !project || !mainRef.current) return
    const root = mainRef.current
    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-project-stage]'))
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0]
      const stage = visible?.target.getAttribute('data-project-stage') as ProjectStage | null
      if (stage) setActiveProjectStage(stage)
    }, { root, rootMargin: '-118px 0px -58% 0px', threshold: [0.05, 0.25, 0.5] })
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [project, view])

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

  async function createProject() {
    setError('')
    const effectiveGoal = intake.goal || intake.offer || briefInput
    if (!effectiveGoal.trim()) {
      setError('Describe your project goal or purpose to proceed.')
      return
    }
    const resolvedName = intake.businessName.trim() || intake.offer.trim() || effectiveGoal.trim().slice(0, 32) || 'Project Workspace'
    if (!intake.businessName) {
      updateIntake('businessName', resolvedName)
    }
    if (!intake.channels.length) {
      updateIntake('channels', ['Web', 'Digital'])
    }
    setBusy(true)
    setBuildingProject(true)
    setBuildComplete(false)
    setBuildElapsed(0)
    setBuildSectionsCount(0)
    setBuildReviewNote('')
    const startedAt = eventTimestamp()
    let specialistState = initialProjectSpecialists(selectedPack)
    setBuildSpecialists(specialistState)
    const id = requestId()
    try {
      const requestIntake = intake
      const response = await fetch('/api/studio/pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': id, 'Idempotency-Key': id },
        body: JSON.stringify({ packId: selectedPack.id, intake: requestIntake }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        const reference = data.requestId || response.headers.get('X-Request-Id') || id
        throw new Error(`${data.error || 'Create could not start this project.'} Reference: ${reference}`)
      }

      const outcome: {
        result?: Extract<PackEvent, { type: 'result' }>
        review?: Extract<PackEvent, { type: 'review' }>
      } = {}
      await readPackStream(response, (event) => {
        if (event.type === 'pack') {
          specialistState = event.specialists.map((specialist) => ({ ...specialist, status: 'pending' }))
          setBuildSpecialists(specialistState)
        } else if (event.type === 'specialist') {
          specialistState = specialistState.map((specialist) => specialist.id === event.id
            ? { ...specialist, status: event.status, detail: event.detail }
            : specialist)
          setBuildSpecialists(specialistState)
        } else if (event.type === 'section') {
          setBuildSectionsCount((count) => count + 1)
        } else if (event.type === 'review') {
          outcome.review = event
          setBuildReviewNote(event.detail)
        } else if (event.type === 'result') {
          outcome.result = event
          setBuildSectionsCount(event.sections.length)
        } else if (event.type === 'error') {
          throw new Error(event.message)
        }
      })
      const result = outcome.result
      if (!result) throw new Error('Create finished without returning any deliverables.')

      setBuildComplete(true)
      const completedAt = eventTimestamp()
      const next = createPackProject({
        id: requestId(),
        intake,
        pack: selectedPack,
        sections: result.sections,
        sources: result.sources,
        specialists: specialistState,
        startedAt,
        completedAt,
        evaluations: outcome.review?.evaluations,
      })
      await new Promise((resolve) => window.setTimeout(resolve, 500))
      clearDraft()
      setProject(next)
      setView('project')
      setExpandedId(next.assets[0]?.id || '')
      requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
    } catch (cause) {
      console.error('[AI360] Create project failed', cause)
      setError(cause instanceof Error ? cause.message : 'Create could not complete this project.')
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
      const revised = data.result as Partial<StudioAsset> & { content?: string }
      const nextAsset = addAssetVersion(
        { ...asset, ...revised, id: asset.id },
        revised.content || asset.content,
        'ai_revision',
        eventTimestamp(),
      )
      updateAsset(asset.id, nextAsset)
      setRevisionId('')
      setRevisionInstruction('')
    } catch (cause) {
      console.error('[AI360] Studio revision failed', cause)
      setError(cause instanceof Error ? cause.message : 'Studio could not improve this asset.')
    } finally {
      setBusy(false)
    }
  }

  function finishManualEdit(asset: StudioAsset) {
    updateAsset(asset.id, addAssetVersion(asset, asset.content, 'manual_edit', eventTimestamp()))
    setEditingId('')
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
          title: `${project.intake.businessName} ${project.pack?.name || 'Marketing Launch Pack'}`,
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
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `${project.pack?.id || 'marketing-launch-pack'}.${format}`
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
    const intent = defaultMediaIntent({
      mediaType: asset.type === 'video' ? 'video' : 'image',
      purpose: asset.purpose || asset.title,
      assetType: asset.type,
      projectChannels: project?.campaign.channels,
    })
    if (asset.type === 'video') {
      setMediaBusy(asset.id)
      const id = requestId()
      try {
        const response = await fetch('/api/studio/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': id },
          body: JSON.stringify({ action: 'quote', intent }),
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
          estimatedCredits: data.credits || 16,
          estimateLabel: mediaIntentSummary(intent),
          intent,
          quoteValid: true,
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
        estimatedCredits: 4,
        estimateLabel: mediaIntentSummary(intent),
        intent,
        quoteValid: true,
      })
    }
  }

  async function updateExecutionIntent(patch: Partial<MediaIntent>) {
    if (!executionApproval) return
    const current = executionApproval
    const nextIntent = { ...current.intent, ...patch }
    setExecutionApproval({ ...current, intent: nextIntent, estimateLabel: mediaIntentSummary(nextIntent), quoteValid: current.kind !== 'video' })
    if (current.kind !== 'video') return
    const sequence = ++mediaQuoteSequenceRef.current
    setMediaQuoteBusy(true)
    const id = requestId()
    try {
      const response = await fetch('/api/studio/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': id },
        body: JSON.stringify({ action: 'quote', intent: nextIntent }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || typeof data.costUsd !== 'number') throw new Error(data.error || 'This combination is unavailable.')
      setExecutionApproval((latest) => sequence === mediaQuoteSequenceRef.current && latest && latest.asset.id === current.asset.id && latest.intent === nextIntent
        ? { ...latest, estimatedCostUsd: data.costUsd, estimatedCredits: data.credits || latest.estimatedCredits, quoteValid: true }
        : latest)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This video combination is unavailable.')
    } finally {
      if (sequence === mediaQuoteSequenceRef.current) setMediaQuoteBusy(false)
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
            projectId: project.id,
            intent: approval.intent,
            businessName: project.intake.businessName,
            location: project.intake.location,
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
            jobId: data.jobId,
            costUsd: data.estimatedCostUsd,
            model: data.model,
          },
        }))
        window.setTimeout(() => pollVideo(approval.asset.id, data.token, data.jobId), 30_000)
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
            projectId: project.id,
            intent: approval.intent,
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
            jobId: data.jobId,
            assetId: data.assetId,
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

  async function pollVideo(assetId: string, token: string, jobId?: string) {
    const id = requestId()
    try {
      const response = await fetch('/api/studio/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': id },
        body: JSON.stringify({ action: 'status', token, jobId }),
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
          jobId: data.jobId || jobId,
          assetId: data.assetId,
          url: data.downloadUrl,
          costUsd: data.costUsd ?? current[assetId]?.costUsd,
          error: data.error,
        },
      }))
      if (status === 'pending' || status === 'in_progress') {
        window.setTimeout(() => pollVideo(assetId, token, data.jobId || jobId), 30_000)
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

  useEffect(() => {
    pollVideoRef.current = pollVideo
  })

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

  function beginProject(packId: PackId = 'launch') {
    const pack = findPack(packId) ?? PACKS[0]
    setProject(null)
    setView('kickoff')
    setSelectedPackId(pack.id)
    setDraftId(requestId())
    setIntake(EMPTY_INTAKE)
    setBriefInput('')
    setBriefTurns([])
    setBuildSpecialists(initialProjectSpecialists(pack))
    setBuildSectionsCount(0)
    setBuildReviewNote('')
    setExpandedId('')
    setEditingId('')
    setRevisionId('')
    setError('')
    requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  async function continueBrief() {
    const message = briefInput.trim()
    if (!message || briefBusy) return
    const userTurn: StudioBriefTurn = { id: requestId(), role: 'user', content: message }
    setBriefTurns((current) => [...current, userTurn])
    setBriefInput('')
    setBriefBusy(true)
    setError('')
    try {
      const response = await fetch('/api/studio/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId() },
        body: JSON.stringify({ message, intake }),
      })
      const data = await response.json().catch(() => ({})) as {
        error?: string
        reply?: string
        packId?: PackId
        intake?: Intake
      }
      if (!response.ok || !data.reply || !data.intake || !data.packId) {
        throw new Error(data.error || 'AI360 could not update the brief.')
      }
      setSelectedPackId(data.packId)
      setIntake({ ...EMPTY_INTAKE, ...data.intake, channels: data.intake.channels || [] })
      setBriefTurns((current) => [...current, { id: requestId(), role: 'assistant', content: data.reply! }])
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : 'AI360 could not update the brief.'
      setError(messageText)
      setBriefTurns((current) => [...current, { id: requestId(), role: 'assistant', content: messageText }])
    } finally {
      setBriefBusy(false)
    }
  }

  function togglePackPicker() {
    setShowPackPicker((prev) => {
      const next = !prev
      if (next) {
        requestAnimationFrame(() => mainRef.current?.querySelector('.studio-pack-picker')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
      }
      return next
    })
  }

  function openProject(next: StudioProject) {
    setProject(next)
    setView('project')
    setExpandedId(next.assets[0]?.id || '')
    setActiveProjectStage(currentProjectStage({
      approved: next.assets.filter((asset) => asset.status === 'approved').length,
      total: next.assets.length,
    }))
    setError('')
    requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  function goToProjectStage(stage: ProjectStage) {
    setActiveProjectStage(stage)
    const section = mainRef.current?.querySelector<HTMLElement>(`#project-stage-${stage}`)
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
              <span className="studio-kicker">Projects</span>
              <h1>Turn a goal into<br />finished work.</h1>
              <p>Describe what you want to achieve. AI360 brings in the right specialists and keeps the brief, decisions and deliverables together, in one place.</p>
            </div>
            <div className="studio-dashboard-actions">
              <span className={`studio-save-state ${saveState}`}>
                <i />
                {signedIn
                  ? saveState === 'saving' ? 'Saving securely' : saveState === 'saved' ? 'Saved securely' : saveState === 'unavailable' ? 'Saved on this device' : 'Cloud ready'
                  : 'Saved on this device'}
              </span>
            </div>
          </header>

          <section className="studio-composer-box" aria-labelledby="project-composer-title">
            <form onSubmit={(event) => { event.preventDefault(); if (briefInput.trim()) { setView('kickoff'); void continueBrief() } }}>
              <div className="composer-card">
                <div className="composer-header">
                  <span className="composer-badge">Describe your goal</span>
                  <span className="composer-hint">Shift + Enter for new lines</span>
                </div>
                <textarea
                  className="composer-textarea"
                  rows={3}
                  value={briefInput}
                  onChange={(event) => setBriefInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      if (briefInput.trim()) {
                        setView('kickoff')
                        void continueBrief()
                      }
                    }
                  }}
                  placeholder="Describe what you want to build, launch, or improve in your own words... (e.g. Help me launch a catering business for tech offices in Accra)"
                  aria-label="Describe your project goal"
                />
                <div className="composer-footer">
                  <div className="composer-tools">
                    <span className="tool-pill"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg> Natural Language Briefing</span>
                    <span className="tool-pill"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Multi-Specialist Agents</span>
                  </div>
                  <button type="submit" className="composer-submit-btn" disabled={!briefInput.trim()}>
                    <span>Start project</span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                  </button>
                </div>
              </div>
            </form>
          </section>

          <p className="preset-lead">Or start from a template</p>
          <div className="project-preset-grid">
            <button
              type="button"
              className="preset-card"
              onClick={() => { setBriefInput('Help me build a complete startup launch package including business model, brand brief, and marketing plan for: '); setView('kickoff'); void continueBrief() }}
            >
              <div className="preset-icon">🚀</div>
              <div className="preset-info">
                <b>Startup Launch Pack</b>
                <small>Business model, brand strategy & GTM plan</small>
              </div>
            </button>

            <button
              type="button"
              className="preset-card"
              onClick={() => { setBriefInput('Create a digital marketing and growth campaign for: '); setView('kickoff'); void continueBrief() }}
            >
              <div className="preset-icon">📈</div>
              <div className="preset-info">
                <b>Growth & Marketing</b>
                <small>Messaging, social ads & landing page copy</small>
              </div>
            </button>

            <button
              type="button"
              className="preset-card"
              onClick={() => { setBriefInput('Define the brand identity, positioning, voice, and visual direction for: '); setView('kickoff'); void continueBrief() }}
            >
              <div className="preset-icon">🎨</div>
              <div className="preset-info">
                <b>Brand Identity</b>
                <small>Brand positioning, tone of voice & taglines</small>
              </div>
            </button>

            <button
              type="button"
              className="preset-card"
              onClick={() => { setBriefInput('Draft an executive summary and financial proposal for: '); setView('kickoff'); void continueBrief() }}
            >
              <div className="preset-icon">📄</div>
              <div className="preset-info">
                <b>Executive Strategy</b>
                <small>Investor proposal & unit economics breakdown</small>
              </div>
            </button>
          </div>

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

          <section className="studio-project-library studio-project-library-primary">
            <div className="studio-section-head">
              <span><b>Your projects</b><small>Each keeps its brief, decisions and deliverables together.</small></span>
              {activeProjects.length ? <span>{activeProjects.length} active</span> : null}
            </div>
            {featured || remaining.length ? (
              <div className="studio-project-grid">
                {featured ? <ProjectCard project={featured} onOpen={() => openProject(featured)} key={featured.id} /> : null}
                {remaining.map((item) => <ProjectCard project={item} onOpen={() => openProject(item)} key={item.id} />)}
              </div>
            ) : (
              <div className="studio-projects-empty">
                <span className="empty-icon">📁</span>
                <div>
                  <b>No projects yet</b>
                  <small>Describe a goal above, or start from a template, and your first project appears here.</small>
                </div>
              </div>
            )}
          </section>

          {showPackPicker ? (
            <section className="studio-project-library studio-pack-picker">
              <div className="studio-section-head">
                <span><b>Choose the outcome you need</b><small>Each route uses only the specialists and credits needed for that job.</small></span>
                <button className="pack-picker-close" onClick={() => setShowPackPicker(false)}>Close</button>
              </div>
              <PackPicker onChoose={beginProject} />
            </section>
          ) : null}

          <button type="button" className="studio-example-toggle" onClick={togglePackPicker}>
            {showPackPicker ? 'Hide example outcomes ↑' : 'Need inspiration? Browse example outcomes ↓'}
          </button>

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
        <div className="studio-stage-shell">
          <ProjectStageNavigator phase="building" activeStage="build" />
        </div>
        <div className="studio-intake build-active">
          <section className="studio-intro build-intro">
            <span className="studio-kicker">Create · {selectedPack.name}</span>
            <h1>The right team.<br />One complete outcome.</h1>
            <p>
              Each specialist works on one part of the project. Later stages receive
              the work already completed, so the result stays coherent.
            </p>
            <div className="studio-outcomes">
              {selectedPack.stages.map((stage, index) => (
                <span key={`${selectedPack.id}-${index}`}><b>{String(index + 1).padStart(2, '0')}</b>{stage.specialists.length > 1 ? 'Build together' : 'Build next part'}</span>
              ))}
            </div>
          </section>
          <StudioBuildRoom
            intake={intake}
            pack={selectedPack}
            specialists={buildSpecialists}
            sectionsCount={buildSectionsCount}
            reviewNote={buildReviewNote}
            complete={buildComplete}
            elapsed={buildElapsed}
          />
        </div>
      </main>
    )
  }

  if (!project) {
    return (
      <main className="studio-main" ref={mainRef}>
        <div className="project-kickoff">
          <header className="project-kickoff-head">
            <button className="studio-back" onClick={openDashboard}>Projects</button>
            <div><span className="studio-kicker">New project</span><h1>Start with the goal.</h1><p>Talk naturally. AI360 turns the conversation into a brief you can see and correct.</p></div>
          </header>

          <ProjectStageNavigator phase="briefing" activeStage="brief" />

          <div className="project-kickoff-layout">
            <section className="brief-conversation" aria-label="Project setup conversation">
              <div className="brief-turn assistant">
                <span>AI360</span>
                <p>What are you trying to make, launch or improve? A rough idea is enough to start.</p>
              </div>
              {briefTurns.map((turn) => (
                <div className={`brief-turn ${turn.role}`} key={turn.id}><span>{turn.role === 'user' ? 'You' : 'AI360'}</span><p>{turn.content}</p></div>
              ))}
              {briefBusy ? <div className="brief-turn assistant thinking"><span>AI360</span><p>Shaping the brief<span>...</span></p></div> : null}
              <form className="brief-composer" onSubmit={(event) => { event.preventDefault(); void continueBrief() }}>
                <textarea
                  rows={3}
                  value={briefInput}
                  onChange={(event) => setBriefInput(event.target.value)}
                  placeholder={briefTurns.length ? 'Add a detail or answer AI360...' : 'Describe what you want to achieve...'}
                  autoFocus
                />
                <div><span>AI360 asks only for details that change the work.</span><button type="submit" disabled={!briefInput.trim() || briefBusy}>Send <b>↑</b></button></div>
              </form>
            </section>

            <aside className="live-brief">
              <div className="live-brief-head"><span><b>Live brief</b><small>{readiness} of 5 essentials clear</small></span><span className="studio-readiness"><i style={{ width: `${readiness * 20}%` }} /></span></div>
              <dl>
                <div><dt>Business</dt><dd>{intake.businessName || 'Not clear yet'}</dd></div>
                <div><dt>Offer</dt><dd>{intake.offer || 'Not clear yet'}</dd></div>
                <div><dt>Audience</dt><dd>{intake.audience || 'Not clear yet'}</dd></div>
                <div><dt>Goal</dt><dd>{intake.goal || 'Not clear yet'}</dd></div>
                <div><dt>Where it will be used</dt><dd>{intake.channels.length ? intake.channels.join(', ') : 'Not clear yet'}</dd></div>
              </dl>
              <details className="brief-edit">
                <summary>Review or correct details</summary>
                <div>
                  <label>Business name<input value={intake.businessName} onChange={(event) => updateIntake('businessName', event.target.value)} /></label>
                  <label>Offer<textarea rows={2} value={intake.offer} onChange={(event) => updateIntake('offer', event.target.value)} /></label>
                  <label>Audience<textarea rows={2} value={intake.audience} onChange={(event) => updateIntake('audience', event.target.value)} /></label>
                  <label>Goal<textarea rows={2} value={intake.goal} onChange={(event) => updateIntake('goal', event.target.value)} /></label>
                  <fieldset><legend>Channels</legend>{CHANNELS.map((channel) => <button type="button" className={intake.channels.includes(channel) ? 'selected' : ''} onClick={() => toggleChannel(channel)} key={channel}>{channel}</button>)}</fieldset>
                </div>
              </details>
              {error ? <div className="studio-error">{error}</div> : null}
              <button className="studio-create" onClick={createProject} disabled={busy || readiness < 5}>Build this project <span>→</span></button>
              <p className="studio-form-note">About {packCredits(selectedPack)} credits. You review the work before anything is published.</p>
            </aside>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="studio-main" ref={mainRef}>
      <div className="studio-project">
        <header className="project-head">
          <div>
            <span className="studio-kicker">{project.pack?.name || 'Marketing launch pack'}</span>
            <h1>{project.campaign.name}</h1>
            <p>{project.intake.businessName} · Updated {new Date(project.updatedAt).toLocaleDateString()}</p>
          </div>
          <div className="project-head-actions">
            <button onClick={openDashboard}>All projects</button>
            <button onClick={() => changeProjectLifecycle(project, 'archive')}>Archive</button>
            <button className="project-new" onClick={() => beginProject()}>New project</button>
          </div>
        </header>

        <ProjectStageNavigator
          phase="project"
          activeStage={activeProjectStage}
          approved={approvedCount}
          total={project.assets.length}
          onSelect={goToProjectStage}
        />

        {error && <div className="studio-error project-error">{error}</div>}

        <section className="project-stage-section" id="project-stage-brief" data-project-stage="brief">
          <div className="project-stage-heading">
            <span>01</span>
            <div><b>Approved brief</b><small>The goal and context that guided this project.</small></div>
          </div>
          <div className="project-summary">
          <div className="project-progress">
            <div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties}>
              <span>{progress}%</span>
            </div>
            <span><b>{approvedCount} of {project.assets.length} approved</b><small>Review each asset to complete the pack.</small></span>
          </div>
          <div><span>Objective</span><b>{project.campaign.objective}</b></div>
          <div><span>{project.pack ? 'Outcome' : 'Big idea'}</span><b>{project.campaign.bigIdea}</b></div>
          <div><span>{project.pack ? 'Build status' : 'Primary action'}</span><b>{project.run ? `${project.run.producedSections} deliverables · ${project.run.review?.passed ? 'quality checked' : project.run.status}` : project.campaign.callToAction}</b></div>
          </div>
        </section>

        <section className="project-stage-section" id="project-stage-build" data-project-stage="build">
          <div className="project-stage-heading">
            <span>02</span>
            <div><b>Build record</b><small>What AI360 completed and how the work was checked.</small></div>
            <em>{project.run?.review?.passed ? 'Quality checked' : project.run?.status === 'partial' ? 'Needs attention' : 'Build complete'}</em>
          </div>
          <div className="project-build-record">
            {(project.run?.specialists ?? [
              { id: 'brand', label: 'Direction', working: 'The project direction was shaped from the brief.', status: 'complete' as const },
              { id: 'campaign', label: 'Production', working: 'Connected project assets were prepared.', status: 'complete' as const },
              { id: 'copy', label: 'Quality check', working: 'The result was prepared for your review.', status: 'complete' as const },
            ]).map((specialist, index) => (
              <div className={specialist.status} key={`${specialist.id}-${index}`}>
                <span>{specialist.status === 'complete' ? '✓' : specialist.status === 'failed' ? '!' : String(index + 1).padStart(2, '0')}</span>
                <span><b>{specialist.label}</b><small>{specialist.detail || specialist.working}</small></span>
                <em>{specialist.status === 'complete' ? 'Ready' : specialist.status === 'failed' ? 'Check' : 'Working'}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="project-stage-section" id="project-stage-review" data-project-stage="review">
          <div className="project-stage-heading">
            <span>03</span>
            <div><b>Review and approve</b><small>Open each item, request changes and approve only what is ready.</small></div>
            <em>{approvedCount} of {project.assets.length} approved</em>
          </div>

        <div className={`project-layout${project.pack ? ' pack-project' : ''}`}>
          {!project.pack ? <aside className="brand-panel">
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
          </aside> : null}

          <section className="asset-board">
            <div className="asset-board-head">
              <span><b>{project.pack ? 'Project deliverables' : 'Production checklist'}</b><small>Review, improve and approve each deliverable.</small></span>
              <span>{project.assets.length} deliverables</span>
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
                      <span><b>{asset.title}</b><small>{asset.channel} · Version {asset.version ?? 1} · {asset.purpose}</small></span>
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
                                <span>{media.assetId ? 'Saved to this project and ready on your other devices.' : 'Download this copy now.'}</span>
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
                          <button onClick={() => editingId === asset.id ? finishManualEdit(asset) : setEditingId(asset.id)}>
                            {editingId === asset.id ? 'Save new version' : 'Edit'}
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
              <span className="execution-mark">01</span>
              <span>
                <b>{project.pack ? 'Your project stays editable' : 'Studio production is live'}</b>
                <small>{project.pack ? 'Review the work, request an improvement, approve it, then export the project.' : 'Approve an asset, then create its design or video. Approved copy can be shared from any device.'}</small>
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
        </section>

        <section className="project-stage-section project-deliverables" id="project-stage-deliverables" data-project-stage="deliverables">
          <div className="project-stage-heading">
            <span>04</span>
            <div><b>Deliverables</b><small>Approved work, generated files and complete project exports.</small></div>
            <em>{approvedAssets.length} ready</em>
          </div>
          {approvedAssets.length ? (
            <div className="deliverable-grid">
              {approvedAssets.map((asset) => {
                const media = generatedMedia[asset.id]
                return (
                  <article key={asset.id}>
                    <span className="asset-icon">{ASSET_ICONS[asset.type] || 'Aa'}</span>
                    <div><b>{asset.title}</b><small>{asset.channel} · Version {asset.version ?? 1}</small></div>
                    <span className="deliverable-state">{media?.status === 'completed' ? 'File ready' : 'Approved'}</span>
                    <div className="deliverable-actions">
                      <button onClick={() => { setExpandedId(asset.id); goToProjectStage('review') }}>Open</button>
                      <button onClick={() => navigator.clipboard.writeText(asset.content)}>Copy</button>
                      {media?.status === 'completed' && media.url ? <button onClick={() => downloadGenerated(asset, media)}>Download</button> : null}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="deliverables-empty">
              <span>Nothing has been approved yet.</span>
              <p>Review the work above. Approved items will collect here automatically, ready to copy, download or export.</p>
              <button onClick={() => goToProjectStage('review')}>Go to review</button>
            </div>
          )}
          <div className="project-export-bar">
            <span><b>Export the complete project</b><small>Take the brief, sources and every deliverable with you.</small></span>
            <div>
              <button onClick={() => exportPack('pdf')} disabled={Boolean(exporting)}>{exporting === 'pdf' ? 'Creating…' : 'Export PDF'}</button>
              <button onClick={() => exportPack('docx')} disabled={Boolean(exporting)}>{exporting === 'docx' ? 'Creating…' : 'Export Word'}</button>
            </div>
          </div>
        </section>
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
              AI360 has prepared sensible choices from your project. Adjust only what matters, then approve the cost.
            </p>
            <div className="media-setup-grid">
              <label>
                <span>Where will it appear?</span>
                <select
                  value={executionApproval.intent.channel}
                  onChange={(event) => {
                    const channel = event.target.value as MediaChannel
                    const aspectRatio = channel === 'auto'
                      ? executionApproval.intent.aspectRatio
                      : MEDIA_CHANNELS[channel].aspectRatio
                    void updateExecutionIntent({ channel, aspectRatio })
                  }}
                >
                  {Object.entries(MEDIA_CHANNELS)
                    .filter(([key]) => executionApproval.kind !== 'video' || key !== 'print')
                    .map(([key, option]) => <option value={key} key={key}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span>Quality</span>
                <select value={executionApproval.intent.qualityTier} onChange={(event) => void updateExecutionIntent({ qualityTier: event.target.value as MediaIntent['qualityTier'] })}>
                  <option value="draft">Draft, lowest cost</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Best available</option>
                </select>
              </label>
              <label>
                <span>Shape</span>
                <select value={executionApproval.intent.aspectRatio} onChange={(event) => void updateExecutionIntent({ aspectRatio: event.target.value as MediaIntent['aspectRatio'], channel: 'auto' })}>
                  <option value="9:16">Vertical, 9:16</option>
                  {executionApproval.kind !== 'video' ? <option value="1:1">Square, 1:1</option> : null}
                  <option value="16:9">Landscape, 16:9</option>
                  {executionApproval.kind !== 'video' ? <option value="2:3">Portrait print, 2:3</option> : null}
                </select>
              </label>
              {executionApproval.kind === 'video' ? (
                <label>
                  <span>Length</span>
                  <select value={executionApproval.intent.durationSeconds} onChange={(event) => void updateExecutionIntent({ durationSeconds: Number(event.target.value) as 4 | 6 | 8 })}>
                    <option value="4">4 seconds, quick draft</option>
                    <option value="6">6 seconds</option>
                    <option value="8">8 seconds</option>
                  </select>
                </label>
              ) : null}
              {executionApproval.kind === 'video' ? (
                <label>
                  <span>Movement</span>
                  <select value={executionApproval.intent.motion} onChange={(event) => void updateExecutionIntent({ motion: event.target.value as MediaIntent['motion'] })}>
                    <option value="calm">Calm</option>
                    <option value="balanced">Balanced</option>
                    <option value="dynamic">Dynamic</option>
                  </select>
                </label>
              ) : null}
              <label>
                <span>Resolution</span>
                <select value={executionApproval.intent.resolution} onChange={(event) => void updateExecutionIntent({ resolution: event.target.value as MediaIntent['resolution'] })}>
                  {executionApproval.kind === 'video' ? (
                    <><option value="720p">720p, data friendly</option><option value="1080p">1080p</option></>
                  ) : (
                    <><option value="1K">1K, data friendly</option><option value="2K">2K</option></>
                  )}
                </select>
              </label>
            </div>
            {executionApproval.kind === 'video' ? (
              <div className="media-audio-note"><b>Audio stays off for this rollout.</b><span>Add editable captions and approved sound after the visual is ready.</span></div>
            ) : null}
            <div className="execution-quote">
              <span><b>{executionApproval.estimateLabel}</b><small>Your file will be saved privately to this project. Nothing is posted automatically.</small></span>
              <strong>
                {mediaQuoteBusy
                  ? 'Checking'
                  : executionApproval.quoteValid
                    ? `${executionApproval.kind === 'video' ? '' : 'Up to '}${executionApproval.estimatedCredits} credits`
                    : 'Unavailable'}
              </strong>
            </div>
            <div className="approval-foot">
              <button onClick={() => setExecutionApproval(null)}>Cancel</button>
              <button className="approve-action" onClick={confirmExecution} disabled={mediaQuoteBusy || !executionApproval.quoteValid}>{mediaQuoteBusy ? 'Checking price' : executionApproval.quoteValid ? 'Approve and create' : 'Adjust choices'}</button>
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
  const milestones = project.run
    ? [
        ...project.run.specialists.slice(0, 3).map((specialist) => ({
          label: specialist.label,
          complete: specialist.status === 'complete',
          active: specialist.status !== 'complete',
        })),
        { label: 'Review', complete: completion.percent === 100, active: completion.percent < 100 },
      ]
    : [
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

function PackPicker({ onChoose }: { onChoose: (packId: PackId) => void }) {
  return (
    <div className="studio-quick-grid studio-pack-grid">
      {PACKS.map((pack) => (
        <button onClick={() => onChoose(pack.id)} key={pack.id}>
          <span>{pack.mark}</span>
          <b>{pack.name}</b>
          <small>{pack.outcome}</small>
          <em>{packCredits(pack)} credits · {pack.deliverables.length} deliverables</em>
          <i aria-hidden="true">→</i>
        </button>
      ))}
    </div>
  )
}

async function readPackStream(response: Response, onEvent: (event: PackEvent) => void) {
  if (!response.body) throw new Error('Create returned no progress stream.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      onEvent(JSON.parse(line) as PackEvent)
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as PackEvent)
}
