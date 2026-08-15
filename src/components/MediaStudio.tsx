'use client'

import { useEffect, useRef, useState } from 'react'

type MediaKind = 'image' | 'video'
type StudioIconName = 'spark' | 'image' | 'video' | 'library' | 'workspace' | 'product' | 'city' | 'mark'
type MediaItem = {
  id: string
  kind: MediaKind
  prompt: string
  aspectRatio: string
  styleName: string
  url: string
  poster?: string
  createdAt: string
}

const DEMO_GALLERY: MediaItem[] = [
  {
    id: 'media-1',
    kind: 'video',
    prompt: 'Abstract cinematic warm light ribbons drifting across a charcoal backdrop, a premium brand motion loop rendered from a single prompt.',
    aspectRatio: '16:9',
    styleName: 'Seedance Motion Loop',
    url: '/studio-hero-loop.mp4',
    poster: '/studio-creative.png',
    createdAt: 'Example',
  },
  {
    id: 'media-2',
    kind: 'image',
    prompt: 'Hyper-realistic cinematic portrait of an African tech founder with floating holographic AI dashboards in a golden-hour Accra high-rise.',
    aspectRatio: '16:9',
    styleName: 'Cinematic Photoreal 8K',
    url: '/studio-hero.png',
    createdAt: 'Example',
  },
  {
    id: 'media-3',
    kind: 'image',
    prompt: 'Minimalist luxury packaging for organic hibiscus and ginger tea on polished cream marble, soft studio sunlight, gold foil detail.',
    aspectRatio: '1:1',
    styleName: 'Studio Product Photography',
    url: '/studio-product.png',
    createdAt: 'Example',
  },
  {
    id: 'media-4',
    kind: 'image',
    prompt: 'Abstract flowing warm golden light ribbons over a matte charcoal background, a premium brand texture with a sense of creative energy.',
    aspectRatio: '16:9',
    styleName: '3D Hyper-Render',
    url: '/studio-creative.png',
    createdAt: 'Example',
  },
]

const PROMPT_SUGGESTIONS = [
  { icon: 'workspace', label: 'Tech Founder Workspace', text: 'A futuristic tech founder working with glowing holographic AI interfaces in a high-rise Accra office, cinematic 8k.' },
  { icon: 'product', label: 'Luxury Brand Pack', text: 'Minimalist luxury product packaging for organic hibiscus tea on a marble pedestal, soft studio sunlight.' },
  { icon: 'city', label: 'Sunset Drone Shot', text: 'Cinematic wide drone flyover of Accra skyline at golden hour sunset with modern glass skyscrapers.' },
  { icon: 'mark', label: 'Minimalist Studio Logo', text: 'Modern minimalist vector logo for an AI creative studio, obsidian background, clean gold geometry.' },
] satisfies Array<{ icon: StudioIconName; label: string; text: string }>

function StudioIcon({ name }: { name: StudioIconName }) {
  if (name === 'image') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m5 18 5-5 3.2 3.2 2.2-2.2 3.6 4" /></svg>
  if (name === 'video') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="13" height="14" rx="2" /><path d="m16.5 10 4-2v8l-4-2" /></svg>
  if (name === 'library') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h6l2-2h8v13H4z" /></svg>
  if (name === 'workspace') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="13" rx="2" /><path d="M8 21h8M12 18v3M8 9h8M8 12h5" /></svg>
  if (name === 'product') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 8 7-4 7 4v8l-7 4-7-4zM5 8l7 4 7-4M12 12v8" /></svg>
  if (name === 'city') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V9h6v11M10 20V4h6v16M16 20v-8h4v8M2 20h20M7 12h1M13 8h1M13 12h1" /></svg>
  if (name === 'mark') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 16l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7z" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></svg>
}

/** A human reason for a failed generation, from the real API response. */
function mediaError(status: number, data: { error?: string; required?: number; status?: string }) {
  if (status === 401) return 'Sign in to generate media.'
  if (status === 402) return `${data.error || 'You do not have enough credits for this.'} Buy more credits in Settings.`
  if (status === 409 && data.status === 'quote_changed') return 'The video price changed. Review the new quote and confirm again.'
  if (status === 409) return data.error || 'Approve the work and confirm generation first.'
  if (status === 503) return 'Media generation is being configured. Please try again shortly.'
  return data.error || 'Media generation failed. Please try again.'
}

