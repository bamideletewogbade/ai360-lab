'use client'

import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import styles from './Settings.module.css'

export function AccountSettings() {
  const { configured, loading, user, signOut } = useAuth()
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [newPassword, setNewPassword] = useState('')
  const [passwordState, setPasswordState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function sendPasswordReset() {
    if (!user?.email) return
    setResetState('sending')
    try {
      const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/settings/account')}`,
      })
      if (error) throw error
      setResetState('sent')
    } catch {
      setResetState('error')
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword.length < 8) {
      setPasswordState('error')
      return
    }
    setPasswordState('saving')
    try {
      const { error } = await getSupabaseBrowserClient().auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      setPasswordState('saved')
    } catch {
      setPasswordState('error')
    }
  }

  return (
    <>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Identity &amp; security</h2>
          <p>Your AI360 account is now managed by Supabase Auth.</p>
        </div>

        {!configured ? (
          <p className={styles.notice}>
            Account access is being connected. You can keep using AI360 as a guest in the meantime.
          </p>
        ) : loading ? (
          <div className={styles.empty}>Checking your account…</div>
        ) : user ? (
          <div className={styles.accountPanel}>
            <div className={styles.accountAvatar} aria-hidden="true">
              <span>{(user.displayName || user.email || 'A').slice(0, 1).toUpperCase()}</span>
            </div>
            <dl className={styles.accountDetails}>
              <div><dt>Name</dt><dd>{user.displayName || 'Not set yet'}</dd></div>
              <div><dt>Email</dt><dd>{user.email || 'No email on this account'}</dd></div>
              <div><dt>Account ID</dt><dd>{user.id}</dd></div>
            </dl>
            <div className={styles.accountActions}>
              <button type="button" onClick={sendPasswordReset} disabled={resetState === 'sending' || !user.email}>
                {resetState === 'sending' ? 'Sending…' : 'Send password reset'}
              </button>
              <button type="button" onClick={() => void signOut()}>Sign out</button>
            </div>
            <form className={styles.passwordForm} onSubmit={updatePassword}>
              <label>
                <span>New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  disabled={passwordState === 'saving'}
                />
              </label>
              <button type="submit" disabled={passwordState === 'saving' || newPassword.length < 8}>
                {passwordState === 'saving' ? 'Saving…' : 'Update password'}
              </button>
            </form>
            {resetState === 'sent' ? <p className={styles.notice}>Password reset email sent.</p> : null}
            {resetState === 'error' ? <p className={styles.notice}>Password reset could not be sent. Please try again.</p> : null}
            {passwordState === 'saved' ? <p className={styles.notice}>Password updated.</p> : null}
            {passwordState === 'error' ? <p className={styles.notice}>Use at least 8 characters, then try again.</p> : null}
          </div>
        ) : (
          <p className={styles.notice}>
            You are exploring in guest mode. <Link href="/sign-in">Sign in</Link> or{' '}
            <Link href="/sign-up">create an account</Link> to keep your work on every device.
          </p>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Privacy &amp; terms</h2>
          <p>How your work is handled, and the terms you are using AI360 under.</p>
        </div>
        <p className={styles.notice}>
          Read our <Link href="/privacy">Privacy Notice</Link> and <Link href="/terms">Terms of Service</Link>.
          To report a problem or request deletion, use <Link href="/feedback">Help &amp; feedback</Link> in the workspace.
        </p>
      </section>
    </>
  )
}
