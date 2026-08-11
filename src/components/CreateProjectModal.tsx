'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Creates a named project container, the way ChatGPT and Claude do it: a name is
 * enough to start, and the project is then filled with files, a brief and chats.
 * Deliberately minimal so starting a project is one small, unintimidating step.
 */
export function CreateProjectModal({
  onCreate,
  onClose,
}: {
  onCreate: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const ready = name.trim().length > 0
  const submit = () => { if (ready) onCreate(name.trim()) }

  return (
    <div
      className="onboarding-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-project-title"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section className="onboarding-card create-project-card">
        <button className="onboarding-skip" onClick={onClose} aria-label="Close">Close</button>
        <p className="onboarding-kicker">New project</p>
        <h1 id="create-project-title">Name your project</h1>

        <input
          ref={inputRef}
          className="create-project-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
          placeholder="e.g. Hibiscus drink launch"
          maxLength={255}
          aria-label="Project name"
        />

        <p className="create-project-hint">
          <span aria-hidden="true">◇</span>
          A project keeps your files, brief and chats in one place. Use it for ongoing work, or just to keep things tidy.
        </p>

        <div className="create-project-actions">
          <button type="button" className="create-project-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="create-project-confirm" onClick={submit} disabled={!ready}>
            Create project
          </button>
        </div>
      </section>
    </div>
  )
}
