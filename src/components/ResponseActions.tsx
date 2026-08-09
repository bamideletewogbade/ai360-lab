'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

type ResponseActionsProps = {
  content: string
  canListen: boolean
  canRetry: boolean
  busy: boolean
  onListen: () => void
  onRetry: () => void
  feedback: ReactNode
}

export function ResponseActions({ content, canListen, canRetry, busy, onListen, onRetry, feedback }: ResponseActionsProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  async function copyResponse() {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
    setOpen(false)
  }

  return (
    <div className="response-actions" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="response-actions-trigger"
        aria-label="Answer options"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
        <span>{copied ? 'Copied' : 'Options'}</span>
      </button>
      <div className="response-actions-menu" hidden={!open} role="group" aria-label="Actions for this answer">
        <button type="button" onClick={() => void copyResponse()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>
          <span>Copy answer</span>
        </button>
        {canListen ? <button type="button" onClick={() => { setOpen(false); onListen() }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10v4h3l5 4V6l-5 4H5Z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>
          <span>Listen</span>
        </button> : null}
        {canRetry ? <button type="button" onClick={() => { setOpen(false); onRetry() }} disabled={busy}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></svg>
          <span>Try again</span>
        </button> : null}
        <div className="response-feedback-slot" onClick={() => setOpen(false)}>{feedback}</div>
      </div>
    </div>
  )
}
