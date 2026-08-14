'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { QualityFeedback } from '@/components/QualityFeedback'
import { useAuth } from '@/components/AuthProvider'

export type MobileWorkspaceExperience = 'chat' | 'agent' | 'studio' | 'apps' | 'media'

type FeedbackContext = {
  sourceSurface: 'quick' | 'research' | 'studio' | 'global' | 'other'
  conversationId?: string
  conversationText?: string
}

type Props = {
  experience: MobileWorkspaceExperience
  authEnabled: boolean
  feedbackContext: FeedbackContext
  onOpenSidebar: () => void
  onOpenGuide: () => void
  onSelectChats: () => void
  onSelectProjects: () => void
  onStartProject: () => void
  onSelectMedia: () => void
  onSelectApps: () => void
}

type Sheet = 'create' | 'you' | null

function NavIcon({ kind }: { kind: 'chat' | 'project' | 'create' | 'you' }) {
  if (kind === 'chat') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 3v-13a2 2 0 0 1 1-2Z" /></svg>
  if (kind === 'project') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6l2-2h9v13h-17Z" /><path d="M3.5 9.5h17" /></svg>
  if (kind === 'create') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.25" /><path d="M5.5 19c.55-3.35 3-5.25 6.5-5.25s5.95 1.9 6.5 5.25" /></svg>
}

function SheetIcon({ kind }: { kind: 'project' | 'image' | 'apps' | 'history' | 'settings' | 'guide' }) {
  if (kind === 'project') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6l2-2h9v13h-17Z" /><path d="M15.5 12h-7M12 8.5v7" /></svg>
  if (kind === 'image') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m4.5 17 4.5-4.5 3.2 3.2 2.3-2.3 5 5" /></svg>
  if (kind === 'apps') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5" /><rect x="14" y="14" width="6.5" height="6.5" rx="1.5" /></svg>
  if (kind === 'history') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7v5h5" /><path d="M5.5 17.5A8 8 0 1 0 4 12" /><path d="M12 8v4l2.5 2" /></svg>
  if (kind === 'settings') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7-.7-2h-3l-.7 2-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2h3l.7-2 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7Z" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.45 2.45 0 1 1 3.5 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01" /></svg>
}

/**
 * Phone-first workspace navigation. Four stable destinations stay reachable
 * with one thumb; less frequent search, settings and support remain grouped in
 * a small sheet instead of competing with the work itself.
 */
export function MobileWorkspaceNav({
  experience,
  authEnabled,
  feedbackContext,
  onOpenSidebar,
  onOpenGuide,
  onSelectChats,
  onSelectProjects,
  onStartProject,
  onSelectMedia,
  onSelectApps,
}: Props) {
  const { user, loading, signOut } = useAuth()
  const [sheet, setSheet] = useState<Sheet>(null)
  const titleId = useId()
  const firstActionRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const priorFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!sheet) return
    priorFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const containKeyboardFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSheet(null)
        return
      }
      if (event.key !== 'Tab' || !sheetRef.current) return
      const focusable = [...sheetRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')]
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
    window.addEventListener('keydown', containKeyboardFocus)
    requestAnimationFrame(() => firstActionRef.current?.focus())
    return () => {
      window.removeEventListener('keydown', containKeyboardFocus)
      priorFocusRef.current?.focus()
    }
  }, [sheet])

  const choose = (action: () => void) => {
    setSheet(null)
    action()
  }
  const chatsActive = experience === 'chat' || experience === 'agent'
  const createActive = experience === 'media' || experience === 'apps' || sheet === 'create'

  return (
    <>
      <nav className="mobile-workspace-nav" aria-label="Workspace">
        <button type="button" className={chatsActive ? 'active' : ''} aria-current={chatsActive ? 'page' : undefined} onClick={onSelectChats}>
          <NavIcon kind="chat" /><span>Chats</span>
        </button>
        <button type="button" className={experience === 'studio' ? 'active' : ''} aria-current={experience === 'studio' ? 'page' : undefined} onClick={onSelectProjects}>
          <NavIcon kind="project" /><span>Projects</span>
        </button>
        <button type="button" className={`mobile-create-nav${createActive ? ' active' : ''}`} aria-expanded={sheet === 'create'} onClick={() => setSheet((current) => current === 'create' ? null : 'create')}>
          <span className="mobile-create-icon"><NavIcon kind="create" /></span><span>Create</span>
        </button>
        <button type="button" className={sheet === 'you' ? 'active' : ''} aria-expanded={sheet === 'you'} onClick={() => setSheet((current) => current === 'you' ? null : 'you')}>
          <NavIcon kind="you" /><span>You</span>
        </button>
      </nav>

      {sheet ? (
        <div className="mobile-sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSheet(null)}>
          <section ref={sheetRef} className="mobile-workspace-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <div className="mobile-sheet-grab" aria-hidden="true" />
            <header>
              <div>
                <span>{sheet === 'create' ? 'Create' : 'Your workspace'}</span>
                <h2 id={titleId}>{sheet === 'create' ? 'What do you want to make?' : user?.displayName || 'AI360'}</h2>
                {sheet === 'you' && user?.email ? <small>{user.email}</small> : null}
              </div>
              <button type="button" onClick={() => setSheet(null)} aria-label={`Close ${sheet} menu`}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </header>

            {sheet === 'create' ? (
              <div className="mobile-sheet-actions mobile-create-actions">
                <button ref={firstActionRef} type="button" onClick={() => choose(onStartProject)}>
                  <span><SheetIcon kind="project" /></span><span><b>Start a project</b><small>Build lasting work from a simple brief</small></span><i aria-hidden="true">›</i>
                </button>
                <button type="button" onClick={() => choose(onSelectMedia)}>
                  <span><SheetIcon kind="image" /></span><span><b>Create images or video</b><small>Generate campaign-ready visual media</small></span><i aria-hidden="true">›</i>
                </button>
                <button type="button" onClick={() => choose(onSelectApps)}>
                  <span><SheetIcon kind="apps" /></span><span><b>Use an app or outcome</b><small>Start from a focused way to get work done</small></span><i aria-hidden="true">›</i>
                </button>
              </div>
            ) : (
              <div className="mobile-sheet-actions mobile-account-actions">
                <button ref={firstActionRef} type="button" onClick={() => choose(onOpenSidebar)}>
                  <span><SheetIcon kind="history" /></span><span><b>Search and recent chats</b><small>Find work or manage a conversation</small></span><i aria-hidden="true">›</i>
                </button>
                <Link href="/settings" onClick={() => setSheet(null)}>
                  <span><SheetIcon kind="settings" /></span><span><b>Settings</b><small>Appearance, credits and account</small></span><i aria-hidden="true">›</i>
                </Link>
                <button type="button" onClick={() => choose(onOpenGuide)}>
                  <span><SheetIcon kind="guide" /></span><span><b>Learn AI360</b><small>See the simplest way to get useful work</small></span><i aria-hidden="true">›</i>
                </button>
                <QualityFeedback variant="menu" context={feedbackContext} />
                <div className="mobile-account-row">
                  {!authEnabled || (!loading && !user) ? (
                    <><Link href="/sign-in">Sign in</Link><Link href="/sign-up" className="primary">Save your work</Link></>
                  ) : user ? (
                    <><Link href="/settings/account">Account</Link><button type="button" onClick={() => void signOut()}>Sign out</button></>
                  ) : <span className="mobile-account-loading">Checking your account…</span>}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  )
}
