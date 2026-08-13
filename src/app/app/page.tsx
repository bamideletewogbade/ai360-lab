'use client'
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { type ChatMode } from '@/lib/models'
import { ResponseContent } from '@/components/ResponseContent'
import {
  browserSpeechLocale, DEFAULT_LANGUAGE, DEFAULT_SPEECH_INPUT,
  type LanguageCode, type SpeechInputCode,
} from '@/lib/languages'
import { StudioWorkspace } from '@/components/StudioWorkspace'
import { AppsDirectory } from '@/components/AppsDirectory'
import { MediaStudio } from '@/components/MediaStudio'
import { AccountControls } from '@/components/AccountControls'
import { CreditBalance } from '@/components/CreditBalance'
import { WorkspaceBoot } from '@/components/WorkspaceBoot'
import { QualityFeedback } from '@/components/QualityFeedback'
import { SidebarHelpMenu } from '@/components/SidebarHelpMenu'
import { ConversationMinimap, type ConversationPrompt } from '@/components/ConversationMinimap'
import { PromptComposer } from '@/components/PromptComposer'
import { ResponseActions } from '@/components/ResponseActions'
import { WorkspaceOnboarding } from '@/components/WorkspaceOnboarding'
import { useWorkspaceIdentity } from '@/components/WorkspaceIdentityProvider'
import { scopedStorageKey } from '@/lib/workspace'
import { routeIntentDeterministically, type IntentRoute } from '@/lib/intent-router'
import {
  personalizedIntro, personalizedTasks, readStoredProfile, resolveFirstRun, SKIPPED, type OnboardingProfile,
} from '@/lib/onboarding'

type Attachment = {
  name: string
  kind: 'image' | 'video' | 'pdf' | 'text'
  data?: string
  text?: string
}
type Msg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: Attachment[]
  agent?: boolean
  agentSteps?: AgentStep[]
  agentActivity?: AgentActivity[]
  agentPlan?: AgentPlan
  /** Set when the run reports its result, so a streaming draft is not called finished. */
  agentDone?: boolean
  /**
   * The server side run this message is showing. Saved with the conversation so
   * a dropped connection, or closing the tab entirely, can be picked back up.
   */
  agentRunId?: string
  sources?: SourceLink[]
  usage?: { totalTokens?: number; cost?: number }
  actions?: AgentAction[]
  /** Correlates customer feedback with the server trace that produced this answer. */
  requestId?: string
  failure?: MessageFailure
}
type MessageFailure = {
  code: string
  message: string
  retryable: boolean
  creditNotice: string
  requestId: string
}
type Experience = 'chat' | 'agent' | 'studio' | 'apps' | 'media'
type AgentStep = { id: string; label: string; status: 'pending' | 'active' | 'complete' | 'failed' }
type AgentActivity = { type: string; summary: string; createdAt: string }
type AgentDepth = 'quick' | 'standard' | 'thorough'
/** A plan waiting for the person to approve it before any paid work runs. */
type AgentPlan = {
  objectives: string[]
  depth: AgentDepth
  awaitingApproval: boolean
  estimatedCredits: number
}
type SourceLink = { title: string; url: string }
type ActionKind = 'email' | 'calendar' | 'task'
type AgentAction = {
  id: string
  kind: ActionKind
  title: string
  description: string
  status: 'proposed' | 'completed'
  result?: string
  payload: {
    recipient?: string
    subject?: string
    body?: string
    title?: string
    notes?: string
    start?: string
    durationMinutes?: number
  }
}
type ActionDraft = AgentAction & { messageId: string }
type Conversation = {
  id: string
  title: string
  messages: Msg[]
  updatedAt: number
  model: ChatMode
  experience?: Experience
}

const STORAGE_KEY = 'ai360-lab-conversations-v2'
const ACTIVE_KEY = 'ai360-lab-active-v2'
const SIDEBAR_KEY = 'ai360-lab-sidebar-collapsed-v1'
const PROFILE_KEY = 'ai360-lab-profile-v1'
const MAX_FILE_BYTES = 4 * 1024 * 1024
const MAX_VIDEO_BYTES = 8 * 1024 * 1024

