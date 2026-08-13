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
                {message ? (
                  <div className={state === 'error' ? styles.authError : styles.authSuccess} role="status">
                    {message}
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
