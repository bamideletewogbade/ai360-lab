'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { MODEL_OPTIONS, type ChatMode } from '@/lib/models'
import { ResponseContent } from '@/components/ResponseContent'
import { DEFAULT_LANGUAGE, findLanguage, LANGUAGES, type LanguageCode } from '@/lib/languages'
import { StudioWorkspace } from '@/components/StudioWorkspace'
import { AccountControls } from '@/components/AccountControls'
import { WorkspaceOnboarding, type OnboardingChoice } from '@/components/WorkspaceOnboarding'
import { WorkspaceBoot } from '@/components/WorkspaceBoot'
import { useAuth } from '@clerk/nextjs'
import { scopedStorageKey } from '@/lib/workspace'

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
}
type Experience = 'chat' | 'agent' | 'studio'
type AgentStep = { id: string; label: string; status: 'pending' | 'active' | 'complete' | 'failed' }
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
const ONBOARDING_KEY = 'ai360-lab-onboarding-v1'
const MAX_FILE_BYTES = 4 * 1024 * 1024
const MAX_VIDEO_BYTES = 8 * 1024 * 1024

const TASKS = [
  { icon: 'Aa', label: 'Write an SMS', prompt: 'Draft a friendly SMS reminding parents about PTA this Friday at 3pm.' },
  { icon: '≡', label: 'Summarize a document', prompt: 'Summarize this document into key points and clear next steps.' },
  { icon: '↗', label: 'Draft a proposal', prompt: 'Write a short business proposal for a smoothie stand in Accra.' },
  { icon: '✓', label: 'Plan my week', prompt: 'Help me build a practical plan for my week. Ask what commitments and priorities I have.' },
]
const AGENT_TASKS = [
  { icon: '⌕', label: 'Research and report', prompt: 'Research this topic using reliable current sources and create a concise report with practical recommendations: ' },
  { icon: '⇄', label: 'Compare documents', prompt: 'Compare the attached documents, identify the important differences, and recommend the best next steps.' },
  { icon: 'Aa', label: 'Create a proposal', prompt: 'Research what is needed and create a practical, professional proposal for: ' },
  { icon: '✓', label: 'Build an action plan', prompt: 'Turn this outcome into a researched, step-by-step action plan with priorities, risks and next actions: ' },
]

const MODE_META: Record<Experience, {
  label: string
  short: string
  description: string
  eyebrow: string
  heading: ReactNode
  intro: string
  mark: string
}> = {
  chat: {
    label: 'Ask',
    short: 'Think, write and learn',
    description: 'Answers & ideas',
    eyebrow: 'Everyday intelligence',
    heading: <>Turn a thought into<br />something useful.</>,
    intro: 'Ask a question, shape an idea, or bring a task. AI 360 chooses the right intelligence and helps you move forward.',
    mark: 'A',
  },
  agent: {
    label: 'Agent',
    short: 'Research and execute',
    description: 'Research & action',
    eyebrow: 'Outcome-focused agent',
    heading: <>Give us the outcome.<br />We will work the steps.</>,
    intro: 'Set a goal and let AI 360 research the web, inspect your materials, reason through the work and return a checked deliverable.',
    mark: '✦',
  },
  studio: {
    label: 'Build',
    short: 'Create business assets',
    description: 'Campaign studio',
    eyebrow: 'AI 360 production studio',
    heading: <>Build the assets that<br />move your business.</>,
    intro: 'Go from a brand brief to a coordinated launch pack, then review, refine, approve and produce each asset.',
    mark: '◆',
  },
}

