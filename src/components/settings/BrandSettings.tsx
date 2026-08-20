'use client'
/* eslint-disable @next/next/no-img-element -- the logo preview is a locally-created blob URL, not an optimizable remote image */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { isHexColor, normalizeHex, readableTextHex, tint } from '@/lib/export/color'
import { BrandKnowledge } from '@/components/settings/BrandKnowledge'
import styles from './Settings.module.css'

const DEFAULT_PRIMARY = '#101112'
const DEFAULT_ACCENT = '#56595C'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type LogoState = 'idle' | 'uploading' | 'error'

export function BrandSettings() {
  const { configured, loading: authLoading, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [hasKit, setHasKit] = useState(false)
  const [primary, setPrimary] = useState(DEFAULT_PRIMARY)
  const [accent, setAccent] = useState(DEFAULT_ACCENT)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorText, setErrorText] = useState('')

  const [hasLogo, setHasLogo] = useState(false)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('')
  const [logoState, setLogoState] = useState<LogoState>('idle')
  const [logoError, setLogoError] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    fetch('/api/brand-kit', { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { brand?: { primary: string; accent: string } | null } | null) => {
        if (controller.signal.aborted) return
        if (data?.brand) {
          setPrimary(data.brand.primary)
          setAccent(data.brand.accent)
          setHasKit(true)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
    return () => controller.abort()
  }, [user])

  // The logo image itself is fetched as a blob (not a direct <img src=...>)
  // so a missing logo never shows a broken-image icon — the request result
  // decides whether a preview renders at all.
  useEffect(() => {
    if (!user) return
    let revoke = ''
    fetch('/api/brand-kit/logo', { cache: 'no-store' })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        revoke = url
        setLogoPreviewUrl(url)
        setHasLogo(true)
      })
      .catch(() => undefined)
    return () => { if (revoke) URL.revokeObjectURL(revoke) }
  }, [user])

  async function uploadLogo(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file || logoState === 'uploading') return
    setLogoState('uploading')
    setLogoError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch('/api/brand-kit/logo', { method: 'POST', body: form })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'That logo could not be saved.')
      setLogoPreviewUrl(URL.createObjectURL(file))
      setHasLogo(true)
      setLogoState('idle')
    } catch (cause) {
      setLogoError(cause instanceof Error ? cause.message : 'That logo could not be saved.')
      setLogoState('error')
    } finally {
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function removeLogo() {
    setLogoState('uploading')
    setLogoError('')
    try {
      const response = await fetch('/api/brand-kit/logo', { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'That logo could not be removed.')
      setLogoPreviewUrl('')
      setHasLogo(false)
      setLogoState('idle')
    } catch (cause) {
      setLogoError(cause instanceof Error ? cause.message : 'That logo could not be removed.')
      setLogoState('error')
    }
  }

  const primaryValid = isHexColor(primary)
  const accentValid = isHexColor(accent)

  async function save() {
    if (!primaryValid || !accentValid) return
    setSaveState('saving')
    setErrorText('')
    try {
      const response = await fetch('/api/brand-kit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary, accent }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Your brand kit could not be saved.')
      setHasKit(true)
      setSaveState('saved')
    } catch (cause) {
      setErrorText(cause instanceof Error ? cause.message : 'Your brand kit could not be saved.')
      setSaveState('error')
    }
  }

  async function reset() {
    setSaveState('saving')
    setErrorText('')
    try {
      const response = await fetch('/api/brand-kit', { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Your brand kit could not be cleared.')
      setPrimary(DEFAULT_PRIMARY)
      setAccent(DEFAULT_ACCENT)
      setHasKit(false)
      setSaveState('idle')
    } catch (cause) {
      setErrorText(cause instanceof Error ? cause.message : 'Your brand kit could not be cleared.')
      setSaveState('error')
    }
  }

  const previewHeaderFill = primaryValid ? tint(primary, 0.85) : tint(DEFAULT_PRIMARY, 0.85)
  const previewHeaderText = readableTextHex(previewHeaderFill)
  const previewPrimary = primaryValid ? primary : DEFAULT_PRIMARY

  return (
    <>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Document colours</h2>
          <p>
            Applied automatically to every PDF, Word, Excel and PowerPoint file AI360 makes for you —
            in chat and in Studio — so a document looks like your business, not like AI360&rsquo;s own product.
            No extra step: set this once and it just works from here on.
          </p>
        </div>

        {!configured ? (
          <p className={styles.notice}>
            Account access is being connected. Brand kits need a signed-in workspace.
          </p>
        ) : authLoading ? (
          <div className={styles.empty}>Loading your brand kit…</div>
        ) : !user ? (
          <p className={styles.notice}>
            You are exploring in guest mode. <Link href="/sign-in">Sign in</Link> or{' '}
            <Link href="/sign-up">create an account</Link> to save a brand kit that follows you everywhere.
          </p>
        ) : loading ? (
          <div className={styles.empty}>Loading your brand kit…</div>
        ) : (
          <>
            <div className={styles.colorRow}>
              <input
                type="color"
                className={styles.colorSwatch}
                aria-label="Primary colour"
                value={primaryValid ? primary : DEFAULT_PRIMARY}
                onChange={(event) => setPrimary(event.target.value.toUpperCase())}
                disabled={saveState === 'saving'}
              />
              <div className={styles.colorField}>
                <strong>Primary</strong>
                <span>Headings, titles and table accents</span>
              </div>
              <input
                type="text"
                className={`${styles.hexInput} ${primaryValid ? '' : styles.hexInputInvalid}`}
                value={primary}
                onChange={(event) => setPrimary(event.target.value)}
                onBlur={() => setPrimary((current) => normalizeHex(current) || current)}
                maxLength={7}
                spellCheck={false}
                aria-label="Primary colour hex code"
                disabled={saveState === 'saving'}
              />
            </div>

            <div className={styles.colorRow}>
              <input
                type="color"
                className={styles.colorSwatch}
                aria-label="Accent colour"
                value={accentValid ? accent : DEFAULT_ACCENT}
                onChange={(event) => setAccent(event.target.value.toUpperCase())}
                disabled={saveState === 'saving'}
              />
              <div className={styles.colorField}>
                <strong>Accent</strong>
                <span>Small details, like a slide&rsquo;s title underline</span>
              </div>
              <input
                type="text"
                className={`${styles.hexInput} ${accentValid ? '' : styles.hexInputInvalid}`}
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
                onBlur={() => setAccent((current) => normalizeHex(current) || current)}
                maxLength={7}
                spellCheck={false}
                aria-label="Accent colour hex code"
                disabled={saveState === 'saving'}
              />
            </div>

            <div className={styles.brandActions}>
              <button type="button" onClick={() => void save()} disabled={saveState === 'saving' || !primaryValid || !accentValid}>
                {saveState === 'saving' ? 'Saving…' : 'Save brand kit'}
              </button>
              {hasKit ? (
                <button type="button" className={styles.textButton} onClick={() => void reset()} disabled={saveState === 'saving'}>
                  Reset to AI360&rsquo;s default look
                </button>
              ) : null}
            </div>
            {saveState === 'saved' ? <p className={styles.notice}>Saved. New documents will use these colours.</p> : null}
            {saveState === 'error' ? <p className={styles.notice}>{errorText}</p> : null}
          </>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Logo</h2>
          <p>
            Replaces AI360&rsquo;s own mark in the header of generated PDF and Word documents — it becomes
            your document, not a co-branded one. PNG or JPEG, up to 3 MB.
          </p>
        </div>
        {!configured || authLoading ? (
          <div className={styles.empty}>Loading…</div>
        ) : !user ? (
          <p className={styles.notice}>Sign in to add a logo.</p>
        ) : (
          <>
            <div className={styles.colorRow}>
              {logoPreviewUrl ? (
                <img src={logoPreviewUrl} alt="Your logo" className={styles.logoPreview} />
              ) : (
                <span className={styles.logoPreviewEmpty} aria-hidden="true">No logo</span>
              )}
              <div className={styles.colorField}>
                <strong>{hasLogo ? 'Logo set' : 'No logo yet'}</strong>
                <span>Shown at natural proportions, scaled to fit the header</span>
              </div>
              <div className={styles.brandActions}>
                <label className={styles.uploadButton}>
                  {logoState === 'uploading' ? 'Uploading…' : hasLogo ? 'Replace' : 'Upload'}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(event) => void uploadLogo(event.target.files)}
                    disabled={logoState === 'uploading'}
                    hidden
                  />
                </label>
                {hasLogo ? (
                  <button type="button" className={styles.textButton} onClick={() => void removeLogo()} disabled={logoState === 'uploading'}>
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
            {logoState === 'error' ? <p className={styles.notice}>{logoError}</p> : null}
          </>
        )}
      </section>

      {user ? <BrandKnowledge /> : null}

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Preview</h2>
          <p>A rough sense of how these colours land on a document.</p>
        </div>
        <div className={styles.brandPreview}>
          <div className={styles.brandPreviewHead}>
            {logoPreviewUrl
              ? <img src={logoPreviewUrl} alt="" className={styles.brandPreviewLogo} />
              : <span className={styles.brandPreviewEyebrow}>AI360</span>}
            <span className={styles.brandPreviewTitle} style={{ color: previewPrimary }}>Wholesale price list</span>
          </div>
          <div className={styles.brandPreviewTable}>
            <div className={styles.brandPreviewTableHead} style={{ background: previewHeaderFill, color: previewHeaderText }}>
              <span>Item</span><span>Price</span>
            </div>
            <div className={styles.brandPreviewTableRow}><span>Shea butter, 500g</span><span>GHS 45</span></div>
            <div className={styles.brandPreviewTableRow}><span>Black soap, bar</span><span>GHS 18</span></div>
          </div>
        </div>
        <p className={styles.notice}>
          A project with its own brand colours (set while building it in Projects) uses those instead of this
          workspace default for its own documents.
        </p>
      </section>
    </>
  )
}
