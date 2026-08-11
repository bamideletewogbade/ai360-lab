'use client'

import { useState } from 'react'
import Link from 'next/link'
import { OrganizationSwitcher, Show, UserButton } from '@clerk/nextjs'
import { SettingsModal } from '@/components/SettingsModal'

const TEAM_WORKSPACES_ENABLED = process.env.NEXT_PUBLIC_AI360_TEAM_WORKSPACES === 'true'

export function AccountControls({ enabled }: { enabled: boolean }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [initialTab, setInitialTab] = useState<'general' | 'billing' | 'account'>('billing')

  if (!enabled) return (
    <>
      <button
        type="button"
        className="icon-button settings-trigger-btn"
        onClick={() => { setInitialTab('billing'); setSettingsOpen(true) }}
        title="Settings & Workspace"
        aria-label="Settings"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <Link href="/sign-in" className="guest-badge" title="Sign in to save your work across devices">
        <span className="guest-status" /> Guest <b>Save work</b>
      </Link>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} initialTab={initialTab} />
    </>
  )

  return (
    <div className="account-controls">
      <Show when="signed-out"><SignedOutControls /></Show>
      <Show when="signed-in">
        {TEAM_WORKSPACES_ENABLED ? (
          <OrganizationSwitcher
            hidePersonal={false}
            afterCreateOrganizationUrl="/app"
            afterSelectOrganizationUrl="/app"
            afterSelectPersonalUrl="/app"
            appearance={{ elements: { organizationSwitcherTrigger: { minHeight: 32 } } }}
          />
        ) : null}
        <button
          type="button"
          className="icon-button settings-trigger-btn"
          onClick={() => { setInitialTab('billing'); setSettingsOpen(true) }}
          title="Settings & Workspace"
          aria-label="Settings"
          style={{
            background: 'var(--white, #fff)',
            border: '1px solid var(--line, #e2ded4)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--black, #101112)',
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <UserButton
          appearance={{
            options: { shimmer: true },
            elements: { avatarBox: { width: 32, height: 32 }, userButtonTrigger: { transition: 'transform 180ms ease' } },
          }}
          showName={false}
        />
        <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} initialTab={initialTab} />
      </Show>
    </div>
  )
}

function SignedOutControls() {
  return (
    <div className="signed-out-controls">
      <Link href="/sign-in" className="auth-sign-in">Sign in</Link>
      <Link href="/sign-up" className="auth-sign-up">Save your work</Link>
    </div>
  )
}
