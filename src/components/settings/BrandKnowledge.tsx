'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './Settings.module.css'

type BrandKnowledgeFile = {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  charCount: number
  createdAt: string
}

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * A workspace's knowledge base — the same idea as a project's
 * (`@/components/ProjectKnowledge`), one level up. Files added here ground
 * every conversation and generated document across the whole workspace, not
 * just one project, so a business's real facts and voice travel with it
 * wherever AI360 writes on its behalf.
 */
export function BrandKnowledge() {
  const [files, setFiles] = useState<BrandKnowledgeFile[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/brand-kit/knowledge', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => { if (alive && Array.isArray(data.files)) setFiles(data.files) })
      .catch(() => { /* an empty list is a fine starting point */ })
    return () => { alive = false }
  }, [])

  const upload = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file || busy) return
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch('/api/brand-kit/knowledge', { method: 'POST', body: form })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) { setError(data.error || 'That file could not be added.'); return }
      setFiles((current) => [data.file, ...current])
    } catch {
      setError('That file could not be added.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async (id: string) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/brand-kit/knowledge?fileId=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'That file could not be removed.')
      setFiles((current) => current.filter((file) => file.id !== id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That file could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.card} aria-label="Brand knowledge base">
      <div className={styles.cardHead}>
        <h2>Brand knowledge</h2>
        <p>
          Add anything that helps AI360 understand your business — a brand guide, a product list, an about page.
          It grounds chat and every document AI360 writes for you, not just one project.
        </p>
      </div>

      <label
        className={`knowledge-drop${dragging ? ' dragging' : ''}${busy ? ' busy' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files) }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,.markdown,.mdx,.csv,.tsv,.json,.log,.yml,.yaml,.xml,.html,.htm,.rtf,text/*"
          onChange={(event) => void upload(event.target.files)}
          disabled={busy}
        />
        <span className="knowledge-drop-icon" aria-hidden="true">＋</span>
        <span>{busy ? 'Adding…' : 'Drop a file or click to add'}</span>
        <small>Text, Markdown, CSV or JSON, up to 2 MB. PDF and Word support is next.</small>
      </label>

      {error ? <p className="knowledge-error">{error}</p> : null}

      {files.length ? (
        <ul className="knowledge-list">
          {files.map((file) => (
            <li key={file.id}>
              <span className="knowledge-file-icon" aria-hidden="true">◫</span>
              <span className="knowledge-file-meta">
                <b>{file.name}</b>
                <small>{sizeLabel(file.sizeBytes)} · {file.charCount.toLocaleString()} characters read</small>
              </span>
              <button type="button" onClick={() => void remove(file.id)} aria-label={`Remove ${file.name}`} disabled={busy}>Remove</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="knowledge-empty">Nothing added yet. Only add what is genuinely useful context.</p>
      )}
    </section>
  )
}
