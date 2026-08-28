'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { BrandMark } from '@/components/BrandMark'
import { useAuth } from '@/components/AuthProvider'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import styles from './PilotWelcome.module.css'

export function PilotWelcome({ next }: { next: string }) {
  const router = useRouter()
  const { configured, loading, user } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password.length < 8) {
      setMessage('Use at least 8 characters.')
      setState('error')
      return
    }
    if (password !== confirmation) {
      setMessage('The two passwords do not match.')
      setState('error')
      return
    }

    setState('saving')
    setMessage('')
    const { error } = await getSupabaseBrowserClient().auth.updateUser({ password })
    if (error) {
      setMessage('Your password could not be saved. Please try again or skip this step for now.')
      setState('error')
      return
    }
    router.replace(next)
    router.refresh()
  }

  function continueWithoutPassword() {
    router.replace(next)
    router.refresh()
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="welcome-title">
        <BrandMark kind="wordmark" width={142} height={38} alt="AI360" />
        <div className={styles.progress} aria-label="Account setup progress">
          <span className={styles.done}>Email confirmed</span><i /><span>Password</span><i /><span>Workspace</span>
        </div>

        {loading ? (
          <div className={styles.status}>Preparing your account…</div>
        ) : !configured || !user ? (
          <div className={styles.status}>
            <h1 id="welcome-title">This link needs a fresh sign-in</h1>
            <p>Open the private link in your invitation again. If it has expired, sign in with your email to continue.</p>
            <Link href="/sign-in">Go to sign in</Link>
          </div>
        ) : (
          <>
            <p className={styles.kicker}>Your pilot access is ready</p>
            <h1 id="welcome-title">Welcome{user.displayName ? `, ${user.displayName.split(/\s+/)[0]}` : ''}.</h1>
            <p className={styles.intro}>Your free testing credits are in your account. Choose a password now so you can sign in easily next time.</p>

            <form className={styles.form} onSubmit={savePassword}>
              <label>
                <span>Create a password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  disabled={state === 'saving'}
                />
              </label>
              <label>
                <span>Confirm your password</span>
                <input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Type it again"
                  disabled={state === 'saving'}
                />
              </label>
              {message ? <p className={styles.error} role="alert">{message}</p> : null}
              <button type="submit" disabled={state === 'saving' || password.length < 8 || confirmation.length < 8}>
                {state === 'saving' ? 'Saving…' : 'Save password and continue'}
              </button>
            </form>

            <button className={styles.skip} type="button" onClick={continueWithoutPassword} disabled={state === 'saving'}>
              Skip for now
            </button>
            <p className={styles.note}>You can add or change your password later in Account Settings.</p>
          </>
        )}
      </section>
    </main>
  )
}
