import Link from 'next/link'
import { SignIn, SignUp } from '@clerk/nextjs'
import { BrandMark } from '@/components/BrandMark'
import styles from '@/app/auth.module.css'

type AuthMode = 'sign-in' | 'sign-up'

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

const clerkAppearance = {
  variables: {
    colorPrimary: '#101112',
    colorBackground: '#ffffff',
    colorForeground: '#101112',
    colorMutedForeground: '#56595c',
    colorInput: '#ffffff',
    colorInputForeground: '#101112',
    colorBorder: '#cfcdc5',
    colorRing: '#101112',
    borderRadius: '0.75rem',
    fontFamily: 'var(--font-dm), sans-serif',
  },
  options: {
    logoImageUrl: '/icon-black.png',
    animations: true,
    autoFocus: true,
    elevation: 'flush' as const,
    socialButtonsVariant: 'blockButton' as const,
    socialButtonsPlacement: 'top' as const,
    privacyPageUrl: '/privacy',
    termsPageUrl: '/terms',
  },
  elements: {
    rootBox: { width: '100%' },
    cardBox: { width: '100%', boxShadow: 'none' },
    card: { width: '100%', boxShadow: 'none', padding: 0 },
    header: { display: 'none' },
    footer: { display: 'none' },
    formButtonPrimary: { boxShadow: 'none', minHeight: '46px', fontWeight: 700, transition: 'transform 180ms ease, background 180ms ease' },
    socialButtonsBlockButton: { minHeight: '46px', boxShadow: 'none', transition: 'transform 180ms ease, border-color 180ms ease' },
    formFieldInput: { minHeight: '46px', boxShadow: 'none', transition: 'border-color 180ms ease, box-shadow 180ms ease' },
  },
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const content = CONTENT[mode]
  const authConfigured = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  )

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
              ? 'Use the same account you use across AI360.'
              : 'Start free. You can explore before deciding what to save.'}
          </p>

          <div className={styles.formFrame}>
            {authConfigured ? (
              mode === 'sign-in' ? (
                <SignIn appearance={clerkAppearance} signUpUrl="/sign-up" fallbackRedirectUrl="/app" />
              ) : (
                <SignUp appearance={clerkAppearance} signInUrl="/sign-in" fallbackRedirectUrl="/app" />
              )
            ) : (
              <div className={styles.setupNotice} role="status">
                <b>Account access is being connected</b>
                <p>You can still explore AI360 as a guest. Sign-in will appear here once the secure account service is enabled.</p>
                <Link href="/app">Continue as a guest</Link>
              </div>
            )}
          </div>

          <p className={styles.alternate}>
            {content.alternate} <Link href={content.alternateHref}>{content.alternateAction}</Link>
          </p>
          <p className={styles.legal}>By continuing, you agree to our <Link href="/terms">Terms</Link> and acknowledge our <Link href="/privacy">Privacy notice</Link>.</p>
        </div>
      </section>
    </main>
  )
}