function promptPreview(message: Msg) {
  const plainText = message.content
    .replace(/[`*_#>~\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (plainText) return plainText.length > 92 ? `${plainText.slice(0, 89).trimEnd()}…` : plainText
  if (message.attachments?.length) return `Prompt with ${message.attachments[0].name}`
  return 'Prompt'
}

const AGENT_TASKS = [
  { icon: 'RS', label: 'Research and report', prompt: 'Research this topic using reliable current sources and create a concise report with practical recommendations: ' },
  { icon: '⇄', label: 'Compare documents', prompt: 'Compare the attached documents, identify the important differences, and recommend the best next steps.' },
  { icon: 'Aa', label: 'Create a proposal', prompt: 'Research what is needed and create a practical, professional proposal for: ' },
  { icon: 'AP', label: 'Build an action plan', prompt: 'Turn this outcome into a researched, step-by-step action plan with priorities, risks and next actions: ' },
]

const MODE_META: Record<Experience, {
  label: string
  short: string
  description: string
  eyebrow: string
  heading: ReactNode
  intro: string
}> = {
  chat: {
    label: 'Ask',
    short: 'Think, write and learn',
    description: 'Answers & ideas',
    eyebrow: 'Everyday intelligence',
    heading: <>Turn a thought into<br />something useful.</>,
    intro: 'Ask a question, shape an idea, or bring a task. AI360 chooses the right intelligence and helps you move forward.',
  },
  agent: {
    label: 'Research',
    short: 'Current, sourced work',
    description: 'Current, sourced work',
    eyebrow: 'Research workspace',
    heading: <>Give us the outcome.<br />We will work the steps.</>,
    intro: 'Set a goal and let AI360 research the web, inspect your materials, reason through the work and return a checked deliverable.',
  },
  studio: {
    label: 'Create',
    short: 'Ongoing business projects',
    description: 'Projects and ready-to-use assets',
    eyebrow: 'Project workspace',
    heading: <>Build the assets that<br />move your business.</>,
    intro: 'Go from a brand brief to a coordinated launch pack, then review, refine, approve and produce each asset.',
  },
  apps: {
    label: 'Apps & Outcomes',
    short: 'Deliverables & Showcase',
    description: 'Project outcomes and exported apps',
    eyebrow: 'App & Outcome Directory',
    heading: <>Your published outcomes<br />and project apps.</>,
    intro: 'Explore and manage generated deliverables, document exports, and project outcomes created across your workspace.',
  },
  media: {
    label: 'Media Studio',
    short: 'AI Images & Videos',
    description: 'Generate high-res AI images and video clips',
    eyebrow: 'Creative Media Studio',
    heading: <>Generate AI visuals<br />and motion clips.</>,
    intro: 'Create high-resolution AI images, marketing graphics, video animations, and visual assets for your projects.',
  },
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function freshConversation(experience: Experience = 'chat'): Conversation {
  return { id: makeId(), title: 'New conversation', messages: [], updatedAt: Date.now(), model: 'auto', experience }
}

function titleFrom(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening))[!. ]*$/i.test(clean)) return 'Quick chat'
  return clean.length > 38 ? `${clean.slice(0, 38)}…` : clean || 'New conversation'
}

function displayConversationTitle(title: string) {
  return /^(hi|hello|hey|yo)[!. ]*$/i.test(title.trim()) ? 'Quick chat' : title
}

function experienceForPrompt(prompt: string): Experience {
  return experienceForRoute(routeIntentDeterministically(prompt).route)
}

function experienceForRoute(route: IntentRoute): Experience {
  return route === 'project' ? 'studio' : route === 'research' ? 'agent' : 'chat'
}

async function routeExperience(prompt: string): Promise<Experience> {
  try {
    const response = await fetch('/api/route-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': crypto.randomUUID() },
      body: JSON.stringify({ prompt }),
    })
    const data = await response.json().catch(() => null) as { route?: IntentRoute } | null
    if (response.ok && data?.route) return experienceForRoute(data.route)
  } catch {
    // Local fallback keeps the composer useful during a routing outage.
  }
  return experienceForPrompt(prompt)
}

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string; retryable: boolean; creditNotice: string; requestId: string }

async function readChatStream(response: Response, onEvent: (event: ChatStreamEvent) => void) {
  if (!response.body) throw new Error('No response stream')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let terminalEvent = false
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as ChatStreamEvent
      if (event.type === 'done' || event.type === 'error') terminalEvent = true
      onEvent(event)
    }
  }
  if (!terminalEvent) throw new Error('The connection ended before AI360 confirmed the result.')
}

function failureFromHttp(status: number, detail: Record<string, unknown>, requestId: string): MessageFailure {
  const code = typeof detail.status === 'string' ? detail.status : `http_${status}`
  const message = typeof detail.error === 'string' ? detail.error : 'AI360 could not start this request.'
  const retryable = status === 408 || status === 429 || status >= 500
  const creditNotice = status === 402
    ? 'No work was started. Add credits before trying again.'
    : status === 409
      ? 'The original request may still be processing. Check it before starting another.'
      : 'No work was started and no credits were used.'
  return { code, message, retryable, creditNotice, requestId }
}

type AgentEvent =
  | { type: 'run'; runId: string; recoverable: boolean }
  | { type: 'step'; id: string; label: string; status: 'pending' | 'active' | 'complete' | 'failed' }
  | { type: 'delta'; text: string; reset?: boolean }
  | { type: 'plan'; objectives: string[]; depth: AgentDepth; awaitingApproval: boolean; estimatedCredits: number }
  | { type: 'result'; content: string; sources?: SourceLink[]; actions?: AgentAction[]; usage?: { totalTokens?: number; cost?: number } }
  | { type: 'error'; message: string; code?: string; retryable?: boolean; creditNotice?: string; requestId?: string }

async function readAgentStream(response: Response, onEvent: (event: AgentEvent) => void) {
  if (!response.body) throw new Error('No agent stream')
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
      onEvent(JSON.parse(line) as AgentEvent)
    }
  }
}

/**
 * Durable Studio projects have their own store and project home. The sidebar
 * only lists conversational work so a mode switch can never masquerade as a
 * project.
 */
const SIDEBAR_GROUPS: Array<{
  id: string
  label: string
  match: (experience?: Experience) => boolean
}> = [
  { id: 'chats', label: 'Chats', match: (experience) => !experience || experience === 'chat' || experience === 'agent' },
]

const AUTH_ENABLED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL
  && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
)

export default function LabPage() {
  const identity = useWorkspaceIdentity()
  return (
    <LabWorkspace
      authLoaded
      signedIn={Boolean(identity)}
      workspaceScope={identity?.workspaceScope ?? 'guest'}
      memberId={identity?.userId ?? ''}
    />
  )
}

function LabWorkspace({
  authLoaded,
  signedIn,
  workspaceScope,
  memberId = '',
}: {
  authLoaded: boolean
  signedIn: boolean
  workspaceScope: string
  memberId?: string
}) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState('')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  // How thorough an agent run should be, and whether it pauses for sign-off
  // before spending anything. Both are per-session preferences, not per-message.
  const [agentDepth, setAgentDepth] = useState<AgentDepth>('standard')
  const [planFirst, setPlanFirst] = useState(false)
  // Kept for the session so nobody has to reselect their language every message.
  const [responseLanguage, setResponseLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE)
  const [speechInputLanguage] = useState<SpeechInputCode>(DEFAULT_SPEECH_INPUT)
  const recovering = useRef(new Set<string>())
  const [hydrated, setHydrated] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [conversationMenuId, setConversationMenuId] = useState('')
  const [profile, setProfile] = useState<OnboardingProfile | null>(null)
  const [showIntake, setShowIntake] = useState(false)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [fileError, setFileError] = useState('')
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'recorded' | 'transcribing'>('idle')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null)
  const [recordingUrl, setRecordingUrl] = useState('')
  const [voiceNotice, setVoiceNotice] = useState('')
  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [cloudReady, setCloudReady] = useState(false)
  const [, setCloudStatus] = useState<'local' | 'loading' | 'synced' | 'unavailable'>('local')
  const [initialStudioBrief, setInitialStudioBrief] = useState('')
  // Incremented by the sidebar "+", it tells the Studio workspace to open its
  // create-project modal. A counter rather than a boolean so a second click
  // after closing still fires.
  const [createProjectSignal, setCreateProjectSignal] = useState(0)
  // Pressing "Projects" returns to the project list, the way pressing a section
  // you are already in takes you to the top of it.
  const [projectsHomeSignal, setProjectsHomeSignal] = useState(0)
  const [helpOpen, setHelpOpen] = useState(false)
  const [showReturnToLatest, setShowReturnToLatest] = useState(false)
  const [copiedPromptId, setCopiedPromptId] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const followLatestRef = useRef(true)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const sidebarOpenButtonRef = useRef<HTMLButtonElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const loadedWorkspaceRef = useRef('')
  const cloudWorkspaceRef = useRef('')

  const workspaceStorageKey = scopedStorageKey(STORAGE_KEY, workspaceScope)
  const workspaceActiveKey = scopedStorageKey(ACTIVE_KEY, workspaceScope)
  const sidebarPreferenceKey = scopedStorageKey(SIDEBAR_KEY, workspaceScope)
  // Personalization is remembered per member, so each signed-in person — and
  // the guest — keeps their own first-run record on a shared device. Inside an
  // organization the member id is appended so members do not share (and cannot
  // leak) one org-wide record; this mirrors the server's (workspace, owner) key.
  const onboardingScope = signedIn && memberId
    ? workspaceScope.startsWith('org:') ? `${workspaceScope}:${memberId}` : workspaceScope
    : 'guest'
  const workspaceProfileKey = scopedStorageKey(PROFILE_KEY, onboardingScope)

  const active = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0]
  const messages = useMemo(() => active?.messages ?? [], [active])
  const conversationPrompts = useMemo<ConversationPrompt[]>(() => messages
    .filter((message) => message.role === 'user')
    .map((message) => ({ id: message.id, label: promptPreview(message) })), [messages])
  const experience = active?.experience ?? 'chat'
  const modeMeta = MODE_META[experience]

  useEffect(() => {
    if (!conversationMenuId) return

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.history-actions')) return
      setConversationMenuId('')
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setConversationMenuId('')
      document.querySelector<HTMLElement>('[data-menu-trigger][aria-expanded="true"]')?.focus()
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [conversationMenuId])

  useEffect(() => {
    if (!authLoaded) return
    loadedWorkspaceRef.current = ''
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(workspaceStorageKey) || '[]') as Conversation[]
        const next = saved.length ? saved : [freshConversation()]
        const savedActive = localStorage.getItem(workspaceActiveKey)
        setSidebarCollapsed(localStorage.getItem(sidebarPreferenceKey) === 'true')
        setConversations(next)
        setActiveId(next.some((item) => item.id === savedActive) ? savedActive! : next[0].id)
      } catch {
        const next = freshConversation()
        setConversations([next])
        setActiveId(next.id)
      }
      loadedWorkspaceRef.current = workspaceScope
      setHydrated(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [authLoaded, sidebarPreferenceKey, workspaceActiveKey, workspaceScope, workspaceStorageKey])

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(sidebarPreferenceKey, String(sidebarCollapsed)) } catch { /* Preferences remain optional. */ }
  }, [hydrated, sidebarCollapsed, sidebarPreferenceKey])

  // First run, resolved per identity. A guest is personalized immediately; when
  // they sign in, the answer they already gave follows them into their account
  // instead of asking again, while a genuinely new identity is offered the
  // intake. Waiting for auth to load avoids flashing the intake during the
  // brief guest phase before a signed-in scope is known.
  useEffect(() => {
    if (!hydrated || !authLoaded) return
    let scopedRaw: string | null = null
    let guestRaw: string | null = null
    try {
      scopedRaw = localStorage.getItem(workspaceProfileKey)
      guestRaw = localStorage.getItem(PROFILE_KEY)
    } catch { scopedRaw = null; guestRaw = null }

    const decision = resolveFirstRun({
      scopedRaw,
      guestRaw,
      signedIn,
      isGuestScope: workspaceScope === 'guest',
    })
    if (decision.adopt) {
      try {
        localStorage.setItem(
          workspaceProfileKey,
          decision.adopt === SKIPPED ? SKIPPED : JSON.stringify(decision.adopt),
        )
      } catch { /* Personalization is best-effort. */ }
    }
    setProfile(decision.profile)
    // For a signed-in person the durable store is authoritative, so the intake
    // decision is deferred to the sync effect below to avoid flashing it on a
    // new device before their saved answer arrives. A guest decides locally.
    setShowIntake(signedIn ? false : decision.showIntake)
  }, [hydrated, authLoaded, signedIn, workspaceScope, workspaceProfileKey])

  const persistOnboardingToServer = useCallback((
    payload: { status: 'completed'; role: OnboardingProfile['role']; goal: OnboardingProfile['goal'] } | { status: 'skipped' },
  ) => {
    void fetch('/api/onboarding', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => { /* The local cache already holds the answer. */ })
  }, [])

  // Personalization that follows a person across devices. When signed in, the
  // durable store decides: a saved answer is applied (and cached locally); an
  // empty store is filled from any local choice — including one adopted from a
  // guest session — so the answer given once on any device is theirs on the
  // next; and only a truly new identity is offered the intake.
  useEffect(() => {
    if (!hydrated || !authLoaded || !signedIn) return
    const controller = new AbortController()
    void fetch('/api/onboarding', { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() as Promise<{ status?: string; profile?: OnboardingProfile }> : null))
      .then((state) => {
        if (!state) return
        if (state.status === 'completed' && state.profile) {
          setProfile(state.profile)
          setShowIntake(false)
          try { localStorage.setItem(workspaceProfileKey, JSON.stringify(state.profile)) } catch { /* best-effort cache */ }
          return
        }
        if (state.status === 'skipped') {
          setProfile(null)
          setShowIntake(false)
          try { localStorage.setItem(workspaceProfileKey, SKIPPED) } catch { /* best-effort cache */ }
          return
        }
        // The store has nothing yet: promote a local choice, or offer the intake.
        let scopedRaw: string | null = null
        try { scopedRaw = localStorage.getItem(workspaceProfileKey) } catch { scopedRaw = null }
        const local = readStoredProfile(scopedRaw)
        if (local) {
          persistOnboardingToServer({ status: 'completed', role: local.role, goal: local.goal })
          setProfile(local)
          setShowIntake(false)
        } else if (scopedRaw === SKIPPED) {
          persistOnboardingToServer({ status: 'skipped' })
          setShowIntake(false)
        } else {
          setShowIntake(true)
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        // Offline or the store is unavailable: fall back to the local decision.
        let scopedRaw: string | null = null
        try { scopedRaw = localStorage.getItem(workspaceProfileKey) } catch { scopedRaw = null }
        if (!readStoredProfile(scopedRaw) && scopedRaw !== SKIPPED) setShowIntake(true)
      })
    return () => controller.abort()
  }, [hydrated, authLoaded, signedIn, workspaceScope, workspaceProfileKey, persistOnboardingToServer])

  const completeIntake = (chosen: OnboardingProfile) => {
    setProfile(chosen)
    setShowIntake(false)
    try { localStorage.setItem(workspaceProfileKey, JSON.stringify(chosen)) } catch { /* Personalization is best-effort. */ }
    if (signedIn) persistOnboardingToServer({ status: 'completed', role: chosen.role, goal: chosen.goal })
  }

  const skipIntake = () => {
    setShowIntake(false)
    try { localStorage.setItem(workspaceProfileKey, SKIPPED) } catch { /* Personalization is best-effort. */ }
    if (signedIn) persistOnboardingToServer({ status: 'skipped' })
  }

  useEffect(() => {
    if (!sidebarOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSidebarOpen(false)
      sidebarOpenButtonRef.current?.focus()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [sidebarOpen])

  useEffect(() => {
    if (!hydrated || loadedWorkspaceRef.current !== workspaceScope) return
    try {
      const storageSafe = conversations.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.map((message) => ({
          ...message,
          attachments: message.attachments?.map(({ name, kind }) => ({ name, kind })),
        })),
      }))
      localStorage.setItem(workspaceStorageKey, JSON.stringify(storageSafe))
      localStorage.setItem(workspaceActiveKey, activeId)
    } catch {
      // Storage may be unavailable or full after a large local attachment.
    }
  }, [activeId, conversations, hydrated, workspaceActiveKey, workspaceScope, workspaceStorageKey])

  useEffect(() => {
    if (!hydrated) return
    const params = new URLSearchParams(window.location.search)
    const incomingPrompt = params.get('prompt')?.trim() || ''
    const incomingMode = params.get('mode')
    const draftOnly = params.get('draft') === '1'
    const nextExperience: Experience = incomingMode === 'studio'
      ? 'studio'
      : incomingMode === 'agent'
        ? 'agent'
        : experienceForPrompt(incomingPrompt)

    if (incomingPrompt || incomingMode) {
      if (nextExperience === 'studio') {
        setInitialStudioBrief(incomingPrompt)
        selectExperience(nextExperience)
      } else if (incomingPrompt) {
        const handoffConversation = active.messages.length
          ? { ...freshConversation(), experience: nextExperience }
          : { ...active, experience: nextExperience }

        if (active.messages.length) {
          setConversations((items) => [handoffConversation, ...items])
          setActiveId(handoffConversation.id)
        } else {
          setConversations((items) => items.map((item) => (
            item.id === active.id ? handoffConversation : item
          )))
        }
        if (draftOnly) setInput(incomingPrompt)
        else void send(incomingPrompt, null, [], nextExperience, handoffConversation)
      } else {
        selectExperience(nextExperience)
      }
      window.history.replaceState(null, '', '/app')
      return
    }
  // This handoff should run once after local workspace hydration.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  useEffect(() => {
    if (!hydrated || !authLoaded || !signedIn || loadedWorkspaceRef.current !== workspaceScope) {
      setCloudReady(false)
      setCloudStatus('local')
      return
    }

    const controller = new AbortController()
    cloudWorkspaceRef.current = ''
    setCloudReady(false)
    setCloudStatus('loading')
    void fetch('/api/conversations', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Cloud sync unavailable (${response.status})`)
        return response.json() as Promise<{ conversations: Conversation[] }>
      })
      .then(({ conversations: cloudConversations }) => {
        if (cloudConversations.length) {
          setConversations(cloudConversations)
          setActiveId((current) => cloudConversations.some((item) => item.id === current) ? current : cloudConversations[0].id)
        }
        cloudWorkspaceRef.current = workspaceScope
        setCloudReady(true)
        setCloudStatus('synced')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setCloudStatus('unavailable')
      })

    return () => controller.abort()
  }, [authLoaded, hydrated, signedIn, workspaceScope])

  useEffect(() => {
    if (
      !cloudReady ||
      !signedIn ||
      loadedWorkspaceRef.current !== workspaceScope ||
      cloudWorkspaceRef.current !== workspaceScope
    ) return
    const timer = window.setTimeout(() => {
      const storageSafe = conversations.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.map((message) => ({
          ...message,
          attachments: message.attachments?.map(({ name, kind }) => ({ name, kind })),
        })),
      }))
      void fetch('/api/conversations', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversations: storageSafe }),
      }).then((response) => setCloudStatus(response.ok ? 'synced' : 'unavailable'))
        .catch(() => setCloudStatus('unavailable'))
    }, 800)
    return () => window.clearTimeout(timer)
  }, [cloudReady, conversations, signedIn, workspaceScope])

  useEffect(() => {
    followLatestRef.current = true
    setShowReturnToLatest(false)
    window.requestAnimationFrame(() => {
      const root = scrollRef.current
      root?.scrollTo({ top: root.scrollHeight })
    })
  }, [activeId])

  useEffect(() => {
    if (!followLatestRef.current) return
    const root = scrollRef.current
    if (!root) return
    root.scrollTo({
      top: messages.length ? root.scrollHeight : 0,
      behavior: busy || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }, [messages, busy])

  const updateFollowLatest = () => {
    const root = scrollRef.current
    if (!root) return
    const nearLatest = root.scrollHeight - root.scrollTop - root.clientHeight < 96
    followLatestRef.current = nearLatest
    setShowReturnToLatest(!nearLatest)
  }

  const pauseFollowLatest = () => {
    followLatestRef.current = false
    setShowReturnToLatest(true)
  }

  const returnToLatest = () => {
    const root = scrollRef.current
    if (!root) return
    followLatestRef.current = true
    setShowReturnToLatest(false)
    root.scrollTo({ top: root.scrollHeight, behavior: 'auto' })
  }

  useEffect(() => {
    if (recordingState !== 'recording') return
    const timer = window.setInterval(() => {
      setRecordingSeconds((seconds) => {
        if (seconds >= 299) recorderRef.current?.stop()
        return Math.min(300, seconds + 1)
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [recordingState])

  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl)
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [recordingUrl])


  const visibleConversations = useMemo(() => {
    const query = search.trim().toLowerCase()
    return [...conversations]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((conversation) => conversation.experience !== 'studio')
      .filter((conversation) => !query || conversation.title.toLowerCase().includes(query))
  }, [conversations, search])

  function updateActive(updater: (conversation: Conversation) => Conversation) {
    setConversations((items) => items.map((item) => (item.id === activeId ? updater(item) : item)))
  }

  function newChat() {
    const next = freshConversation(experience === 'agent' ? 'agent' : 'chat')
    setConversations((items) => [next, ...items])
    setActiveId(next.id)
    setInput('')
    setAttachment(null)
    discardRecording()
    setSidebarOpen(false)
  }

  function deleteChat(id: string) {
    if (!window.confirm('Delete this conversation?')) return
    const remaining = conversations.filter((conversation) => conversation.id !== id)
    if (remaining.length) {
      setConversations(remaining)
      if (activeId === id) setActiveId(remaining[0].id)
    } else {
      const next = freshConversation()
      setConversations([next])
      setActiveId(next.id)
    }
  }

  function renameChat(id: string) {
    const current = conversations.find((conversation) => conversation.id === id)
    if (!current) return
    const name = window.prompt('Rename conversation', current.title)?.trim()
    if (!name) return
    setConversations((items) =>
      items.map((item) => (item.id === id ? { ...item, title: name, updatedAt: Date.now() } : item)),
    )
  }

  async function handleFile(file?: File) {
    setFileError('')
    if (!file) return
    const isVideo = file.type.startsWith('video/')
    const sizeLimit = isVideo ? MAX_VIDEO_BYTES : MAX_FILE_BYTES
    if (file.size > sizeLimit) {
      setFileError(`Choose a ${isVideo ? 'video smaller than 8 MB' : 'file smaller than 4 MB'}.`)
      return
    }
    try {
      if (file.type.startsWith('image/')) {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
          setFileError('Use a PNG, JPG, WEBP or GIF image.')
          return
        }
        setAttachment({ name: file.name, kind: 'image', data: await fileToDataUrl(file) })
      } else if (file.type.startsWith('video/')) {
        if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) {
          setFileError('Use an MP4, WEBM or MOV video.')
          return
        }
        setAttachment({ name: file.name, kind: 'video', data: await fileToDataUrl(file) })
      } else if (file.type === 'application/pdf') {
        setAttachment({ name: file.name, kind: 'pdf', data: await fileToDataUrl(file) })
      } else if (file.type.startsWith('text/') || /\.(md|csv|json|txt)$/i.test(file.name)) {
        setAttachment({ name: file.name, kind: 'text', text: (await file.text()).slice(0, 60_000) })
      } else {
        setFileError('Use an image, video, PDF, TXT, Markdown, CSV or JSON file.')
      }
    } catch {
      setFileError('That file could not be read.')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function discardRecording() {
    if (recordingUrl) URL.revokeObjectURL(recordingUrl)
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    recordingStreamRef.current = null
    recorderRef.current = null
    setRecordingUrl('')
    setRecordingBlob(null)
    setRecordingSeconds(0)
    setRecordingState('idle')
  }

  async function toggleRecording() {
    setFileError('')
    setVoiceNotice('')
    if (recordingState === 'recording') {
      recorderRef.current?.stop()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setFileError('Voice recording is not supported in this browser.')
      return
    }
    discardRecording()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 24_000 },
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
        },
      })
      recordingStreamRef.current = stream
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
        .find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined)
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      recorder.onerror = () => {
        setFileError('The recording stopped unexpectedly.')
        discardRecording()
      }
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        const url = URL.createObjectURL(blob)
        setRecordingBlob(blob)
        setRecordingUrl(url)
        setRecordingState('recorded')
        stream.getTracks().forEach((track) => track.stop())
      }
      recorderRef.current = recorder
      setRecordingSeconds(0)
      setRecordingState('recording')
      recorder.start(250)
    } catch {
      setFileError('Microphone access was not available. Check your browser permission and try again.')
      discardRecording()
    }
  }

  async function transcribeRecording() {
    if (!recordingBlob) return
    setRecordingState('transcribing')
    setFileError('')
    try {
      const requestId = crypto.randomUUID()
      const form = new FormData()
      form.set('audio', recordingBlob, 'voice-note')
      form.set('inputLanguage', speechInputLanguage)
      form.set('durationSeconds', String(recordingSeconds))
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'X-Request-Id': requestId, 'Idempotency-Key': requestId },
        body: form,
      })
      const result = await response.json()
      if (!response.ok || typeof result.text !== 'string') {
        const reference = result.requestId || response.headers.get('X-Request-Id') || requestId
        throw new Error(`${result.error || 'Transcription failed'} Reference: ${reference}`)
      }
      setInput((current) => [current.trim(), result.text.trim()].filter(Boolean).join(' '))
      discardRecording()
      setVoiceNotice('Transcript added. Read it before you send.')
      taRef.current?.focus()
    } catch (error) {
      console.error('[AI360] Transcription failed', error)
      setRecordingState('recorded')
      setFileError(
        error instanceof Error
          ? error.message
          : 'I could not transcribe that recording. You can retry or record it again.',
      )
    }
  }

  function speak(text: string) {
    const locale = browserSpeechLocale(responseLanguage)
    if (!locale || typeof window.speechSynthesis === 'undefined') {
      setFileError('Read aloud is not yet available for this language.')
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`]/g, ''))
    utterance.lang = locale
    utterance.rate = 0.98
    const voices = window.speechSynthesis.getVoices()
    utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === locale.toLowerCase())
      || voices.find((voice) => voice.lang.toLowerCase().startsWith('en-gh'))
      || voices.find((voice) => voice.lang.toLowerCase().startsWith('en'))
      || null
    window.speechSynthesis.speak(utterance)
  }

  function defaultActionTime() {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    date.setHours(9, 0, 0, 0)
    const offset = date.getTimezoneOffset() * 60_000
    return new Date(date.getTime() - offset).toISOString().slice(0, 16)
  }

  function reviewAction(messageId: string, action: AgentAction) {
    setActionError('')
    setActionDraft({
      ...action,
      messageId,
      payload: {
        ...action.payload,
        ...(action.kind === 'calendar' && !action.payload.start ? { start: defaultActionTime() } : {}),
      },
    })
  }

  function updateActionDraft(field: keyof AgentAction['payload'], value: string | number) {
    setActionDraft((current) =>
      current ? { ...current, payload: { ...current.payload, [field]: value } } : current,
    )
  }

  function markActionComplete(
    messageId: string,
    actionId: string,
    result: string,
    approvedPayload: AgentAction['payload'],
  ) {
    setConversations((items) =>
      items.map((conversation) =>
        conversation.id === activeId
          ? {
              ...conversation,
              updatedAt: Date.now(),
              messages: conversation.messages.map((message) =>
                message.id === messageId
                  ? {
                      ...message,
                      actions: message.actions?.map((action) =>
                        action.id === actionId
                          ? { ...action, payload: approvedPayload, status: 'completed', result }
                          : action,
                      ),
                    }
                  : message,
              ),
            }
          : conversation,
      ),
    )
  }

  async function approveAction() {
    if (!actionDraft || actionBusy) return
    setActionBusy(true)
    setActionError('')
    try {
      const requestId = crypto.randomUUID()
      const response = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
        body: JSON.stringify({
          kind: actionDraft.kind,
          approved: true,
          payload: actionDraft.payload,
        }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        const reference = response.headers.get('X-Request-Id') || requestId
        throw new Error(
          `${typeof error.error === 'string' ? error.error : 'The action could not be prepared.'} Reference: ${reference}`,
        )
      }

      let result = 'Completed'
      if (actionDraft.kind === 'calendar') {
        const blob = await response.blob()
        const disposition = response.headers.get('Content-Disposition') || ''
        const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'ai-360-event.ics'
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
        result = 'Calendar invite created'
      } else {
        const data = await response.json()
        if (actionDraft.kind === 'email') {
          const link = document.createElement('a')
          link.href = data.url
          link.click()
          result = 'Email draft opened, not sent'
        } else {
          result = 'Task saved'
        }
      }
      markActionComplete(actionDraft.messageId, actionDraft.id, result, actionDraft.payload)
      setActionDraft(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The action could not be completed.')
    } finally {
      setActionBusy(false)
    }
  }

  /** Applies one streamed agent event to the message it belongs to. */
  function applyAgentEvent(conversationId: string, messageId: string, event: AgentEvent) {
    setConversations((items) =>
      items.map((item) => {
        if (item.id !== conversationId) return item
        return {
          ...item,
          updatedAt: Date.now(),
          messages: item.messages.map((message) => {
            if (message.id !== messageId) return message
            if (event.type === 'step') {
              const steps = message.agentSteps ?? []
              const existing = steps.findIndex((step) => step.id === event.id)
              const updated = { id: event.id, label: event.label, status: event.status }
              return {
                ...message,
                agentSteps: existing >= 0
                  ? steps.map((step) => (step.id === event.id ? updated : step))
                  : [...steps, updated],
              }
            }
            if (event.type === 'run') {
              return { ...message, agentRunId: event.recoverable ? event.runId : undefined }
            }
            if (event.type === 'delta') {
              // A reset marks a new draft replacing the one on screen, which is
              // what happens when verification sends the answer back for correction.
              return { ...message, content: event.reset ? event.text : message.content + event.text, failure: undefined }
            }
            if (event.type === 'plan') {
              return {
                ...message,
                agentPlan: {
                  objectives: event.objectives,
                  depth: event.depth,
                  awaitingApproval: event.awaitingApproval,
                  estimatedCredits: event.estimatedCredits,
                },
              }
            }
            if (event.type === 'result') {
              return {
                ...message,
                content: event.content,
                sources: event.sources ?? [],
                actions: event.actions ?? [],
                usage: event.usage,
                failure: undefined,
                agentDone: true,
                agentPlan: message.agentPlan ? { ...message.agentPlan, awaitingApproval: false } : undefined,
              }
            }
            if (event.code) {
              return {
                ...message,
                content: '',
                agentDone: true,
                failure: {
                  code: event.code,
                  message: event.message,
                  retryable: Boolean(event.retryable),
                  creditNotice: event.creditNotice || 'No credits were used for incomplete work.',
                  requestId: event.requestId || message.requestId || 'Unavailable',
                },
              }
            }
            return { ...message, content: event.message }
          }),
        }
      }),
    )
  }

  /**
   * Reattaches to any run left unfinished, including after the tab was closed.
   *
   * A conversation carries its runs with it, so reopening AI360 is enough to
   * find work that was still going when the connection died.
   */
  useEffect(() => {
    if (!signedIn) return
    for (const conversation of conversations) {
      for (const message of conversation.messages) {
        if (!message.agentRunId || message.agentDone || recovering.current.has(message.agentRunId)) continue
        recovering.current.add(message.agentRunId)
        void recoverRun(conversation.id, message.id, message.agentRunId)
      }
    }
    // `recoverRun` is deliberately not a dependency: it is redefined on every
    // render, so depending on it would re-run this constantly. Each run is
    // claimed once by id in `recovering`, which is what actually prevents a
    // second poll starting for the same work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, signedIn])

  /**
   * Picks a run back up after the connection carrying it died.
   *
   * Polls rather than reconnecting a stream, because a long lived connection is
   * the thing that just failed. Keeps asking until the run reaches a terminal
   * state, then writes the answer into the message that was waiting for it.
   */
  async function recoverRun(conversationId: string, messageId: string, runId: string) {
    const startedAt = Date.now()
    const deadline = 5 * 60 * 1000
    let delay = 2_000

    while (Date.now() - startedAt < deadline) {
      await new Promise((resolve) => setTimeout(resolve, delay))
      delay = Math.min(delay * 1.4, 8_000)

      let run: {
        finished?: boolean
        status?: string
        steps?: AgentStep[]
        content?: string | null
        sources?: SourceLink[]
        usage?: { totalTokens?: number; cost?: number } | null
        activity?: AgentActivity[]
      }
      try {
        const res = await fetch(`/api/agent/runs/${encodeURIComponent(runId)}`)
        if (res.status === 404 || res.status === 401) return
        if (!res.ok) continue
        run = await res.json()
      } catch {
        continue // Still offline. Keep waiting rather than giving up on the work.
      }

      for (const step of run.steps ?? []) {
        applyAgentEvent(conversationId, messageId, {
          type: 'step', id: step.id, label: step.label, status: step.status,
        })
      }
      if (run.activity?.length) {
        setConversations((items) => items.map((item) => item.id !== conversationId ? item : {
          ...item,
          messages: item.messages.map((message) => message.id === messageId
            ? { ...message, agentActivity: run.activity }
            : message),
        }))
      }

      if (!run.finished) continue

      if (run.content) {
        applyAgentEvent(conversationId, messageId, {
          type: 'result',
          content: run.content,
          sources: run.sources ?? [],
          usage: run.usage ?? undefined,
        })
      } else {
        applyAgentEvent(conversationId, messageId, {
          type: 'error',
          message: 'That run did not finish. No credits were charged for work you did not receive.',
          code: 'run_failed',
          retryable: true,
          creditNotice: 'No credits were used for incomplete work.',
        })
      }
      return
    }
  }

  /**
   * Runs a plan the person has approved.
   *
   * The approved objectives are sent alongside the plan they came from, so the
   * server can confirm it is executing work it proposed rather than whatever
   * the client asked for.
   */
  async function approvePlan(conversationId: string, message: Msg) {
    const plan = message.agentPlan
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!plan || !conversation || busy) return

    const history = conversation.messages
      .filter((item) => item.id !== message.id && (item.content || item.attachments?.length))
      .map(({ role, content, attachments }) => ({ role, content, attachments }))

    applyAgentEvent(conversationId, message.id, {
      type: 'plan', objectives: plan.objectives, depth: plan.depth,
      awaitingApproval: false, estimatedCredits: plan.estimatedCredits,
    })
    setBusy(true)
    try {
      const requestId = crypto.randomUUID()
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
        body: JSON.stringify({
          messages: history,
          mode: conversation.model,
          depth: plan.depth,
          language: responseLanguage,
          sessionId: conversationId,
          proposedPlan: plan.objectives,
          approvedPlan: plan.objectives,
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error(typeof detail.error === 'string' ? detail.error : 'The plan could not be run.')
      }
      await readAgentStream(res, (event) => applyAgentEvent(conversationId, message.id, event))
    } catch (error) {
      applyAgentEvent(conversationId, message.id, {
        type: 'error',
        message: error instanceof Error ? error.message : 'The plan could not be run.',
        code: 'plan_failed',
        retryable: false,
        creditNotice: 'The approved plan was not completed. Check the activity before starting it again.',
      })
    } finally {
      setBusy(false)
    }
  }

  function discardPlan(conversationId: string, messageId: string) {
    applyAgentEvent(conversationId, messageId, {
      type: 'error',
      message: 'Plan discarded. Nothing was run and no credits were used for the work.',
    })
  }

  async function send(
    rawText: string,
    sentAttachment = attachment,
    baseMessages = messages.filter((message) => message.content || message.attachments?.length),
    experienceOverride?: Experience,
    targetConversation = active,
  ) {
    const content = rawText.trim()
    if ((!content && !sentAttachment) || busy || !targetConversation) return
    const userMessage: Msg = {
      id: makeId(),
      role: 'user',
      content: content || 'Please review this file.',
      ...(sentAttachment ? { attachments: [sentAttachment] } : {}),
    }
    const next = [...baseMessages, userMessage]
    let currentExperience = experienceOverride ?? targetConversation.experience ?? 'chat'
    if (!experienceOverride && !baseMessages.length && currentExperience === 'chat' && content) {
      const inferred = await routeExperience(content)
      if (inferred === 'studio') {
        setInitialStudioBrief(content)
        selectExperience('studio')
        return
      }
      currentExperience = inferred
    }
    const requestId = crypto.randomUUID()
    const placeholder: Msg = {
      id: makeId(),
      role: 'assistant',
      content: '',
      requestId,
      agent: currentExperience === 'agent',
      ...(currentExperience === 'agent' ? { agentSteps: [] } : {}),
    }
    const requestConversationId = targetConversation.id
    const mode = targetConversation.model

    setConversations((items) =>
      items.map((item) =>
        item.id === requestConversationId
          ? {
              ...item,
              experience: currentExperience,
              title: item.messages.length ? item.title : titleFrom(userMessage.content),
              messages: [...next, placeholder],
              updatedAt: Date.now(),
            }
          : item,
      ),
    )
    setInput('')
    setAttachment(null)
    setBusy(true)
    if (taRef.current) taRef.current.style.height = 'auto'

    try {
      const res = await fetch(currentExperience === 'agent' ? '/api/agent' : '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
        body: JSON.stringify({
          messages: next.map(({ role, content: messageContent, attachments }) => ({
            role,
            content: messageContent,
            attachments,
          })),
          mode,
          language: responseLanguage,
          sessionId: requestConversationId,
          ...(currentExperience === 'agent' ? { depth: agentDepth, planOnly: planFirst } : {}),
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({})) as Record<string, unknown>
        const reference = res.headers.get('X-Request-Id') || requestId
        const failure = failureFromHttp(res.status, detail, reference)
        setConversations((items) => items.map((item) => item.id !== requestConversationId ? item : {
          ...item,
          messages: item.messages.map((message) => message.id === placeholder.id
            ? { ...message, content: '', failure }
            : message),
        }))
        return
      }
      if (currentExperience === 'agent') {
        // The run continues on the server whatever happens to this connection,
        // so a broken stream is a reason to go and find it, not to lose it.
        let runId: string | null = null
        try {
          await readAgentStream(res, (event) => {
            if (event.type === 'run' && event.recoverable) runId = event.runId
            applyAgentEvent(requestConversationId, placeholder.id, event)
          })
        } catch (streamError) {
          if (!runId) throw streamError
          applyAgentEvent(requestConversationId, placeholder.id, {
            type: 'step',
            id: 'reconnect',
            label: 'Connection dropped. The work is still running, waiting for it.',
            status: 'active',
          })
          await recoverRun(requestConversationId, placeholder.id, runId)
        }
      } else {
        let accumulated = ''
        await readChatStream(res, (event) => {
          if (event.type === 'delta') {
            accumulated += event.text
          }
          const currentText = accumulated
          setConversations((items) =>
            items.map((item) =>
              item.id === requestConversationId
                ? {
                    ...item,
                    messages: item.messages.map((message) =>
                      message.id !== placeholder.id
                        ? message
                        : event.type === 'delta'
                          ? { ...message, content: currentText, failure: undefined }
                          : event.type === 'error'
                            ? { ...message, content: '', failure: event }
                            : message,
                    ),
                    updatedAt: Date.now(),
                  }
                : item,
            ),
          )
        })
      }
    } catch (error) {
      console.error('[AI360] AI request failed', error)
      setConversations((items) =>
        items.map((item) =>
          item.id === requestConversationId
            ? {
                ...item,
                messages: item.messages.map((message) =>
                  message.id === placeholder.id
                    ? {
                        ...message,
                        content: '',
                        failure: {
                          code: 'connection_lost',
                          message: error instanceof Error
                            ? error.message
                            : 'The connection ended before AI360 confirmed the result.',
                          retryable: false,
                          creditNotice: 'The execution status is unknown, so AI360 will not automatically run it twice.',
                          requestId,
                        },
                      }
                    : message,
                ),
              }
            : item,
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  function regenerate(index: number) {
    if (index !== messages.length - 1) return
    const prior = messages.slice(0, index)
    const lastUserIndex = prior.map((message) => message.role).lastIndexOf('user')
    if (lastUserIndex < 0) return
    const user = prior[lastUserIndex]
    send(user.content, user.attachments?.[0] ?? null, prior.slice(0, lastUserIndex))
  }

  async function copyFailedPrompt(index: number) {
    const prior = messages.slice(0, index)
    const lastUserIndex = prior.map((message) => message.role).lastIndexOf('user')
    if (lastUserIndex < 0) return
    const prompt = prior[lastUserIndex]
    const attachmentNote = prompt.attachments?.length
      ? `\n\nAttachments: ${prompt.attachments.map((item) => item.name).join(', ')}`
      : ''
    await navigator.clipboard.writeText(`${prompt.content}${attachmentNote}`)
    setCopiedPromptId(prompt.id)
    window.setTimeout(() => setCopiedPromptId((current) => current === prompt.id ? '' : current), 1800)
  }

  function selectExperience(nextExperience: Experience) {
    if (busy || nextExperience === experience) return

    // Preserve the identity of completed work. Switching modes starts a fresh
    // workspace unless the current conversation is still an untouched draft.
    if (!messages.length && active.title === 'New conversation') {
      updateActive((conversation) => ({ ...conversation, experience: nextExperience, updatedAt: Date.now() }))
    } else {
      const next = freshConversation(nextExperience)
      setConversations((items) => [next, ...items])
      setActiveId(next.id)
    }
    setInput('')
    setAttachment(null)
    discardRecording()
    setSidebarOpen(false)
  }

  function collapseDesktopSidebar() {
    setSidebarCollapsed(true)
    requestAnimationFrame(() => sidebarOpenButtonRef.current?.focus())
  }

  function openWorkspaceSidebar() {
    if (window.matchMedia('(max-width: 820px)').matches) {
      setSidebarOpen(true)
      window.setTimeout(() => document.querySelector<HTMLButtonElement>('.close-side')?.focus(), 260)
      return
    }
    setSidebarCollapsed(false)
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('.desktop-side-toggle')?.focus(), 300)
  }

  if (!hydrated || !active) return <WorkspaceBoot authLoaded={authLoaded} signedIn={signedIn} />

  return (
    <div className={`lab-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      {showIntake ? <WorkspaceOnboarding onComplete={completeIntake} onSkip={skipIntake} /> : null}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}${sidebarCollapsed ? ' collapsed' : ''}`} id="workspace-sidebar">
        <div className="side-head">
          <img src="/logo-white.png" alt="AI360" className="wordmark" />
          <button className="icon-button desktop-side-toggle" onClick={collapseDesktopSidebar} aria-label="Close sidebar" title="Close sidebar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><path d="M9 4v16M14 9l-3 3 3 3" /></svg>
          </button>
          <button className="icon-button close-side" onClick={() => { setSidebarOpen(false); sidebarOpenButtonRef.current?.focus() }} aria-label="Close sidebar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <button className="new-chat-primary" onClick={newChat}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14"/></svg>
          <span>New chat</span>
        </button>

        <nav className="nav-main-menu" aria-label="Main menu">
          <button
            type="button"
            className={`nav-menu-item${experience === 'chat' ? ' active' : ''}`}
            onClick={() => { selectExperience('chat'); setSidebarOpen(false) }}
          >
            <span className="nav-menu-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </span>
            <span>Chats</span>
          </button>

          <div className={`nav-menu-item-wrap${experience === 'studio' ? ' active' : ''}`}>
            <button
              type="button"
              className={`nav-menu-item${experience === 'studio' ? ' active' : ''}`}
              onClick={() => { selectExperience('studio'); setSidebarOpen(false); setProjectsHomeSignal((n) => n + 1) }}
            >
              <span className="nav-menu-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              </span>
              <span>Projects</span>
            </button>
            <button
              type="button"
              className="nav-menu-add"
              aria-label="New project"
              title="New project"
              onClick={() => { selectExperience('studio'); setSidebarOpen(false); setCreateProjectSignal((n) => n + 1) }}
            >
              +
            </button>
          </div>

          <button
            type="button"
            className={`nav-menu-item${experience === 'media' ? ' active' : ''}`}
            onClick={() => { selectExperience('media'); setSidebarOpen(false) }}
          >
            <span className="nav-menu-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </span>
            <span>Media Studio</span>
          </button>

          <button
            type="button"
            className={`nav-menu-item${experience === 'apps' ? ' active' : ''}`}
            onClick={() => { selectExperience('apps'); setSidebarOpen(false) }}
          >
            <span className="nav-menu-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>
            </span>
            <span>Apps & Outcomes</span>
          </button>
        </nav>

        <div className="recents-section-head">
          <span>Recents</span>
        </div>

        <label className="history-search">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats..." />
          {search ? (
            <button type="button" className="clear-search-btn" onClick={() => setSearch('')} aria-label="Clear search">✕</button>
          ) : null}
        </label>

        <nav className="history-list">
          {SIDEBAR_GROUPS.map((group) => {
            const items = visibleConversations.filter((conversation) => group.match(conversation.experience))
            if (!items.length) return null
            return (
              <div className="history-group" key={group.id}>
                {items.map((conversation) => (
                  <div className={`history-item${conversation.id === active.id ? ' active' : ''}${conversationMenuId === conversation.id ? ' menu-open' : ''}`} key={conversation.id}>
                    <button className="history-main" onClick={() => { setConversationMenuId(''); setActiveId(conversation.id); setSidebarOpen(false) }}>
                      <span>{displayConversationTitle(conversation.title)}</span>
                    </button>
                    <div className="history-actions">
                      <button
                        type="button"
                        className="history-options"
                        aria-label={`Options for ${displayConversationTitle(conversation.title)}`}
                        aria-expanded={conversationMenuId === conversation.id}
                        aria-controls={`conversation-menu-${conversation.id}`}
                        data-menu-trigger={conversation.id}
                        onClick={() => setConversationMenuId((current) => current === conversation.id ? '' : conversation.id)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
                      </button>
                      {conversationMenuId === conversation.id ? (
                        <div className="history-menu" id={`conversation-menu-${conversation.id}`} role="group" aria-label="Conversation actions">
                          <button type="button" onClick={() => { setConversationMenuId(''); renameChat(conversation.id) }}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 16-.7 3.7L8 19l10.2-10.2-3-3L5 16Z" /><path d="m13.8 7.2 3 3" /></svg>
                            <span>Rename</span>
                          </button>
                          <button type="button" className="danger" onClick={() => { setConversationMenuId(''); deleteChat(conversation.id) }}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7m3 4v5m4-5v5" /></svg>
                            <span>Delete</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
          {!visibleConversations.length && (
            <p className="no-results">{search ? 'Nothing matches that search.' : 'Nothing here yet. Start something above.'}</p>
          )}
        </nav>
        <div className="side-support">
          <Link href="/settings" className="side-help" onClick={() => setSidebarOpen(false)}>
            <span>Settings</span><small>Appearance, credits and account</small>
          </Link>
          <SidebarHelpMenu
            onOpenGuide={() => { setHelpOpen(true); setSidebarOpen(false) }}
            feedbackContext={{ sourceSurface: experience === 'chat' ? 'quick' : experience === 'agent' ? 'research' : 'studio', conversationId: active.id, conversationText: messages.slice(-6).map((message) => `${message.role === 'user' ? 'Customer' : 'AI360'}: ${message.content}`).join('\n\n') }}
          />
        </div>
      </aside>
      {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />}

      <section className={`workspace ${experience}`}>
        <header className="lab-top">
          <div className="lab-top-left">
            <button ref={sidebarOpenButtonRef} className="icon-button sidebar-open-button" onClick={openWorkspaceSidebar} aria-label="Open sidebar" aria-controls="workspace-sidebar" title="Open sidebar">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><path d="M9 4v16M11.5 9l3 3-3 3" /></svg>
            </button>
            <Link className="lab-brand" href="/" aria-label="AI360 home">
              <img src="/icon-mark-black.png" alt="" className="brand-mark-light" />
              <img src="/icon-white.png" alt="" className="brand-mark-dark" />
              <span><b>AI360</b></span>
            </Link>
          </div>
          <div className="workspace-title"><b>{experience === 'studio' ? 'Projects' : 'Chats'}</b><small>{experience === 'studio' ? 'Build and improve lasting work' : experience === 'agent' ? 'Research is on' : 'Ask, write and research'}</small></div>
          <div className="lab-top-right">
          <CreditBalance signedIn={signedIn} busy={busy} />
          <AccountControls enabled={AUTH_ENABLED} />
          </div>
        </header>

        {experience === 'studio' ? (
          <StudioWorkspace
            initialBrief={initialStudioBrief}
            signedIn={signedIn}
            workspaceScope={workspaceScope}
            createSignal={createProjectSignal}
            homeSignal={projectsHomeSignal}
          />
        ) : experience === 'apps' ? (
          <AppsDirectory />
        ) : experience === 'media' ? (
          <MediaStudio />
        ) : (
          <>
          <ConversationMinimap
            prompts={conversationPrompts}
            scrollRootRef={scrollRef}
            showReturnToLatest={showReturnToLatest}
            onNavigateBack={pauseFollowLatest}
            onReturnToLatest={returnToLatest}
          />
          <main className="lab-main" ref={scrollRef} onScroll={updateFollowLatest}>
          {messages.length === 0 ? (
            <div className="lab-empty">
              <p className="eyebrow">One workspace, shaped around your goal</p>
              <h1>{experience === 'agent' ? modeMeta.heading : <>What can I help you<br />move forward?</>}</h1>
              <p className="intro">{experience === 'agent' ? modeMeta.intro : personalizedIntro(profile)}</p>
              <div className="task-grid">
                {(experience === 'agent' ? AGENT_TASKS : personalizedTasks(profile)).map((task) => (
                  <button
                    key={task.label}
                    onClick={() =>
                      experience === 'agent' || task.label.includes('document')
                        ? setInput(task.prompt)
                        : send(task.prompt)
                    }
                  >
                    <span><b>{task.label}</b><small>{task.prompt.replace(/\.$/, '')}</small></span>
                  </button>
                ))}
              </div>
              <div className="try-line"><span />Or just describe what you need<span /></div>
            </div>
          ) : (
            <>
            <div className="thread">
              {messages.map((message, index) => (
                <article
                  className={`message ${message.role}`}
                  id={`message-${message.id}`}
                  data-prompt-id={message.role === 'user' ? message.id : undefined}
                  key={message.id}
                >
                  <div className="avatar">
                    {message.role === 'assistant' ? (
                      <>
                        <img src="/icon-mark-black.png" alt="" className="brand-mark-light" />
                        <img src="/icon-white.png" alt="" className="brand-mark-dark" />
                      </>
                    ) : <span>You</span>}
                  </div>
                  <div className="message-body">
                    <span className="who">
                      {message.role === 'user' ? 'You' : message.agent ? 'AI360 Agent' : 'AI360'}
                    </span>
                    {message.attachments?.map((file) => (
                      <div className="message-file" key={file.name}>
                        {file.kind === 'image' && file.data ? (
                          <img src={file.data} alt={file.name} />
                        ) : file.kind === 'video' && file.data ? (
                          <video src={file.data} muted controls preload="metadata" aria-label={file.name} />
                        ) : (
                          <span>{file.kind === 'pdf' ? 'PDF' : file.kind === 'video' ? 'VID' : 'DOC'}</span>
                        )}
                        <b>{file.name}</b>
                      </div>
                    ))}
                    {message.agentPlan?.awaitingApproval ? (
                      <div className="agent-plan">
                        <div className="agent-plan-head">
                          <span><b>Here is the plan</b><small>Nothing runs and nothing is charged until you approve it.</small></span>
                          <span className="agent-plan-cost">about {message.agentPlan.estimatedCredits} credits</span>
                        </div>
                        <ol className="agent-plan-list">
                          {message.agentPlan.objectives.map((objective, index) => (
                            <li key={objective}><span>{String(index + 1).padStart(2, '0')}</span>{objective}</li>
                          ))}
                        </ol>
                        <div className="agent-plan-actions">
                          <button type="button" className="agent-plan-approve" disabled={busy} onClick={() => active && approvePlan(active.id, message)}>
                            Run this plan <span aria-hidden="true">↗</span>
                          </button>
                          <button type="button" className="agent-plan-discard" disabled={busy} onClick={() => active && discardPlan(active.id, message.id)}>
                            Discard
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {message.agentSteps?.length ? (
                      <details className="agent-run" open={!message.agentDone}>
                        <summary className="agent-run-head">
                          <span className={`activity-indicator ${message.agentDone ? 'complete' : ''}`} aria-hidden="true" />
                          <span>
                            <b>{message.agentDone
                              ? `Completed ${message.agentSteps.filter((step) => step.status === 'complete').length} steps`
                              : message.agentSteps.find((step) => step.status === 'active')?.label || 'Working...'}</b>
                            <small>{message.agentDone ? 'Open activity' : 'Live activity'}</small>
                          </span>
                          <span className="agent-run-chevron" aria-hidden="true">⌄</span>
                        </summary>
                        <div className="agent-steps">
                          {message.agentSteps.map((step, stepIndex) => (
                            <div className={`agent-step ${step.status}`} key={step.id}>
                              <span>{step.status === 'complete' ? '✓' : step.status === 'failed' ? '×' : String(stepIndex + 1).padStart(2, '0')}</span>
                              <span>{step.label}</span>
                            </div>
                          ))}
                          {message.agentActivity?.map((activity) => (
                            <div className="agent-step activity" key={`${activity.type}:${activity.createdAt}`}>
                              <span aria-hidden="true">·</span>
                              <span>{activity.summary}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                    {message.failure ? (
                      <section className="message-failure" role="alert" aria-label="Request could not be completed">
                        <div className="message-failure-head">
                          <span aria-hidden="true">!</span>
                          <span><b>This did not finish</b><small>{message.failure.message}</small></span>
                        </div>
                        <p>{message.failure.creditNotice}</p>
                        <div className="message-failure-actions">
                          {message.failure.retryable && index === messages.length - 1 ? (
                            <button type="button" className="failure-retry" onClick={() => regenerate(index)} disabled={busy}>
                              {busy ? 'Running…' : 'Run again'}
                            </button>
                          ) : null}
                          <button type="button" onClick={() => void copyFailedPrompt(index)}>
                            {copiedPromptId === [...messages.slice(0, index)].reverse().find((item) => item.role === 'user')?.id
                              ? 'Prompt copied'
                              : 'Copy prompt'}
                          </button>
                          <small>Reference: {message.failure.requestId}</small>
                        </div>
                      </section>
                    ) : message.content ? (
                      <ResponseContent content={message.content} />
                    ) : message.agentSteps?.length ? (
                      <span className="agent-wait">Working...</span>
                    ) : (
                      <span className="thinking">
                        <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>
                        <span>Working...</span>
                      </span>
                    )}
                    {message.sources?.length ? (
                      <details className="source-drawer">
                        <summary>{message.sources.length} source{message.sources.length === 1 ? '' : 's'} used</summary>
                        <div>
                          {message.sources.map((source, sourceIndex) => (
                            <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                              <span>{String(sourceIndex + 1).padStart(2, '0')}</span>
                              <span>{source.title}</span>
                              <span>↗</span>
                            </a>
                          ))}
                        </div>
                      </details>
                    ) : null}
                    {message.actions?.length ? (
                      <section className="action-center" aria-label="Suggested actions">
                        <div className="action-center-head">
                          <span>✓</span>
                          <span><b>Approval center</b><small>Nothing runs until you review and approve it.</small></span>
                        </div>
                        <div className="action-list">
                          {message.actions.map((action) => (
                            <button
                              key={action.id}
                              className={action.status}
                              onClick={() => action.status === 'proposed' && reviewAction(message.id, action)}
                              disabled={action.status === 'completed'}
                            >
                              <span className="action-kind">{action.kind === 'email' ? 'Aa' : action.kind === 'calendar' ? '□' : '✓'}</span>
                              <span><b>{action.title}</b><small>{action.result || action.description}</small></span>
                              <span className="action-state">{action.status === 'completed' ? 'Done' : 'Review'}</span>
                            </button>
                          ))}
                        </div>
                      </section>
                    ) : null}
                    {message.role === 'assistant' && message.content && !message.failure && (
                      <ResponseActions
                        content={message.content}
                        canListen={Boolean(browserSpeechLocale(responseLanguage))}
                        canRetry={index === messages.length - 1}
                        busy={busy}
                        onListen={() => speak(message.content)}
                        onRetry={() => regenerate(index)}
                        feedback={(
                          <QualityFeedback
                            context={{
                              sourceSurface: message.agent ? 'research' : 'quick',
                              conversationId: active.id,
                              messageId: message.id,
                              requestId: message.requestId,
                              runId: message.agentRunId,
                              responseText: message.content,
                              conversationText: messages.slice(Math.max(0, index - 5), index + 1)
                                .map((item) => `${item.role === 'user' ? 'Customer' : 'AI360'}: ${item.content}`)
                                .join('\n\n'),
                            }}
                          />
                        )}
                      />
                    )}
                  </div>
                </article>
              ))}
            </div>
            </>
          )}
          </main>

          <PromptComposer
            experience={experience}
            input={input}
            busy={busy}
            textareaRef={taRef}
            fileInputRef={fileRef}
            attachment={attachment}
            fileError={fileError}
            recordingState={recordingState}
            recordingSeconds={recordingSeconds}
            recordingUrl={recordingUrl}
            voiceNotice={voiceNotice}
            responseLanguage={responseLanguage}
            researchDepth={agentDepth}
            planFirst={planFirst}
            onInputChange={setInput}
            onSubmit={() => send(input)}
            onFile={(file) => void handleFile(file)}
            onRemoveAttachment={() => setAttachment(null)}
            onToggleRecording={() => void toggleRecording()}
            onTranscribeRecording={() => void transcribeRecording()}
            onDiscardRecording={discardRecording}
            onLanguageChange={setResponseLanguage}
            onResearchDepthChange={setAgentDepth}
            onPlanFirstChange={setPlanFirst}
          />
          </>
        )}
      </section>
      {helpOpen && (
        <div className="workspace-guide-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setHelpOpen(false)}>
          <section className="workspace-guide" role="dialog" aria-modal="true" aria-labelledby="workspace-guide-title">
            <header>
              <div><span>AI360 help</span><h2 id="workspace-guide-title">Start with what you need.</h2></div>
              <button type="button" onClick={() => setHelpOpen(false)} aria-label="Close help">×</button>
            </header>
            <p>You do not need to choose a model or learn prompt formulas. Describe the outcome in ordinary words and AI360 chooses the lightest useful path.</p>
            <div className="workspace-guide-options">
              <button type="button" onClick={() => { setHelpOpen(false); selectExperience('chat') }}><span>01</span><b>Ask or write</b><small>Answers, explanations, rewriting and everyday thinking.</small></button>
              <button type="button" onClick={() => { setHelpOpen(false); selectExperience('agent') }}><span>02</span><b>Research</b><small>Current sources, comparison and checked findings.</small></button>
              <button type="button" onClick={() => { setHelpOpen(false); selectExperience('studio') }}><span>03</span><b>Start a project</b><small>A guided brief, staged work and reusable deliverables.</small></button>
            </div>
            <footer><span>AI360 never publishes or sends work without your approval.</span><Link href="/how-it-works">Read the full guide</Link></footer>
          </section>
        </div>
      )}
      {actionDraft && (
        <div className="approval-backdrop" role="presentation">
          <section className="approval-dialog" role="dialog" aria-modal="true" aria-labelledby="approval-title">
            <div className="approval-head">
              <span className="approval-mark">✓</span>
              <span><b id="approval-title">Review before approval</b><small>{actionDraft.title}</small></span>
              <button onClick={() => setActionDraft(null)} aria-label="Close approval dialog">×</button>
            </div>
            <div className="approval-body">
              <div className="approval-notice">
                <b>No silent actions</b>
                <span>
                  {actionDraft.kind === 'email'
                    ? 'This opens a draft in your email app. AI360 will not send it.'
                    : actionDraft.kind === 'calendar'
                      ? 'This downloads a calendar invite for you to review and import.'
                      : 'This saves the task with this conversation.'}
                </span>
              </div>
              {actionDraft.kind === 'email' && (
                <>
                  <label>Recipient <span>Optional</span><input type="email" value={actionDraft.payload.recipient || ''} onChange={(event) => updateActionDraft('recipient', event.target.value)} placeholder="name@example.com" /></label>
                  <label>Subject<input value={actionDraft.payload.subject || ''} onChange={(event) => updateActionDraft('subject', event.target.value)} /></label>
                  <label>Message<textarea rows={8} value={actionDraft.payload.body || ''} onChange={(event) => updateActionDraft('body', event.target.value)} /></label>
                </>
              )}
              {actionDraft.kind === 'calendar' && (
                <>
                  <label>Event title<input value={actionDraft.payload.title || ''} onChange={(event) => updateActionDraft('title', event.target.value)} /></label>
                  <div className="approval-row">
                    <label>Starts<input type="datetime-local" value={actionDraft.payload.start || ''} onChange={(event) => updateActionDraft('start', event.target.value)} /></label>
                    <label>Duration<select value={actionDraft.payload.durationMinutes || 60} onChange={(event) => updateActionDraft('durationMinutes', Number(event.target.value))}><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={90}>90 minutes</option><option value={120}>2 hours</option></select></label>
                  </div>
                  <label>Notes<textarea rows={6} value={actionDraft.payload.notes || ''} onChange={(event) => updateActionDraft('notes', event.target.value)} /></label>
                </>
              )}
              {actionDraft.kind === 'task' && (
                <>
                  <label>Task title<input value={actionDraft.payload.title || ''} onChange={(event) => updateActionDraft('title', event.target.value)} /></label>
                  <label>Notes<textarea rows={7} value={actionDraft.payload.notes || ''} onChange={(event) => updateActionDraft('notes', event.target.value)} /></label>
                </>
              )}
              {actionError && <p className="approval-error">{actionError}</p>}
            </div>
            <div className="approval-foot">
              <button className="approval-cancel" onClick={() => setActionDraft(null)} disabled={actionBusy}>Cancel</button>
              <button className="approval-confirm" onClick={approveAction} disabled={actionBusy}>
                {actionBusy ? 'Preparing…' : actionDraft.kind === 'email' ? 'Approve and open draft' : actionDraft.kind === 'calendar' ? 'Approve and create invite' : 'Approve and save task'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