const ACTIVITY_STATUS: Record<'chat' | 'agent', Array<{ label: string; detail: string }>> = {
  chat: [
    { label: 'Focused analysis', detail: 'Understanding what matters most' },
    { label: 'Useful exploration', detail: 'Checking the strongest direction' },
    { label: 'Clear synthesis', detail: 'Shaping an answer you can use' },
    { label: 'Final polish', detail: 'Making every line easier to follow' },
  ],
  agent: [
    { label: 'Focused planning', detail: 'Breaking the outcome into useful steps' },
    { label: 'Live investigation', detail: 'Finding and checking relevant evidence' },
    { label: 'Careful comparison', detail: 'Testing options against your goal' },
    { label: 'Practical synthesis', detail: 'Preparing a complete deliverable' },
  ],
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function freshConversation(): Conversation {
  return { id: makeId(), title: 'New conversation', messages: [], updatedAt: Date.now(), model: 'auto', experience: 'chat' }
}

function titleFrom(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 38 ? `${clean.slice(0, 38)}…` : clean || 'New conversation'
}

function experienceForPrompt(prompt: string): Experience {
  const value = prompt.toLowerCase()
  if (/campaign|brand|logo|flyer|social media|promotion|promotional video|launch pack/.test(value)) return 'studio'
  if (/research|compare|investigate|latest|current|market|sources|report|proposal/.test(value)) return 'agent'
  return 'chat'
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function readTextStream(response: Response, onText: (text: string) => void) {
  if (!response.body) throw new Error('No response stream')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let accumulated = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    accumulated += decoder.decode(value, { stream: true })
    onText(accumulated)
  }
}

type AgentEvent =
  | { type: 'run'; runId: string; recoverable: boolean }
  | { type: 'step'; id: string; label: string; status: 'pending' | 'active' | 'complete' | 'failed' }
  | { type: 'delta'; text: string; reset?: boolean }
  | { type: 'plan'; objectives: string[]; depth: AgentDepth; awaitingApproval: boolean; estimatedCredits: number }
  | { type: 'result'; content: string; sources?: SourceLink[]; actions?: AgentAction[]; usage?: { totalTokens?: number; cost?: number } }
  | { type: 'error'; message: string }

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
 * The three things the Lab does, in the order people need them.
 *
 * This is the only control that changes what the whole workspace is, so it
 * lives in one place and is described the same way everywhere.
 */
const EXPERIENCES: Array<{
  id: Experience
  mark: string
  label: string
  caption: string
  hint: string
}> = [
  { id: 'chat', mark: 'A', label: 'Quick', caption: 'Answers and ideas', hint: 'Ask anything. Fastest and cheapest.' },
  { id: 'agent', mark: '✦', label: 'Research', caption: 'Current and sourced', hint: 'Searches the live web and cites what it used.' },
  { id: 'studio', mark: '◆', label: 'Create', caption: 'Projects and assets', hint: 'Build a campaign, brand or set of assets.' },
]

/** Sidebar grouping. A campaign project is not the same kind of thing as a chat. */
const SIDEBAR_GROUPS: Array<{
  id: string
  label: string
  mark: string
  match: (experience?: Experience) => boolean
}> = [
  { id: 'projects', label: 'Projects', mark: '◆', match: (experience) => experience === 'studio' },
  { id: 'conversations', label: 'Conversations', mark: '✦', match: (experience) => experience !== 'studio' },
]

const AGENT_DEPTH_HINTS: Record<AgentDepth, string> = {
  quick: 'One line of enquiry, no checking pass. Fastest and cheapest.',
  standard: 'Up to two lines of enquiry, then checked against the sources.',
  thorough: 'Up to three lines of enquiry, then checked and corrected.',
}

const AUTH_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

export default function LabPage() {
  return AUTH_ENABLED ? <AuthenticatedLab /> : <LabWorkspace authLoaded signedIn={false} workspaceScope="guest" />
}

function AuthenticatedLab() {
  const { isLoaded, isSignedIn, userId, orgId } = useAuth()
  const workspaceScope = isSignedIn && userId
    ? orgId ? `org:${orgId}` : `user:${userId}`
    : 'guest'
  return <LabWorkspace authLoaded={isLoaded} signedIn={Boolean(isSignedIn)} workspaceScope={workspaceScope} />
}

function LabWorkspace({
  authLoaded,
  signedIn,
  workspaceScope,
}: {
  authLoaded: boolean
  signedIn: boolean
  workspaceScope: string
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
  const [language, setLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE)
  const [languageOpen, setLanguageOpen] = useState(false)
  const recovering = useRef(new Set<string>())
  const [hydrated, setHydrated] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [fileError, setFileError] = useState('')
  const [statusIndex, setStatusIndex] = useState(0)
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'recorded' | 'transcribing'>('idle')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null)
  const [recordingUrl, setRecordingUrl] = useState('')
  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [cloudReady, setCloudReady] = useState(false)
  const [cloudStatus, setCloudStatus] = useState<'local' | 'loading' | 'synced' | 'unavailable'>('local')
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [initialStudioBrief, setInitialStudioBrief] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const loadedWorkspaceRef = useRef('')
  const cloudWorkspaceRef = useRef('')

  const workspaceStorageKey = scopedStorageKey(STORAGE_KEY, workspaceScope)
  const workspaceActiveKey = scopedStorageKey(ACTIVE_KEY, workspaceScope)

  const active = conversations.find((conversation) => conversation.id === activeId) ?? conversations[0]
  const messages = useMemo(() => active?.messages ?? [], [active])
  const selectedModel = active?.model ?? 'auto'
  const experience = active?.experience ?? 'chat'
  const modeMeta = MODE_META[experience]

  useEffect(() => {
    if (!authLoaded) return
    let mounted = true
    loadedWorkspaceRef.current = ''
    queueMicrotask(() => {
      if (!mounted) return
      try {
        const saved = JSON.parse(localStorage.getItem(workspaceStorageKey) || '[]') as Conversation[]
        const next = saved.length ? saved : [freshConversation()]
        const savedActive = localStorage.getItem(workspaceActiveKey)
        setConversations(next)
        setActiveId(next.some((item) => item.id === savedActive) ? savedActive! : next[0].id)
      } catch {
        const next = freshConversation()
        setConversations([next])
        setActiveId(next.id)
      }
      loadedWorkspaceRef.current = workspaceScope
      setHydrated(true)
    })
    return () => {
      mounted = false
    }
  }, [authLoaded, workspaceActiveKey, workspaceScope, workspaceStorageKey])

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
        void send(incomingPrompt, null, [], nextExperience, handoffConversation)
      } else {
        selectExperience(nextExperience)
      }
      localStorage.setItem(ONBOARDING_KEY, 'complete')
      window.history.replaceState(null, '', '/app')
      return
    }

    if (!localStorage.getItem(ONBOARDING_KEY)) setOnboardingOpen(true)
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
    if (messages.length) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    } else {
      scrollRef.current?.scrollTo({ top: 0 })
    }
  }, [messages, busy])

  useEffect(() => {
    if (!busy) return
    const timer = window.setInterval(() => setStatusIndex((index) => (index + 1) % ACTIVITY_STATUS.chat.length), 2100)
    return () => window.clearInterval(timer)
  }, [busy])

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
      .filter((conversation) => !query || conversation.title.toLowerCase().includes(query))
  }, [conversations, search])

  function updateActive(updater: (conversation: Conversation) => Conversation) {
    setConversations((items) => items.map((item) => (item.id === activeId ? updater(item) : item)))
  }

  function grow() {
    const textarea = taRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
  }

  function newChat() {
    const next = freshConversation()
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
      const dataUrl = await fileToDataUrl(recordingBlob)
      const format = recordingBlob.type.includes('ogg')
        ? 'ogg'
        : recordingBlob.type.includes('mp4')
          ? 'm4a'
          : recordingBlob.type.includes('mpeg')
            ? 'mp3'
            : 'webm'
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
        body: JSON.stringify({ data: dataUrl.split(',')[1], format }),
      })
      const result = await response.json()
      if (!response.ok || typeof result.text !== 'string') {
        const reference = result.requestId || response.headers.get('X-Request-Id') || requestId
        throw new Error(`${result.error || 'Transcription failed'} Reference: ${reference}`)
      }
      setInput((current) => [current.trim(), result.text.trim()].filter(Boolean).join(' '))
      discardRecording()
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
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`]/g, ''))
    utterance.rate = 0.98
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
          result = 'Task saved locally'
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
              return { ...message, content: event.reset ? event.text : message.content + event.text }
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
                agentDone: true,
                agentPlan: message.agentPlan ? { ...message.agentPlan, awaitingApproval: false } : undefined,
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
   * A conversation carries its runs with it, so reopening the Lab is enough to
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
          language,
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
    const currentExperience = experienceOverride ?? targetConversation.experience ?? 'chat'
    const placeholder: Msg = {
      id: makeId(),
      role: 'assistant',
      content: '',
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
    setStatusIndex(0)
    if (taRef.current) taRef.current.style.height = 'auto'

    try {
      const requestId = crypto.randomUUID()
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
          language,
          sessionId: requestConversationId,
          ...(currentExperience === 'agent' ? { depth: agentDepth, planOnly: planFirst } : {}),
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        const reference = res.headers.get('X-Request-Id') || requestId
        throw new Error(
          `${typeof detail.error === 'string' ? detail.error : 'The request could not be completed.'} Reference: ${reference}`,
        )
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
        await readTextStream(res, (accumulated) => {
          setConversations((items) =>
            items.map((item) =>
              item.id === requestConversationId
                ? {
                    ...item,
                    messages: item.messages.map((message) =>
                      message.id === placeholder.id ? { ...message, content: accumulated } : message,
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
                        content: error instanceof Error
                          ? error.message
                          : 'Something went wrong. Please try again.',
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
    const prior = messages.slice(0, index)
    const lastUserIndex = prior.map((message) => message.role).lastIndexOf('user')
    if (lastUserIndex < 0) return
    const user = prior[lastUserIndex]
    send(user.content, user.attachments?.[0] ?? null, prior.slice(0, lastUserIndex))
  }

  function selectModel(mode: ChatMode) {
    updateActive((conversation) => ({ ...conversation, model: mode, updatedAt: Date.now() }))
    setModelOpen(false)
  }

  function selectExperience(nextExperience: Experience) {
    if (busy) return
    updateActive((conversation) => ({
      ...conversation,
      experience: nextExperience,
      updatedAt: Date.now(),
    }))
  }

  function completeOnboarding(choice?: OnboardingChoice) {
    localStorage.setItem(ONBOARDING_KEY, 'complete')
    setOnboardingOpen(false)
    if (!choice) return
    selectExperience(choice.mode)
    if (choice.mode === 'studio') setInitialStudioBrief(choice.prompt)
    else setInput(choice.prompt)
  }

  if (!hydrated || !active) return <WorkspaceBoot authLoaded={authLoaded} signedIn={signedIn} />

  return (
    <div className="lab-shell">
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="side-head">
          <img src="/logo-white.png" alt="AI Three Sixty" className="wordmark" />
          <button className="icon-button close-side" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">×</button>
        </div>
        <button className="new-chat" onClick={newChat}><span>＋</span><span>Start something</span></button>
        <label className="history-search">
          <span>⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats" />
        </label>
        {/* Projects and conversations are different objects with different
            lifespans, so they are listed separately instead of interleaved in
            one undifferentiated list. */}
        <nav className="history-list">
          {SIDEBAR_GROUPS.map((group) => {
            const items = visibleConversations.filter((conversation) => group.match(conversation.experience))
            if (!items.length) return null
            return (
              <div className="history-group" key={group.id}>
                <div className="history-label">{group.label}<span>{items.length}</span></div>
                {items.map((conversation) => (
                  <div className={`history-item${conversation.id === active.id ? ' active' : ''}`} key={conversation.id}>
                    <button className="history-main" onClick={() => { setActiveId(conversation.id); setSidebarOpen(false) }}>
                      <span className="history-spark">{group.mark}</span>
                      <span>{conversation.title}</span>
                    </button>
                    <button className="history-more" onClick={() => renameChat(conversation.id)} title="Rename">✎</button>
                    <button className="history-more delete" onClick={() => deleteChat(conversation.id)} title="Delete">×</button>
                  </div>
                ))}
              </div>
            )
          })}
          {!visibleConversations.length && (
            <p className="no-results">{search ? 'Nothing matches that search.' : 'Nothing here yet. Start something above.'}</p>
          )}
        </nav>
        <div className="side-foot" aria-live="polite">
          <div className={`privacy-dot ${signedIn ? cloudStatus : 'local'}`}><span /></div>
          <div>
            <b>{signedIn ? 'Private workspace' : 'Saved on this device'}</b>
            <span>{signedIn
              ? cloudStatus === 'synced' ? 'Synced securely.' : cloudStatus === 'loading' ? 'Connecting cloud sync...' : 'Saved locally. Cloud sync unavailable.'
              : 'Sign in to sync across devices.'}</span>
          </div>
        </div>
      </aside>
      {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />}

      <section className={`workspace ${experience}`}>
        {/* Three zones: identity on the left, the one control that changes
            everything in the middle, account and settings on the right. The
            capability chip moved down to the composer, where it describes the
            thing the person is about to use rather than competing with it. */}
        <header className="lab-top">
          <div className="lab-top-left">
            <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open conversations">☰</button>
            <Link className="lab-brand" href="/" aria-label="AI 360 Lab home">
              <img src="/icon-mark-black.png" alt="" />
              <span><b>AI 360</b> LAB</span>
            </Link>
          </div>
          <div className="experience-switch" role="group" aria-label="What do you want to do">
            {EXPERIENCES.map((option) => (
              <button
                key={option.id}
                className={`${option.id === 'chat' ? '' : option.id} ${experience === option.id ? 'active' : ''}`.trim()}
                onClick={() => selectExperience(option.id)}
                aria-pressed={experience === option.id}
                title={option.hint}
              >
                <span className="mode-mark">{option.mark}</span>
                <span className="mode-copy"><b>{option.label}</b><small>{option.caption}</small></span>
              </button>
            ))}
          </div>
          <div className="lab-top-right">
          {experience !== 'studio' && <div className="model-picker">
            <button className="model-trigger" onClick={() => setModelOpen((open) => !open)} aria-expanded={modelOpen}>
              <span className="status-dot" />
              {MODEL_OPTIONS[selectedModel].shortLabel}
              <span className="chevron">⌄</span>
            </button>
            {modelOpen && (
              <div className="model-menu">
                <div className="model-menu-title">Choose a model</div>
                {(Object.keys(MODEL_OPTIONS) as ChatMode[]).map((mode) => (
                  <button key={mode} className={mode === selectedModel ? 'selected' : ''} onClick={() => selectModel(mode)}>
                    <span className="model-check">{mode === selectedModel ? '✓' : ''}</span>
                    <span><b>{MODEL_OPTIONS[mode].label}</b><small>{MODEL_OPTIONS[mode].description}</small></span>
                  </button>
                ))}
              </div>
            )}
          </div>}
          {experience !== 'studio' && (
            <button className="new-top" onClick={newChat}><span>＋</span><span className="hide-mobile">New chat</span></button>
          )}
          <AccountControls enabled={AUTH_ENABLED} />
          </div>
        </header>

        {experience === 'studio' ? (
          <StudioWorkspace
            initialBrief={initialStudioBrief}
            signedIn={signedIn}
            workspaceScope={workspaceScope}
          />
        ) : (
          <>
          <main className="lab-main" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="lab-empty">
              <div className="sparkle-field" aria-hidden="true"><i>✦</i><i>✦</i><i>✦</i><i>✦</i><i>✦</i></div>
              <img src="/icon-mark-black.png" alt="" className="hero-icon" />
              <p className="eyebrow"><span>✦</span>{modeMeta.eyebrow}</p>
              <h1>{modeMeta.heading}</h1>
              <p className="intro">{modeMeta.intro}</p>
              <div className="capability-strip" aria-label="AI 360 capabilities">
                <span><i>01</i><b>Current</b><small>Searches the live web</small></span>
                <span><i>02</i><b>Multimodal</b><small>Reads files and media</small></span>
                <span><i>03</i><b>Ready to use</b><small>Exports polished work</small></span>
              </div>
              <div className="task-grid">
                {(experience === 'agent' ? AGENT_TASKS : TASKS).map((task) => (
                  <button
                    key={task.label}
                    onClick={() =>
                      experience === 'agent' || task.label.includes('document')
                        ? setInput(task.prompt)
                        : send(task.prompt)
                    }
                  >
                    <span className="task-icon">{task.icon}</span>
                    <span><b>{task.label}</b><small>{task.prompt.replace(/\.$/, '')}</small></span>
                    <span className="task-arrow">↗</span>
                  </button>
                ))}
              </div>
              <div className="try-line"><span />Choose a starting point or describe your own<span /></div>
            </div>
          ) : (
            <>
            <div className="thread-context">
              <div className={`context-mark ${experience}`}>{modeMeta.mark}</div>
              <div><span>{modeMeta.label} workspace</span><b>{active.title}</b></div>
              <small>{messages.length} message{messages.length === 1 ? '' : 's'} · {modeMeta.short}</small>
            </div>
            <div className="thread">
              {messages.map((message, index) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <div className="avatar">
                    {message.role === 'assistant' ? <img src="/icon-mark-black.png" alt="" /> : <span>You</span>}
                  </div>
                  <div className="message-body">
                    <span className="who">
                      {message.role === 'user' ? 'You' : message.agent ? 'AI 360 Agent' : 'AI 360 Lab'}
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
                      <div className="agent-run">
                        <div className="agent-run-head">
                          <span className="agent-orbit">✦</span>
                          <span><b>Agent run</b><small>{message.agentDone ? 'Completed' : 'Working through the task'}</small></span>
                        </div>
                        <div className="agent-steps">
                          {message.agentSteps.map((step) => (
                            <div className={`agent-step ${step.status}`} key={step.id}>
                              <span>{step.status === 'complete' ? '✓' : step.status === 'failed' ? '×' : step.status === 'pending' ? '·' : '✦'}</span>
                              <span>{step.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {message.content ? (
                      <ResponseContent content={message.content} />
                    ) : message.agentSteps?.length ? (
                      <span className="agent-wait">The agent is working. You can continue browsing this conversation.</span>
                    ) : (
                      <span className="thinking">
                        <span className="thinking-spark">✦</span>
                        <span className="thinking-copy">
                          <b>{ACTIVITY_STATUS.chat[statusIndex]?.label}</b>
                          <small>{ACTIVITY_STATUS.chat[statusIndex]?.detail}</small>
                        </span>
                        <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>
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
                    {message.role === 'assistant' && message.content && (
                      <div className="message-actions">
                        <button onClick={() => navigator.clipboard.writeText(message.content)} title="Copy">□ <span>Copy</span></button>
                        <button onClick={() => speak(message.content)} title="Read aloud">◖ <span>Listen</span></button>
                        <button onClick={() => regenerate(index)} disabled={busy} title="Regenerate">↻ <span>Try again</span></button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
            </>
          )}
          </main>

          <div className="composer-zone">
          <div className={`composer${recordingState === 'recording' ? ' recording' : ''}`}>
            {recordingState !== 'idle' && (
              <div className={`voice-capture ${recordingState}`}>
                {recordingState === 'recording' ? (
                  <>
                    <span className="recording-pulse" />
                    <span className="voice-state"><b>Recording voice</b><small>{formatDuration(recordingSeconds)} / 5:00</small></span>
                    <div className="voice-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
                    <button className="voice-stop" onClick={toggleRecording}>Stop</button>
                  </>
                ) : (
                  <>
                    <span className="recording-icon">◉</span>
                    <audio src={recordingUrl} controls preload="metadata" aria-label="Voice recording preview" />
                    <span className="voice-state"><b>{recordingState === 'transcribing' ? 'Transcribing…' : 'Voice note ready'}</b><small>{formatDuration(recordingSeconds)}</small></span>
                    <button className="voice-transcribe" onClick={transcribeRecording} disabled={recordingState === 'transcribing'}>
                      {recordingState === 'transcribing' ? 'Working…' : 'Use transcript'}
                    </button>
                    <button className="voice-delete" onClick={discardRecording} disabled={recordingState === 'transcribing'} aria-label="Delete recording">×</button>
                  </>
                )}
              </div>
            )}
            {attachment && (
              <div className="attachment-preview">
                {attachment.kind === 'image' && attachment.data ? (
                  <img src={attachment.data} alt="" />
                ) : attachment.kind === 'video' && attachment.data ? (
                  <video src={attachment.data} muted preload="metadata" aria-label={attachment.name} />
                ) : (
                  <span>{attachment.kind === 'pdf' ? 'PDF' : attachment.kind === 'video' ? 'VID' : 'DOC'}</span>
                )}
                <div><b>{attachment.name}</b><small>Ready to send</small></div>
                <button onClick={() => setAttachment(null)} aria-label="Remove file">×</button>
              </div>
            )}
            <textarea
              ref={taRef}
              rows={1}
              placeholder={
                recordingState === 'recording'
                  ? 'Recording your voice…'
                  : experience === 'agent'
                    ? 'Describe an outcome you want completed…'
                    : 'Ask anything, or describe what you need…'
              }
              value={input}
              onChange={(event) => { setInput(event.target.value); grow() }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send(input)
                }
              }}
            />
            <div className="composer-tools">
              <input
                ref={fileRef}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf,text/plain,text/markdown,text/csv,application/json"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
              <button onClick={() => fileRef.current?.click()} title="Attach an image, video or document" aria-label="Attach file">＋</button>
              <button className={recordingState === 'recording' ? 'active' : ''} onClick={toggleRecording} title="Record your voice" aria-label="Record voice">●</button>
              <div className="language-picker">
                <button
                  className={`language-trigger${language === DEFAULT_LANGUAGE ? '' : ' chosen'}`}
                  onClick={() => setLanguageOpen((open) => !open)}
                  aria-expanded={languageOpen}
                  aria-label={`Language: ${findLanguage(language).name}`}
                  title="Ask and get answers in your own language"
                >
                  {findLanguage(language).nativeName}
                  <span className="chevron">⌄</span>
                </button>
                {languageOpen && (
                  <div className="language-menu">
                    <div className="language-menu-title">Answer me in</div>
                    {LANGUAGES.map((option) => (
                      <button
                        key={option.code}
                        className={option.code === language ? 'selected' : ''}
                        onClick={() => { setLanguage(option.code); setLanguageOpen(false) }}
                      >
                        <span className="language-check">{option.code === language ? '✓' : ''}</span>
                        <span><b>{option.nativeName}</b><small>{option.sample}</small></span>
                      </button>
                    ))}
                    <p className="language-note">Write in any of these and it replies the same way, whatever is selected.</p>
                  </div>
                )}
              </div>
              {experience === 'agent' ? (
                <div className="agent-controls">
                  <div className="agent-depth" role="group" aria-label="How thorough the agent should be">
                    {(['quick', 'standard', 'thorough'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={agentDepth === option ? 'active' : ''}
                        aria-pressed={agentDepth === option}
                        onClick={() => setAgentDepth(option)}
                        title={AGENT_DEPTH_HINTS[option]}
                      >
                        {option[0].toUpperCase() + option.slice(1)}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={`agent-plan-toggle ${planFirst ? 'active' : ''}`}
                    aria-pressed={planFirst}
                    onClick={() => setPlanFirst((value) => !value)}
                    title="See the plan and approve it before any credits are spent on the work"
                  >
                    {planFirst ? '✓ ' : ''}Plan first
                  </button>
                </div>
              ) : (
                <span className="tool-label">
                  {attachment ? 'File attached' : 'Add a file or record your voice'}
                  <span className="web-ready" title="AI 360 searches and reads current web pages when accuracy depends on today">
                    <i /> Live intelligence
                  </span>
                </span>
              )}
              <button
                className="send"
                onClick={() => send(input)}
                disabled={
                  busy ||
                  recordingState === 'recording' ||
                  recordingState === 'transcribing' ||
                  (!input.trim() && !attachment)
                }
                aria-label="Send message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>
          {fileError && <div className="file-error">{fileError}</div>}
          <div className="composer-note">
            AI can make mistakes. Check important information.
            <span>Built with care by AI 360 · Accra Innovation Center</span>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
          </div>
          </>
        )}
      </section>
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
                    ? 'This opens a draft in your email app. AI 360 will not send it.'
                    : actionDraft.kind === 'calendar'
                      ? 'This downloads a calendar invite for you to review and import.'
                      : 'This saves the task only inside this browser conversation.'}
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
      {onboardingOpen && <WorkspaceOnboarding onChoose={completeOnboarding} onSkip={() => completeOnboarding()} />}
    </div>
  )
}