type VideoQuote = {
  costUsd: number
  credits: number
  model: string
  intent: Record<string, unknown>
}

type VideoJob = {
  token: string
  jobId?: string
  status: string
  /** Re-show the same prompt/duration in the gallery when a render finishes after a refresh. */
  prompt: string
  duration: string
}

/**
 * The video render is durable on the server, so the browser keeps a copy of
 * the job token. A refresh, a tab switch or a closed laptop must not orphan
 * the render: on return the component re-hydrates from this key and resumes
 * polling.
 */
const VIDEO_JOB_STORAGE = 'ai360:video-job'

/** How many consecutive transient failures before polling pauses (the stored job is kept). */
const MAX_CONSECUTIVE_ERRORS = 10

function readStoredVideoJob(): VideoJob | null {
  try {
    const raw = window.sessionStorage.getItem(VIDEO_JOB_STORAGE)
    if (!raw) return null
    const parsed = JSON.parse(raw) as VideoJob
    return parsed && typeof parsed.token === 'string' ? parsed : null
  } catch {
    return null
  }
}

/** What the "need credits" panel shows: both quick top-ups and monthly plans. */
type CreditPanelState = {
  required: number
  available: number
  topUps: Array<{ slug: string; priceGhs: number; credits: number }>
  plans: Array<{
    slug: string
    name: string
    monthlyPriceGhs: number
    includedCredits: number
    featured?: boolean
  }>
}

function imageIntent(prompt: string, aspectRatio: string) {
  return {
    version: 1,
    mediaType: 'image',
    purpose: prompt.slice(0, 200) || 'Create a visual',
    channel: 'auto',
    aspectRatio,
    resolution: '1K',
    qualityTier: 'standard',
    audio: 'off',
    motion: 'balanced',
    locale: 'en-GH',
    variationCount: 1,
    references: [],
    constraints: [],
  }
}

function videoIntent(prompt: string, duration: string, motion: string) {
  return {
    version: 1,
    mediaType: 'video',
    purpose: prompt.slice(0, 200) || 'Create a motion clip',
    channel: 'auto',
    aspectRatio: '16:9',
    resolution: '720p',
    durationSeconds: duration === '8s' ? 8 : 4,
    qualityTier: 'standard',
    audio: 'off',
    motion: motion === 'zoom' || motion === 'static' ? 'calm' : motion === 'drone' ? 'dynamic' : 'balanced',
    locale: 'en-GH',
    variationCount: 1,
    references: [],
    constraints: [],
  }
}

