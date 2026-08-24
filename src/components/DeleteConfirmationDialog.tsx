'use client'

import { useEffect, useRef } from 'react'

/**
 * A small, reusable destructive-action dialog. Cancel receives focus first and
 * the focus loop stays inside the dialog, which keeps deletion deliberate on a
 * keyboard without making the confirmation heavy on a phone.
 */
export function DeleteConfirmationDialog({
  title,
  description,
  confirmLabel,
  busy = false,
  error = '',
  onConfirm,
  onClose,
}: {
  title: string
  description: string
  confirmLabel: string
  busy?: boolean
  error?: string
  onConfirm: () => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    cancelRef.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
  }, [])

  return (
    <div
      className="delete-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className="delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <span className="delete-dialog-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg>
        </span>
        <div>
          <p className="delete-dialog-kicker">Permanent action</p>
          <h2 id="delete-dialog-title">{title}</h2>
          <p id="delete-dialog-description">{description}</p>
          {error ? <p className="delete-dialog-error" role="alert">{error}</p> : null}
        </div>
        <div className="delete-dialog-actions">
          <button ref={cancelRef} type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="delete-dialog-confirm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
