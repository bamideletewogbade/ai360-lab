'use client'

import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'

function initials(name: string | null, email: string | null) {
  const source = name || email || 'AI360'
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return (parts[0]?.[0] || 'A').toUpperCase() + (parts[1]?.[0] || '').toUpperCase()
}

/**
 * Identity only.
 *
 * Supabase Auth now owns the session; AI360 owns the presentation. The control
 * stays intentionally small so the profile icon remains far right in the
 * workspace top bar.
 */
export function AccountControls({ enabled }: { enabled: boolean }) {
  const { user, loading, signOut } = useAuth()

  if (!enabled) return (
    <Link href="/sign-in" className="guest-badge" title="Sign in to keep your work with your account">
      <span className="guest-status" /> Guest <b>Save work</b>
    </Link>
  )

  if (loading) return <span className="account-loading" aria-label="Checking account" />
  if (!user) return <SignedOutControls />

  return (
    <details className="account-menu">
      <summary className="account-avatar" aria-label="Your AI360 account">
        <span>{initials(user.displayName, user.email)}</span>
      </summary>
      <div className="account-menu-popover">
        <div className="account-menu-person">
          <b>{user.displayName || 'AI360 account'}</b>
          {user.email ? <small>{user.email}</small> : null}
        </div>
        <Link href="/settings/account">Account settings</Link>
        <button type="button" onClick={() => void signOut()}>Sign out</button>
      </div>
    </details>
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
