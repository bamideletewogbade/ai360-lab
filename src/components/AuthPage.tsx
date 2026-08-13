'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { BrandMark } from '@/components/BrandMark'
import { useAuth } from '@/components/AuthProvider'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import styles from '@/app/auth.module.css'

type AuthMode = 'sign-in' | 'sign-up'
type AuthState = 'idle' | 'submitting' | 'sent' | 'error'

const CONTENT: Record<AuthMode, {
  eyebrow: string
  title: string
  copy: string
  alternate: string
  alternateHref: string
  alternateAction: string
}> = {
  'sign-in': {
    eyebrow: 'Welcome back',
    title: 'Pick up where you left off.',
    copy: 'Return to your conversations, projects and finished work.',
    alternate: 'New to AI360?',
    alternateHref: '/sign-up',
    alternateAction: 'Create a free account',
  },
  'sign-up': {
    eyebrow: 'Your workspace',
    title: 'Keep the work you create.',
    copy: 'Create an account to save your progress and continue your work whenever you are ready.',
    alternate: 'Already have an account?',
    alternateHref: '/sign-in',
    alternateAction: 'Sign in',
  },
}

/** Google's official mark. Its colours are fixed by brand policy in both themes. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  )
}

function safeNext(value: string | null, plan: string | null) {
  if (plan && /^[a-z0-9-]{2,40}$/i.test(plan)) return `/checkout?plan=${encodeURIComponent(plan)}`
  if (value?.startsWith('/') && !value.startsWith('//')) return value
  return '/app'
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const content = CONTENT[mode]
  const { configured, user, loading, refresh } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const redirectTo = useMemo(() => safeNext(params.get('next'), params.get('plan')), [params])
  const alternateHref = `${content.alternateHref}${redirectTo !== '/app' ? `?next=${encodeURIComponent(redirectTo)}` : ''}`
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [state, setState] = useState<AuthState>('idle')
  const [message, setMessage] = useState('')

  /**
   * `/auth/callback` hands failures back as a query parameter rather than
   * rendering its own error page. It is derived during render rather than
   * copied into state, so it needs no effect and cannot get out of step with
   * the URL. Anything the person then does produces its own message, which
   * takes over.
   */
  const callbackError = useMemo(() => {
    const failure = params.get('auth_error')
    if (!failure) return ''
    return failure === 'not_configured'
      ? 'Account access is not switched on yet. You can keep working as a guest.'
      : 'That sign-in could not be completed. Please try again.'
  }, [params])

  const shownMessage = message || callbackError
  const shownState: AuthState = message ? state : callbackError ? 'error' : state

  /**
   * Google is handled entirely by Supabase: it redirects to Google, Google
   * returns to Supabase, and Supabase returns to `/auth/callback`, which
   * exchanges the code for a session. On success the browser leaves this page,
   * so there is no post-success branch to write here.
   */
  async function continueWithGoogle() {
    setState('submitting')
    setMessage('')
    try {
      const { error } = await getSupabaseBrowserClient().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
          // Always let people pick an account rather than silently reusing the
          // one Google happens to be signed into, which matters on the shared
          // devices a lot of our people use.
          queryParams: { prompt: 'select_account' },
        },
      })
      if (error) throw error
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Google sign-in could not be started.')
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState('submitting')
    setMessage('')
    try {
      const supabase = getSupabaseBrowserClient()
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
      } else {
        const origin = window.location.origin
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
            data: name.trim() ? { full_name: name.trim() } : undefined,
          },
        })
        if (error) throw error
        if (!data.session) {
          setState('sent')
          setMessage('Check your email to confirm your AI360 account, then come back here to continue.')
          return
        }
      }
      await refresh()
      router.push(redirectTo)
      router.refresh()
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Account access could not be completed.')
    }
  }

  useEffect(() => {
    if (!loading && user) router.replace(redirectTo)
  }, [loading, redirectTo, router, user])

  return (
    <main className={`${styles.shell} ${mode === 'sign-in' ? styles.signIn : styles.signUp}`}>
      <Link href="/" className={styles.brand} aria-label="AI360 home">
        <BrandMark width={180} height={44} priority />
      </Link>

      <section className={styles.story}>
        <div className={styles.orbit} aria-hidden="true"><i /><i /><i /></div>
        <div className={styles.storyContent}>
          <p className={styles.kicker}>One place to move forward</p>
          <h1>{content.title}</h1>
          <p className={styles.lead}>{content.copy}</p>

          <div className={styles.benefits}>
            <article><span>01</span><div><b>Save your progress</b><small>Keep conversations, projects and useful files together.</small></div></article>
            <article><span>02</span><div><b>Continue anywhere</b><small>Move between your phone and computer without starting again.</small></div></article>
            <article><span>03</span><div><b>Make it yours</b><small>Build a workspace around what you want to learn or accomplish.</small></div></article>
          </div>

          <div className={styles.audiences} aria-label="Ways people use AI360">
            <span>Learn</span><span>Work</span><span>Create</span><span>Organise</span><span>Serve</span>
          </div>

          <div className={styles.continuityCard} aria-hidden="true">
            <span className={styles.continuityMark}>AI</span>
            <span><b>Your work is ready</b><small>Ideas, files and progress stay connected</small></span>
            <i>Ready</i>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelInner}>
          <div className={styles.journey} aria-label="Account setup progress">
            <span className={styles.done}>Explore</span><i />
            <span className={styles.current}>{mode === 'sign-in' ? 'Sign in' : 'Create account'}</span><i />
            <span>Workspace</span>
          </div>
          <p className={styles.eyebrow}>{content.eyebrow}</p>
          <h2>{mode === 'sign-in' ? 'Sign in to AI360' : 'Create your AI360 account'}</h2>
          <p className={styles.panelCopy}>
            {mode === 'sign-in'
              ? 'Use your AI360 account to keep projects, credits and finished work connected.'
              : 'Start free. Your work stays with the same Supabase-backed AI360 account.'}
          </p>

          <div className={styles.formFrame}>
            {configured ? (
              <>
              <button
                type="button"
                className={styles.googleButton}
                onClick={continueWithGoogle}
                disabled={state === 'submitting'}
              >
                <GoogleMark />
                <span>{mode === 'sign-in' ? 'Sign in with Google' : 'Sign up with Google'}</span>
              </button>

              <div className={styles.authDivider}><span>or use your email</span></div>

              <form className={styles.authForm} onSubmit={submit}>
                {mode === 'sign-up' ? (
                  <label>
                    <span>Your name</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                      maxLength={80}
                      disabled={state === 'submitting'}
                      placeholder="Ama Mensah"
                    />
                  </label>
                ) : null}
                <label>
                  <span>Email address</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                    disabled={state === 'submitting'}
                    placeholder="you@example.com"
                  />
                </label>
                <label>
                  <span>Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                    minLength={8}
                    required
                    disabled={state === 'submitting'}
                    placeholder="At least 8 characters"
                  />
                </label>
                {shownMessage ? (
                  <div className={shownState === 'error' ? styles.authError : styles.authSuccess} role="status">
                    {shownMessage}
                  </div>
                ) : null}
                <button type="submit" disabled={state === 'submitting' || state === 'sent'}>
                  {state === 'submitting'
                    ? mode === 'sign-in' ? 'Signing in…' : 'Creating account…'
                    : mode === 'sign-in' ? 'Sign in' : 'Create account'}
                </button>
                {mode === 'sign-in' ? (
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    disabled={state === 'submitting' || !email.trim()}
                    onClick={async () => {
                      setState('submitting')
                      setMessage('')
                      try {
                        const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(), {
                          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/settings/account')}`,
                        })
                        if (error) throw error
                        setState('sent')
                        setMessage('Password reset sent. Check your email.')
                      } catch (error) {
                        setState('error')
                        setMessage(error instanceof Error ? error.message : 'Password reset could not be sent.')
                      }
                    }}
                  >
                    Send password reset
                  </button>
                ) : null}
              </form>
              </>
            ) : (
              <div className={styles.setupNotice} role="status">
                <b>Account access is being connected</b>
                <p>Add your Supabase project URL and publishable key to enable sign-in. You can still explore AI360 as a guest.</p>
                <Link href="/app">Continue as a guest</Link>
              </div>
            )}
          </div>

          <p className={styles.alternate}>
            {content.alternate} <Link href={alternateHref}>{content.alternateAction}</Link>
          </p>
          <p className={styles.legal}>By continuing, you agree to our <Link href="/terms">Terms</Link> and acknowledge our <Link href="/privacy">Privacy notice</Link>.</p>
        </div>
      </section>
    </main>
  )
}
