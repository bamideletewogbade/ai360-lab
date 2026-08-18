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
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    inputRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previousFocus?.focus()
    }
  }, [onClose])

  const ready = name.trim().length > 0
  const submit = () => { if (ready) onCreate(name.trim()) }

  return (
    <div
      className="onboarding-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section
        ref={dialogRef}
        className="onboarding-card create-project-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        aria-describedby="create-project-hint"
      >
        <button type="button" className="onboarding-skip" onClick={onClose} aria-label="Close new project dialog">Close</button>
        <p className="onboarding-kicker">New project</p>
        <h2 id="create-project-title">Name your project</h2>

        <form onSubmit={(event) => { event.preventDefault(); submit() }}>
          <input
            ref={inputRef}
            className="create-project-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Solar plan for the school"
            maxLength={255}
            aria-label="Project name"
          />

          <p className="create-project-hint" id="create-project-hint">
            <span aria-hidden="true">◇</span>
            A project keeps a lasting goal, its files, chats, working drafts and finished outputs together. It can be about anything.
          </p>

          <div className="create-project-actions">
            <button type="button" className="create-project-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="create-project-confirm" disabled={!ready}>
              Create project
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
