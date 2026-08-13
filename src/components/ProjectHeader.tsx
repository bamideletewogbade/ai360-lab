'use client'

import type { ReactNode } from 'react'

export type ProjectSaveState = 'local' | 'saving' | 'saved' | 'unavailable'

const SAVE_LABEL: Record<ProjectSaveState, string> = {
  local: 'Saved on this device',
  saving: 'Saving',
  saved: 'Saved',
  unavailable: 'Saving paused',
}

/**
 * The bar that sits above every project.
 *
 * Opening a project used to be a one-way door: neither the empty nor the active
 * project view offered a way back to the list, and the sidebar entry does not
 * reset the view, so the only escape was another workspace. A single persistent
 * back control fixes that, and it gives every project the same orientation —
 * where you are, what it is called, and whether the work is safely stored.
 */
export function ProjectHeader({
  name,
  onBack,
  saveState,
  signedIn,
  children,
}: {
  name: string
  onBack: () => void
  saveState: ProjectSaveState
  signedIn: boolean
  children?: ReactNode
}) {
  return (
    <div className="project-bar">
      <button type="button" className="project-bar-back" onClick={onBack}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Projects
      </button>

      <span className="project-bar-name" title={name}>{name}</span>

      <span className="project-bar-side">
        {/* A guest's work is real, but it lives on this device only. Saying so
            here is kinder than discovering it on a second phone. */}
        <span className={`project-bar-save ${signedIn ? saveState : 'local'}`}>
          <i aria-hidden="true" />
          {signedIn ? SAVE_LABEL[saveState] : SAVE_LABEL.local}
        </span>
        {children}
      </span>
    </div>
  )
}
