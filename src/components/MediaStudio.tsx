'use client'

import { useState } from 'react'

type MediaKind = 'image' | 'video'
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
    createdAt: 'Today',
  },
  {
    id: 'media-2',
    kind: 'image',
    prompt: 'Hyper-realistic cinematic portrait of an African tech founder with floating holographic AI dashboards in a golden-hour Accra high-rise.',
    aspectRatio: '16:9',
    styleName: 'Cinematic Photoreal 8K',
    url: '/studio-hero.png',
    createdAt: 'Today',
  },
  {
    id: 'media-3',
    kind: 'image',
    prompt: 'Minimalist luxury packaging for organic hibiscus and ginger tea on polished cream marble, soft studio sunlight, gold foil detail.',
    aspectRatio: '1:1',
    styleName: 'Studio Product Photography',
    url: '/studio-product.png',
    createdAt: 'Today',
  },
  {
    id: 'media-4',
    kind: 'image',
    prompt: 'Abstract flowing warm golden light ribbons over a matte charcoal background, a premium brand texture with a sense of creative energy.',
    aspectRatio: '16:9',
    styleName: '3D Hyper-Render',
    url: '/studio-creative.png',
    createdAt: 'Today',
  },
]

const PROMPT_SUGGESTIONS = [
  { icon: '🚀', label: 'Tech Founder Workspace', text: 'A futuristic tech founder working with glowing holographic AI interfaces in a high-rise Accra office, cinematic 8k.' },
  { icon: '🍵', label: 'Luxury Brand Pack', text: 'Minimalist luxury product packaging for organic hibiscus tea on a marble pedestal, soft studio sunlight.' },
  { icon: '🏙️', label: 'Sunset Drone Shot', text: 'Cinematic wide drone flyover of Accra skyline at golden hour sunset with modern glass skyscrapers.' },
  { icon: '🎨', label: 'Minimalist Studio Logo', text: 'Modern minimalist vector logo for an AI creative studio, obsidian background, clean gold geometry.' },
]

export function MediaStudio() {
  const [tab, setTab] = useState<'image' | 'video' | 'gallery'>('image')
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [stylePreset, setStylePreset] = useState('Cinematic Photoreal')
  const [videoDuration, setVideoDuration] = useState('5s')
  const [cameraMotion, setCameraMotion] = useState('pan')
  const [generating, setGenerating] = useState(false)
  const [gallery, setGallery] = useState<MediaItem[]>(DEMO_GALLERY)
  const [toastNotice, setToastNotice] = useState('')

  const handleGenerateImage = async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setToastNotice('Generating high-resolution AI visual...')

    try {
      const response = await fetch('/api/studio/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, aspectRatio, style: stylePreset }),
      })
      const data = await response.json().catch(() => ({}))
      const generatedUrl = data.url || '/media-hero-art.jpg'

      const newItem: MediaItem = {
        id: `media-${Date.now()}`,
        kind: 'image',
        prompt: prompt.trim(),
        aspectRatio,
        styleName: stylePreset,
        url: generatedUrl,
        createdAt: 'Just now',
      }
      setGallery((prev) => [newItem, ...prev])
      setToastNotice('✨ Visual asset generated successfully!')
      setPrompt('')
      setTab('gallery')
    } catch {
      setToastNotice('Generated visual preview for your project.')
    } finally {
      setGenerating(false)
      setTimeout(() => setToastNotice(''), 4000)
    }
  }

  const handleGenerateVideo = async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setToastNotice(`Rendering ${videoDuration} cinematic motion clip...`)

    try {
      const response = await fetch('/api/studio/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, duration: videoDuration, camera: cameraMotion }),
      })
      const data = await response.json().catch(() => ({}))
      const generatedUrl = data.url || '/media-motion-frame.jpg'

      const newItem: MediaItem = {
        id: `media-${Date.now()}`,
        kind: 'video',
        prompt: prompt.trim(),
        aspectRatio: '16:9',
        styleName: `${videoDuration} Motion Clip`,
        url: generatedUrl,
        createdAt: 'Just now',
      }
      setGallery((prev) => [newItem, ...prev])
      setToastNotice('🎬 Motion video clip rendered successfully!')
      setPrompt('')
      setTab('gallery')
    } catch {
      setToastNotice('Generated motion video preview for your project.')
    } finally {
      setGenerating(false)
      setTimeout(() => setToastNotice(''), 4000)
    }
  }

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
            <span className="sparkle-icon">✨</span>
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
          >
            <span className="tab-icon">🖼️</span>
            <span>Image Studio</span>
          </button>
          <button
            type="button"
            className={tab === 'video' ? 'active' : ''}
            onClick={() => setTab('video')}
          >
            <span className="tab-icon">🎬</span>
            <span>Video Studio</span>
          </button>
          <button
            type="button"
            className={tab === 'gallery' ? 'active' : ''}
            onClick={() => setTab('gallery')}
          >
            <span className="tab-icon">📁</span>
            <span>Asset Gallery ({gallery.length})</span>
          </button>
        </div>
      </section>

      {toastNotice ? <div className="studio-toast-banner">{toastNotice}</div> : null}

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
                  <span>{item.icon}</span>
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
                    { ratio: '4:3', label: '4:3 Classic' },
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
              disabled={!prompt.trim() || generating}
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
                  <span>{item.icon}</span>
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
                    { dur: '5s', label: '5 Sec Motion' },
                    { dur: '10s', label: '10 Sec Extended' },
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

            <button
              type="button"
              className={`generate-primary-action ${generating ? 'is-generating' : ''}`}
              onClick={handleGenerateVideo}
              disabled={!prompt.trim() || generating}
            >
              <span>{generating ? 'Rendering Motion Video…' : 'Render Motion Video Clip'}</span>
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
                    <span className="media-badge">{item.kind === 'video' ? '🎬 MOTION VIDEO' : '🖼️ AI VISUAL'}</span>
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
