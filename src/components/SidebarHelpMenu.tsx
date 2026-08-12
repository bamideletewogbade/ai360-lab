'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { QualityFeedback } from '@/components/QualityFeedback'

type FeedbackContext = {
  sourceSurface: 'quick' | 'research' | 'studio' | 'global' | 'other'
  conversationId?: string
  conversationText?: string
}

/**
 * One help affordance at the foot of the sidebar.
 *
 * The workspace previously showed two adjacent entries — "Help" and "Help and
 * feedback" — which repeated the word and blurred two different jobs: learning
 * the product and telling us something. The global pattern (Notion, Linear,
 * Slack, Figma) is a single launcher that opens one small menu combining both,
 * so this consolidates them. Learning and giving feedback become distinct rows
 * under a single, unambiguous "Help & feedback".
 */
export function SidebarHelpMenu({
  onOpenGuide,
  feedbackContext,
}: {
  onOpenGuide: () => void
  feedbackContext: FeedbackContext
}) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="help-menu-wrap" ref={wrapRef}>
      {open ? (
        <div className="help-popover" role="menu" id={menuId}>
          <button
            type="button"
            className="side-help"
            role="menuitem"
            onClick={() => { setOpen(false); onOpenGuide() }}
          >
            <span>Learn the workspace</span><small>What each mode is for and how to start</small>
          </button>
          <QualityFeedback variant="menu" context={feedbackContext} />
          <div className="help-menu-divider" />
          <Link href="/how-it-works" className="side-help" role="menuitem" onClick={() => setOpen(false)}>
            <span>How it works</span><small>The approach behind AI360</small>
          </Link>
          <Link href="/changelog" className="side-help" role="menuitem" onClick={() => setOpen(false)}>
            <span>What’s new</span><small>Recent changes and improvements</small>
          </Link>
        </div>
      ) : null}

      <button
        type="button"
        className="side-help help-menu-launch"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Help</span><small>Guides, ideas and feedback</small>
      </button>
    </div>
  )
}
