'use client'

import { useEffect, useRef, useState } from 'react'

type ProjectFile = {
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
 * A project's knowledge base.
 *
 * Files added here are stored against the project and, once the in-project chat
 * lands, ground every conversation and generation inside it. It is a signed-in
 * feature because the knowledge is durable and workspace-scoped, so a guest is
 * shown the value and the way to unlock it rather than a dead control.
 */
export function ProjectKnowledge({ projectId, signedIn }: { projectId: string; signedIn: boolean }) {
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!signedIn) return
    let alive = true
    fetch(`/api/projects/${projectId}/files`)
      .then((response) => response.json())
      .then((data) => { if (alive && Array.isArray(data.files)) setFiles(data.files) })
      .catch(() => { /* an empty list is a fine starting point */ })
    return () => { alive = false }
  }, [projectId, signedIn])

  const upload = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file || busy) return
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body: form })
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
    setFiles((current) => current.filter((file) => file.id !== id))
    await fetch(`/api/projects/${projectId}/files?fileId=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
  }

  return (
    <section className="project-knowledge" aria-label="Project knowledge base">
      <div className="knowledge-head">
        <div>
          <b>Knowledge base</b>
          <small>Add your brand notes, price lists or briefs. Everything you add here grounds the work in this project.</small>
        </div>
        {signedIn ? <span className="knowledge-count">{files.length} file{files.length === 1 ? '' : 's'}</span> : null}
      </div>

      {signedIn ? (
        <>
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
            <small>Text, Markdown, CSV or JSON, up to 2 MB. PDF and Word coming next.</small>
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
                  <button type="button" onClick={() => void remove(file.id)} aria-label={`Remove ${file.name}`}>Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="knowledge-empty">No files yet. What you add becomes context the specialists can use.</p>
          )}
        </>
      ) : (
        <p className="knowledge-empty">Sign in to add files and keep the knowledge base with this project.</p>
      )}
    </section>
  )
}
