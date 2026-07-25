'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ResponseContent } from '@/components/ResponseContent'

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
}

const STORAGE_KEY = 'ai360-studio-project-v1'
const CHANNELS = ['WhatsApp', 'Instagram', 'Facebook', 'TikTok', 'SMS', 'Email', 'Google Business', 'Print']
const GOALS = [
  'Launch a new business',
  'Promote a product or service',
  'Announce an event',
  'Increase enquiries and sales',
  'Build online visibility',
  'Run a 30-day campaign',
]
const ASSET_ICONS: Record<StudioAsset['type'], string> = {
  strategy: '01',
  messaging: 'Aa',
  whatsapp: 'WA',
  social: '◫',
  flyer: '▤',
  direct: '→',
  logo: '◇',
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

function requestId() {
  return crypto.randomUUID()
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

export function StudioWorkspace() {
  const [hydrated, setHydrated] = useState(false)
  const [intake, setIntake] = useState<Intake>(EMPTY_INTAKE)
  const [brandFile, setBrandFile] = useState<BrandFile | null>(null)
  const [project, setProject] = useState<StudioProject | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState('')
  const [editingId, setEditingId] = useState('')
  const [revisionId, setRevisionId] = useState('')
  const [revisionInstruction, setRevisionInstruction] = useState('')
  const [exporting, setExporting] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let mounted = true
    queueMicrotask(() => {
      if (!mounted) return
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) setProject(JSON.parse(saved) as StudioProject)
      } catch {
        // A damaged local project should not prevent Studio from opening.
      }
      setHydrated(true)
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      if (project) localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      console.warn('[AI360] Studio project could not be saved locally.')
    }
  }, [hydrated, project])

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
      const result = data.result as { brand: BrandProfile; campaign: Campaign; assets: StudioAsset[] }
      const next: StudioProject = {
        id: requestId(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        intake,
        brand: result.brand,
        campaign: result.campaign,
        assets: result.assets.map((asset, index) => ({
          ...asset,
          id: asset.id || `asset-${index + 1}`,
          status: 'draft',
        })),
      }
      setProject(next)
      setExpandedId(next.assets[0]?.id || '')
      setBrandFile(null)
      requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
    } catch (cause) {
      console.error('[AI360] Studio generation failed', cause)
      setError(cause instanceof Error ? cause.message : 'Studio could not create this campaign.')
    } finally {
      setBusy(false)
    }
  }

  function updateAsset(id: string, updates: Partial<StudioAsset>) {
    setProject((current) => current
      ? {
          ...current,
          updatedAt: Date.now(),
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

  function newProject() {
    if (project && !window.confirm('Start a new Studio project? Your current local project will be replaced.')) return
    setProject(null)
    setIntake(EMPTY_INTAKE)
    setBrandFile(null)
    setExpandedId('')
    setEditingId('')
    setRevisionId('')
    setError('')
    requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  if (!hydrated) {
    return <main className="studio-main" ref={mainRef}><div className="studio-loading">Opening Studio…</div></main>
  }

  if (!project) {
    return (
      <main className="studio-main" ref={mainRef}>
        <div className="studio-intake">
          <section className="studio-intro">
            <span className="studio-kicker">AI 360 Studio · Guided project</span>
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
              {busy ? <><span className="studio-spinner">✦</span> Building your launch pack…</> : <>Create marketing launch pack <span>→</span></>}
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
            <button onClick={() => exportPack('pdf')} disabled={Boolean(exporting)}>{exporting === 'pdf' ? 'Creating…' : 'Export PDF'}</button>
            <button onClick={() => exportPack('docx')} disabled={Boolean(exporting)}>{exporting === 'docx' ? 'Creating…' : 'Export Word'}</button>
            <button className="project-new" onClick={newProject}>New project</button>
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
                          <button onClick={() => setEditingId(editingId === asset.id ? '' : asset.id)}>
                            {editingId === asset.id ? 'Finish editing' : 'Edit'}
                          </button>
                          <button onClick={() => { setRevisionId(asset.id); setRevisionInstruction('') }}>Improve with AI</button>
                          <button
                            className={asset.status === 'approved' ? 'approved' : 'approve'}
                            onClick={() => updateAsset(asset.id, { status: asset.status === 'approved' ? 'draft' : 'approved' })}
                          >
                            {asset.status === 'approved' ? '✓ Approved' : 'Approve asset'}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>

            <section className="execution-next">
              <span className="execution-mark">✦</span>
              <span>
                <b>Next execution layer</b>
                <small>Visual logo files, designed campaign graphics, rendered promotional video and publishing connections.</small>
              </span>
              <span>Coming next</span>
            </section>
          </section>
        </div>
      </div>
      {activeAsset ? <span className="sr-only">Selected asset: {activeAsset.title}</span> : null}
    </main>
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