function newRequestId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function MediaStudio() {
  const [tab, setTab] = useState<'image' | 'video' | 'gallery'>('image')
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [stylePreset, setStylePreset] = useState('Cinematic Photoreal')
  const [videoDuration, setVideoDuration] = useState('4s')
  const [cameraMotion, setCameraMotion] = useState('pan')
  const [generating, setGenerating] = useState(false)
  const [gallery, setGallery] = useState<MediaItem[]>(DEMO_GALLERY)
  const [toastNotice, setToastNotice] = useState('')
  const [toastError, setToastError] = useState(false)
  const [videoQuote, setVideoQuote] = useState<VideoQuote | null>(null)
  const [videoJob, setVideoJob] = useState<VideoJob | null>(null)
  const [creditPanel, setCreditPanel] = useState<CreditPanelState | null>(null)

  // Polling state lives in refs so a refresh-resumed poll never reads stale
  // closures and duplicate timers cannot stack after a visibility change.
  const pollTimerRef = useRef<number | null>(null)
  const pollAttemptsRef = useRef(0)
  const videoJobRef = useRef<VideoJob | null>(null)

  /** Keep the rendered job in state, in a ref and in session storage together. */
  const persistVideoJob = (job: VideoJob) => {
    videoJobRef.current = job
    setVideoJob(job)
    try {
      window.sessionStorage.setItem(VIDEO_JOB_STORAGE, JSON.stringify(job))
    } catch {
      // Private browsing: polling still works for this session.
    }
  }

  /** Forget the job everywhere; the server-side durable job is unaffected. */
  const clearVideoJob = () => {
    videoJobRef.current = null
    setVideoJob(null)
    try {
      window.sessionStorage.removeItem(VIDEO_JOB_STORAGE)
    } catch {
      // Nothing to clear.
    }
  }

  /** 20s, 40s, 80s, then capped at 2 minutes between transient failures. */
  const pollBackoff = (attempt: number) => Math.min(20_000 * 2 ** Math.min(attempt, 3), 120_000)

  const scheduleVideoPoll = (job: VideoJob, delayMs: number) => {
    if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current)
    pollTimerRef.current = window.setTimeout(() => {
      void pollVideo(job)
    }, delayMs)
  }

  const showToast = (message: string, isError: boolean) => {
    setToastNotice(message)
    setToastError(isError)
    window.setTimeout(() => setToastNotice(''), 6000)
  }

  /**
   * A 402 means "not enough credits". Instead of a toast that points at
   * Settings, show an inline panel with both ways to continue: a quick top-up
   * for this one render, or a monthly plan (better value per credit) for
   * regular use. Prices come from /api/credits, never hardcoded here.
   */
  const openCreditPanel = async (required: number, available: number) => {
    try {
      const response = await fetch('/api/credits', { cache: 'no-store' })
      const data = response.ok ? await response.json() : {}
      setCreditPanel({
        required,
        available,
        topUps: Array.isArray(data.topUps) ? data.topUps : [],
        // Only paid plans belong here; Explorer is already free.
        plans: Array.isArray(data.plans)
          ? data.plans.filter((plan: { monthlyPriceGhs: number }) => plan.monthlyPriceGhs > 0)
          : [],
      })
    } catch {
      setCreditPanel({ required, available, topUps: [], plans: [] })
    }
  }

  const handleGenerateImage = async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setToastNotice('Generating your visual… this takes a few seconds.')
    setToastError(false)
    try {
      const response = await fetch('/api/studio/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': newRequestId('img') },
        body: JSON.stringify({
          approved: true,
          prompt: prompt.trim(),
          style: stylePreset,
          intent: imageIntent(prompt.trim(), aspectRatio),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.image) {
        if (response.status === 402) {
          await openCreditPanel(
            typeof data.required === 'number' ? data.required : 3,
            typeof data.available === 'number' ? data.available : 0,
          )
          showToast('You need more credits to generate this. Pick a top-up or a plan below.', true)
          return
        }
        throw new Error(mediaError(response.status, data))
      }

      const newItem: MediaItem = {
        id: `media-${Date.now()}`,
        kind: 'image',
        prompt: prompt.trim(),
        aspectRatio,
        styleName: stylePreset,
        url: data.image,
        createdAt: 'Just now',
      }
      setGallery((prev) => [newItem, ...prev])
      setPrompt('')
      setTab('gallery')
      showToast('Visual generated. Find it in the gallery.', false)
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Image generation failed. Please try again.', true)
    } finally {
      setGenerating(false)
    }
  }

  const requestVideoQuote = async () => {
    if (!prompt.trim() || generating || videoJob) return
    setGenerating(true)
    setToastNotice('Checking current video pricing…')
    setToastError(false)
    try {
      const response = await fetch('/api/studio/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': newRequestId('vid') },
        body: JSON.stringify({ action: 'quote', intent: videoIntent(prompt.trim(), videoDuration, cameraMotion) }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || typeof data.costUsd !== 'number') {
        if (response.status === 402) {
          await openCreditPanel(
            typeof data.required === 'number' ? data.required : 12,
            typeof data.available === 'number' ? data.available : 0,
          )
          showToast('You need more credits to render this video. Pick a top-up or a plan below.', true)
          return
        }
        throw new Error(mediaError(response.status, data) || 'Video pricing is unavailable right now.')
      }
      setVideoQuote({
        costUsd: data.costUsd,
        credits: data.credits || 16,
        model: data.model,
        intent: data.intent || videoIntent(prompt.trim(), videoDuration, cameraMotion),
      })
      setToastNotice('')
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Video pricing is unavailable.', true)
    } finally {
      setGenerating(false)
    }
  }

  const confirmVideoRender = async () => {
    if (!videoQuote || generating) return
    const quote = videoQuote
    setVideoQuote(null)
    setGenerating(true)
    setToastNotice('Starting your render…')
    setToastError(false)
    try {
      const response = await fetch('/api/studio/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': newRequestId('vid') },
        body: JSON.stringify({
          action: 'submit',
          approved: true,
          acceptedCostUsd: quote.costUsd,
          intent: quote.intent,
          prompt: prompt.trim(),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.token) {
        if (response.status === 402) {
          // Keep the quote so the person can Confirm & render again once topped up.
          setVideoQuote(quote)
          await openCreditPanel(
            typeof data.required === 'number' ? data.required : quote.credits,
            typeof data.available === 'number' ? data.available : 0,
          )
          showToast('You need more credits to render this video. Pick a top-up or a plan below.', true)
          return
        }
        throw new Error(mediaError(response.status, data) || 'The video could not be started.')
      }
      const job: VideoJob = {
        token: data.token,
        jobId: data.jobId,
        status: data.status || 'pending',
        prompt: prompt.trim(),
        duration: videoDuration,
      }
      persistVideoJob(job)
      setToastNotice('')
      scheduleVideoPoll(job, 20_000)
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'The video could not be started.', true)
    } finally {
      setGenerating(false)
    }
  }

  const pollVideo = async (job: VideoJob) => {
    try {
      const response = await fetch('/api/studio/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status', token: job.token, jobId: job.jobId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        // The server can mark a job terminal inside an error response (for
        // example when the provider lost the job and the hold was refunded).
        if (data.status === 'failed' || data.status === 'cancelled' || data.status === 'expired') {
          clearVideoJob()
          showToast(data.error || 'This video job is no longer available. Your credits were returned.', true)
          return
        }
        // A 5xx is transient (provider hiccup, delivery retry) — back off and
        // keep the job. A 4xx means the job itself is gone, which is terminal.
        if (response.status >= 500) {
          pollAttemptsRef.current += 1
          if (pollAttemptsRef.current > MAX_CONSECUTIVE_ERRORS) {
            showToast('The video service is unreachable right now. Your render is still safe — reopen the studio to resume it, or your credits will be released automatically if it never completes.', true)
            return
          }
          scheduleVideoPoll(job, pollBackoff(pollAttemptsRef.current))
          return
        }
        clearVideoJob()
        showToast(data.error || 'This video job is no longer available. Your credits were returned.', true)
        return
      }

      pollAttemptsRef.current = 0
      const status = data.status || 'pending'
      if (status === 'completed' && data.downloadUrl) {
        const newItem: MediaItem = {
          id: `media-${Date.now()}`,
          kind: 'video',
          prompt: job.prompt,
          aspectRatio: '16:9',
          styleName: `${job.duration} Motion Clip`,
          url: data.downloadUrl,
          createdAt: 'Just now',
        }
        setGallery((prev) => [newItem, ...prev])
        clearVideoJob()
        setPrompt('')
        setTab('gallery')
        showToast('Motion video rendered. Find it in the gallery.', false)
        return
      }
      // failed, cancelled and expired are all terminal: the server already
      // refunded the hold, so tell the person rather than polling forever.
      if (status === 'failed' || status === 'cancelled' || status === 'expired') {
        clearVideoJob()
        showToast(data.error || 'The video render failed. Your credits were returned.', true)
        return
      }
      const next = { ...job, jobId: data.jobId || job.jobId, status }
      persistVideoJob(next)
      scheduleVideoPoll(next, 20_000)
    } catch {
      // Network failure (offline, timeout): keep the job and retry with backoff.
      pollAttemptsRef.current += 1
      if (pollAttemptsRef.current > MAX_CONSECUTIVE_ERRORS) {
        showToast('We lost contact with the video service. Your render is still safe — reopen the studio to resume it, or your credits will be released automatically if it never completes.', true)
        return
      }
      scheduleVideoPoll(job, pollBackoff(pollAttemptsRef.current))
    }
  }

  // Re-hydrate a render that was in flight when the page refreshed or the
  // browser tab was closed, and poll immediately when the tab becomes visible
  // again (mobile browsers throttle timers in background tabs). The handlers
  // are intentionally stable — they read the latest job from refs, so the
  // mount-time closure never goes stale.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const stored = readStoredVideoJob()
    if (stored) {
      persistVideoJob(stored)
      scheduleVideoPoll(stored, 0)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && videoJobRef.current) {
        scheduleVideoPoll(videoJobRef.current, 0)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current)
    }
  }, [])

  const busy = generating || Boolean(videoJob)

  return (
    <div className="media-studio-wrapper">
      {/* Hero banner with a live generated motion loop behind the copy. */}
      <section className="media-hero-banner">
        <video
          className="hero-bg-video"
          autoPlay
          muted
          loop
          playsInline
          poster="/studio-creative.png"
        >
          <source src="/studio-hero-loop.mp4" type="video/mp4" />
        </video>
        <div className="hero-glow-overlay" />
        <div className="hero-scrim" />
        <div className="hero-content">
          <div className="hero-badge">
            <span className="sparkle-icon"><StudioIcon name="spark" /></span>
            <span>AI CREATIVE STUDIO</span>
          </div>
          <h1>Turn a sentence into studio-grade images and motion</h1>
          <p>Cinematic visuals, product renders, brand assets and video, generated from a single prompt. Everything on this page was made here.</p>
        </div>

        {/* Studio Navigation Tabs */}
        <div className="media-nav-switch">
          <button
            type="button"
            className={tab === 'image' ? 'active' : ''}
            onClick={() => setTab('image')}
            aria-label="Image Studio"
          >
            <span className="tab-icon"><StudioIcon name="image" /></span>
            <span className="media-tab-label-full">Image Studio</span>
            <span className="media-tab-label-short" aria-hidden="true">Image</span>
          </button>
          <button
            type="button"
            className={tab === 'video' ? 'active' : ''}
            onClick={() => setTab('video')}
            aria-label="Video Studio"
          >
            <span className="tab-icon"><StudioIcon name="video" /></span>
            <span className="media-tab-label-full">Video Studio</span>
            <span className="media-tab-label-short" aria-hidden="true">Video</span>
          </button>
          <button
            type="button"
            className={tab === 'gallery' ? 'active' : ''}
            onClick={() => setTab('gallery')}
            aria-label={`Asset Gallery, ${gallery.length} assets`}
          >
            <span className="tab-icon"><StudioIcon name="library" /></span>
            <span className="media-tab-label-full">Asset Gallery ({gallery.length})</span>
            <span className="media-tab-label-short" aria-hidden="true">Assets</span>
          </button>
        </div>
      </section>

      {toastNotice ? <div className={`studio-toast-banner${toastError ? ' is-error' : ''}`}>{toastNotice}</div> : null}

      {creditPanel ? (
        <section className="studio-credit-panel">
          <div className="studio-credit-head">
            <div>
              <b>You need {creditPanel.required} credit{creditPanel.required === 1 ? '' : 's'} to continue</b>
              <small>You have {creditPanel.available} available. Pick a quick top-up for this render, or a monthly plan if you use AI360 regularly.</small>
            </div>
            <button type="button" className="studio-credit-close" onClick={() => setCreditPanel(null)} aria-label="Dismiss">×</button>
          </div>

          {creditPanel.topUps.length ? (
            <div className="studio-credit-section">
              <span className="studio-credit-label">Quick top-up — never expires, never renews</span>
              <div className="studio-credit-grid">
                {creditPanel.topUps.map((topUp) => (
                  <a key={topUp.slug} href={`/checkout?topup=${topUp.slug}`} className="studio-credit-card">
                    <b>{topUp.credits} credits</b>
                    <strong>GH₵{topUp.priceGhs.toLocaleString()}</strong>
                    <em>Top up now <span aria-hidden="true">→</span></em>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {creditPanel.plans.length ? (
            <div className="studio-credit-section">
              <span className="studio-credit-label">Or a monthly plan — more credits for your money</span>
              <div className="studio-credit-grid">
                {creditPanel.plans.map((plan) => (
                  <a key={plan.slug} href={`/checkout?plan=${plan.slug}`} className={`studio-credit-card${plan.featured ? ' is-featured' : ''}`}>
                    <b>{plan.name}</b>
                    <strong>GH₵{plan.monthlyPriceGhs.toLocaleString()} / month</strong>
                    <em>{plan.includedCredits.toLocaleString()} credits per month <span aria-hidden="true">→</span></em>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          <p className="studio-credit-note">
            Top-ups cost more per credit than a plan. If you use AI360 regularly, a monthly plan is better value — and
            failed renders never charge you either way.
          </p>
        </section>
      ) : null}

      {/* Main Studio Content Area */}
      <main className="media-studio-main">
        {tab === 'image' ? (
          <section className="studio-panel-card">
            <div className="panel-header">
              <div>
                <h2>AI Image & Graphic Studio</h2>
                <p>Describe what you want to visualize, select your format and aesthetic style.</p>
              </div>
            </div>

            {/* Quick Inspiration Chips */}
            <div className="inspiration-chips">
              <span className="chips-title">Inspiration:</span>
              {PROMPT_SUGGESTIONS.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  className="chip-btn"
                  onClick={() => setPrompt(item.text)}
                >
                  <span><StudioIcon name={item.icon} /></span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {/* Creative Prompt Input */}
            <div className="prompt-input-container">
              <textarea
                className="studio-prompt-textarea"
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your scene in detail... (e.g. A futuristic mobile banking app interface floating above a sleek mahogany desk, cinematic lighting, 8k resolution)"
              />
            </div>

            {/* Controls Grid */}
            <div className="controls-grid">
              <div className="control-card">
                <label className="control-label">Aspect Ratio</label>
                <div className="aspect-ratio-selector">
                  {[
                    { ratio: '16:9', label: '16:9 Widescreen' },
                    { ratio: '1:1', label: '1:1 Square' },
                    { ratio: '9:16', label: '9:16 Vertical/Reels' },
                  ].map((item) => (
                    <button
                      key={item.ratio}
                      type="button"
                      className={`ratio-btn ${aspectRatio === item.ratio ? 'selected' : ''}`}
                      onClick={() => setAspectRatio(item.ratio)}
                    >
                      <b>{item.ratio}</b>
                      <small>{item.label}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-card">
                <label className="control-label">Visual Aesthetic</label>
                <select
                  value={stylePreset}
                  onChange={(e) => setStylePreset(e.target.value)}
                  className="aesthetic-dropdown"
                >
                  <option value="Cinematic Photoreal">Cinematic Photoreal (8K Studio)</option>
                  <option value="Studio Product Photography">Studio Product Photography</option>
                  <option value="3D Hyper-Render">3D Hyper-Render</option>
                  <option value="Minimalist Brand Identity">Minimalist Brand Identity</option>
                  <option value="Vector Illustration & Art">Vector Illustration & Art</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              className={`generate-primary-action ${generating ? 'is-generating' : ''}`}
              onClick={handleGenerateImage}
              disabled={!prompt.trim() || busy}
            >
              <span>{generating ? 'Generating AI Visual…' : 'Generate Visual Asset'}</span>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </button>
          </section>
        ) : tab === 'video' ? (
          <section className="studio-panel-card">
            <div className="panel-header">
              <div>
                <h2>AI Video & Motion Studio</h2>
                <p>Animate concepts into motion clips with camera physics and duration controls.</p>
              </div>
            </div>

            {/* Quick Inspiration Chips */}
            <div className="inspiration-chips">
              <span className="chips-title">Inspiration:</span>
              {PROMPT_SUGGESTIONS.slice(0, 3).map((item) => (
                <button
                  type="button"
                  key={item.label}
                  className="chip-btn"
                  onClick={() => setPrompt(item.text)}
                >
                  <span><StudioIcon name={item.icon} /></span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {/* Creative Prompt Input */}
            <div className="prompt-input-container">
              <textarea
                className="studio-prompt-textarea"
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the video action or scene... (e.g. Slow motion drone shot over Accra skyline at sunset, warm cinematic colors, 4k quality)"
              />
            </div>

            {/* Controls Grid */}
            <div className="controls-grid">
              <div className="control-card">
                <label className="control-label">Video Clip Duration</label>
                <div className="aspect-ratio-selector">
                  {[
                    { dur: '4s', label: '4 Sec Motion' },
                    { dur: '8s', label: '8 Sec Extended' },
                  ].map((item) => (
                    <button
                      key={item.dur}
                      type="button"
                      className={`ratio-btn ${videoDuration === item.dur ? 'selected' : ''}`}
                      onClick={() => setVideoDuration(item.dur)}
                    >
                      <b>{item.dur}</b>
                      <small>{item.label}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-card">
                <label className="control-label">Camera Motion Physics</label>
                <select
                  value={cameraMotion}
                  onChange={(e) => setCameraMotion(e.target.value)}
                  className="aesthetic-dropdown"
                >
                  <option value="pan">Smooth Cinematic Pan</option>
                  <option value="zoom">Slow Dramatic Zoom</option>
                  <option value="drone">Aerial Drone Flyover</option>
                  <option value="static">Static Locked Shot</option>
                </select>
              </div>
            </div>

            {videoQuote ? (
              <div className="video-quote-bar">
                <div>
                  <b>Render quoted at {videoQuote.credits} credits</b>
                  <small>You will only be charged if it succeeds. Failed renders return your credits.</small>
                </div>
                <div className="video-quote-actions">
                  <button type="button" className="quote-cancel-btn" onClick={() => setVideoQuote(null)} disabled={generating}>Cancel</button>
                  <button type="button" className="quote-confirm-btn" onClick={confirmVideoRender} disabled={generating}>Confirm &amp; render</button>
                </div>
              </div>
            ) : videoJob ? (
              <div className="video-job-banner">
                <b>Rendering your motion video…</b>
                <small>This takes a minute or two. You can keep working; the clip will appear in the gallery when it is ready.</small>
              </div>
            ) : null}

            <button
              type="button"
              className={`generate-primary-action ${generating ? 'is-generating' : ''}`}
              onClick={requestVideoQuote}
              disabled={!prompt.trim() || busy || Boolean(videoQuote)}
            >
              <span>{generating ? 'Checking video price…' : videoJob ? 'Rendering…' : 'Render Motion Video Clip'}</span>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            </button>
          </section>
        ) : (
          <section className="studio-gallery-grid">
            {gallery.map((item, index) => (
              <div
                className="gallery-item-card"
                key={item.id}
                style={{ animationDelay: `${Math.min(index, 8) * 0.07}s` }}
              >
                <div className="card-media-wrapper">
                  {item.kind === 'video' ? (
                    <video
                      className="card-media-img"
                      autoPlay
                      muted
                      loop
                      playsInline
                      poster={item.poster}
                    >
                      <source src={item.url} type="video/mp4" />
                    </video>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={item.url} alt={item.prompt} className="card-media-img" />
                  )}
                  <div className="card-overlay">
                    <span className="media-badge"><StudioIcon name={item.kind === 'video' ? 'video' : 'image'} />{item.kind === 'video' ? 'MOTION VIDEO' : 'AI VISUAL'}</span>
                    <span className="ratio-tag">{item.aspectRatio}</span>
                  </div>
                </div>
                <div className="card-content">
                  <p className="card-prompt">{item.prompt}</p>
                  <div className="card-meta-row">
                    <span className="style-tag">{item.styleName}</span>
                    <span className="date-tag">{item.createdAt}</span>
                  </div>
                  <div className="card-footer">
                    <a href={item.url} download={`ai360-media-${item.id}.${item.kind === 'video' ? 'mp4' : 'png'}`} className="download-action-btn">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      <span>Download High-Res</span>
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  )
}
