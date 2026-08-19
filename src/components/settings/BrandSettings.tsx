'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { isHexColor, normalizeHex, readableTextHex, tint } from '@/lib/export/color'
import styles from './Settings.module.css'

const DEFAULT_PRIMARY = '#101112'
const DEFAULT_ACCENT = '#56595C'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function BrandSettings() {
  const { configured, loading: authLoading, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [hasKit, setHasKit] = useState(false)
  const [primary, setPrimary] = useState(DEFAULT_PRIMARY)
  const [accent, setAccent] = useState(DEFAULT_ACCENT)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorText, setErrorText] = useState('')

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
      await fetch('/api/brand-kit', { method: 'DELETE' })
      setPrimary(DEFAULT_PRIMARY)
      setAccent(DEFAULT_ACCENT)
      setHasKit(false)
      setSaveState('idle')
    } catch {
      setErrorText('Your brand kit could not be cleared.')
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
          <h2>Preview</h2>
          <p>A rough sense of how these colours land on a document.</p>
        </div>
        <div className={styles.brandPreview}>
          <div className={styles.brandPreviewHead}>
            <span className={styles.brandPreviewEyebrow}>AI360</span>
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
